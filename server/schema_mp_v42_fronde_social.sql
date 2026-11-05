-- Starbyte — v42 : Grande Fronde, suite (décisions d'Adrien, 05/11/2026). À exécuter après schema_mp_v41_grande_fronde.sql.
-- Peut être relancé sans risque.
--   · une course tous les 21 jours (calendrier tenu par la fonction fronde-tick) ; paris ouverts 3 jours avant le départ ;
--   · fil des paris (nom du commandant, ou « un commandant » s'il parie anonymement), classement de l'édition et de la
--     saison après l'arrivée, tribune des commandants (discussion par édition) ;
--   · courses d'essai accélérées, visibles par un seul compte (administrateur), pour valider avant une vraie édition.

-- ── colonnes ──
alter table public.fronde_editions add column if not exists rate numeric not null default 1;        -- accélération (essai)
alter table public.fronde_editions add column if not exists opens_at timestamptz;                   -- ouverture des paris
alter table public.fronde_editions add column if not exists test_user uuid references auth.users (id) on delete cascade;   -- essai : visible par lui seul
do $$ begin
  alter table public.fronde_editions add constraint fronde_rate_range check (rate >= 1 and rate <= 2000);
exception when duplicate_object then null; end $$;
alter table public.fronde_bets add column if not exists anonymous boolean not null default false;

-- ── administrateurs de la Grande Fronde (courses d'essai) ──
create table if not exists public.fronde_admins (user_id uuid primary key references auth.users (id) on delete cascade);
alter table public.fronde_admins enable row level security;
revoke all on public.fronde_admins from public, anon, authenticated;
insert into public.fronde_admins (user_id) select id from auth.users where lower(email) = 'adrien@ademus.ch' on conflict do nothing;

-- ── tribune des commandants : une discussion par édition ──
create table if not exists public.fronde_chat (
  id uuid primary key default gen_random_uuid(),
  edition_id text not null references public.fronde_editions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  pseudo text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists fronde_chat_edition_idx on public.fronde_chat (edition_id, created_at desc);
create index if not exists fronde_chat_user_idx on public.fronde_chat (user_id, created_at desc);
alter table public.fronde_chat enable row level security;
revoke all on public.fronde_chat from public, anon, authenticated;

-- une édition est visible par un joueur : publique, ou essai qui lui appartient
create or replace function public._fronde_visible(p_id text, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.fronde_editions where id = p_id and (test_user is null or test_user = p_user));
$$;
revoke all on function public._fronde_visible(text, uuid) from public, anon, authenticated;
create or replace function public._fronde_pseudo(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select pseudo from public.worlds where user_id = p_user limit 1), 'Commandant');
$$;
revoke all on function public._fronde_pseudo(uuid) from public, anon, authenticated;

-- ── règlement : la fin tient compte de l'accélération ──
create or replace function public._fronde_settle(p_id text)
returns void language plpgsql security definer set search_path = public as $$
declare e public.fronde_editions; s public.fronde_secrets; total bigint; win bigint; pool bigint;
begin
  select * into e from public.fronde_editions where id = p_id for update;
  if not found or e.status <> 'annoncee' then return; end if;
  select * into s from public.fronde_secrets where edition_id = p_id;
  if not found then return; end if;
  if now() < e.start_at + make_interval(secs => (s.result->>'t1')::float8 / e.rate) then return; end if;   -- pas encore arrivée
  select coalesce(sum(stake), 0) into total from public.fronde_bets where edition_id = p_id;
  select coalesce(sum(stake), 0) into win from public.fronde_bets where edition_id = p_id and racer = s.result->>'winner';
  if total > 0 and win = 0 then
    insert into public.fronde_payouts (edition_id, user_id, amount, kind)
      select p_id, user_id, sum(stake), 'remboursement' from public.fronde_bets where edition_id = p_id group by user_id
      on conflict do nothing;
  elsif total > 0 then
    pool := floor(total * (100 - e.house_pct) / 100);
    insert into public.fronde_payouts (edition_id, user_id, amount, kind)
      select p_id, user_id, floor(sum(stake)::numeric * pool / win), 'gain'
        from public.fronde_bets where edition_id = p_id and racer = s.result->>'winner' group by user_id
      on conflict do nothing;
  end if;
  update public.fronde_editions set status = 'reglee', seed = s.seed, result = s.result, settled_at = now() where id = p_id;
end $$;
revoke all on function public._fronde_settle(text) from public, anon, authenticated;

-- ── lecture d'une édition ──
-- choix par défaut : mon essai en cours (s'il y en a un), sinon l'édition publique qui court, sinon la prochaine, sinon la
-- dernière réglée depuis moins de 7 jours. Temps de course = (maintenant − départ) × rate (le compte à rebours reste réel).
create or replace function public.mp_fronde_edition(p_id text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); e public.fronde_editions; s public.fronde_secrets; el float8; st text; rv jsonb; nxt boolean;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if p_id is not null and p_id !~ '^[A-Za-z0-9_-]{1,32}$' then raise exception 'bad_edition'; end if;
  if p_id is null then
    select * into e from public.fronde_editions
     where test_user = me and (status = 'annoncee' or settled_at > now() - interval '2 hours')
     order by created_at desc limit 1;
    if e.id is null then
      select * into e from public.fronde_editions
       where test_user is null and (status = 'annoncee' or settled_at > now() - interval '7 days')
       order by case when status = 'annoncee' and start_at <= now() then 0 when status = 'annoncee' then 1 else 2 end,
                case when status = 'annoncee' and start_at > now() then start_at end asc nulls last, start_at desc
       limit 1;
    end if;
  else
    select * into e from public.fronde_editions where id = p_id and (test_user is null or test_user = me);
  end if;
  nxt := not exists (select 1 from public.fronde_editions where status = 'annoncee' and test_user is null);
  if e.id is null then return jsonb_build_object('edition', null, 'next_needed', nxt, 'is_admin', exists (select 1 from public.fronde_admins where user_id = me)); end if;
  perform public._fronde_settle(e.id);
  select * into e from public.fronde_editions where id = e.id;
  select * into s from public.fronde_secrets where edition_id = e.id;
  el := extract(epoch from (now() - e.start_at));
  if el > 0 then el := el * e.rate; end if;
  st := case when e.status <> 'annoncee' then e.status when el < 0 then 'annoncee' else 'en_course' end;
  select coalesce(jsonb_agg(x order by (x->>'t')::float8), '[]'::jsonb) into rv
    from jsonb_array_elements(coalesce(s.reveals, '[]'::jsonb)) x
   where e.status = 'reglee' or (x->>'t')::float8 <= el;
  return jsonb_build_object(
    'edition', jsonb_build_object('id', e.id, 'name', e.name, 'systems', e.systems, 'racers', e.racers, 'pilot', e.pilot,
       'start_at', e.start_at, 'opens_at', coalesce(e.opens_at, e.created_at), 'nominal_end_at', e.nominal_end_at, 'seed_hash', e.seed_hash,
       'seed', e.seed, 'result', e.result, 'house_pct', e.house_pct, 'stake_cap', e.stake_cap, 'engine', e.engine, 'test', e.test_user is not null),
    'state', st, 'elapsed', el, 'server_now', now(), 'rate', e.rate,
    'bets_open', e.status = 'annoncee' and now() < e.start_at and now() >= coalesce(e.opens_at, e.created_at),
    'reveals', rv,
    'pools', public._fronde_pools(e.id),
    'my_bets', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'racer', racer, 'stake', stake, 'at', placed_at, 'anonymous', anonymous) order by placed_at)
                          from public.fronde_bets where edition_id = e.id and user_id = me), '[]'::jsonb),
    'my_payout', (select jsonb_build_object('amount', amount, 'kind', kind, 'claimed', claimed_at is not null)
                    from public.fronde_payouts where edition_id = e.id and user_id = me),
    'next_needed', nxt,
    'is_admin', exists (select 1 from public.fronde_admins where user_id = me));
end $$;
revoke all on function public.mp_fronde_edition(text) from public, anon;
grant execute on function public.mp_fronde_edition(text) to authenticated;

-- ── parier : seulement pendant la fenêtre (3 jours avant le départ → départ) ; anonyme au choix ──
drop function if exists public.mp_fronde_bet(text, text, int, uuid);
create or replace function public.mp_fronde_bet(p_edition text, p_racer text, p_stake int, p_nonce uuid default null, p_anonymous boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); e public.fronde_editions; mine bigint; cg numeric; saved timestamptz; after bigint; rid uuid;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if coalesce(p_edition, '') !~ '^[A-Za-z0-9_-]{1,32}$' then raise exception 'bad_edition'; end if;
  if coalesce(p_racer, '') !~ '^[a-z0-9_-]{1,32}$' then raise exception 'bad_racer'; end if;
  if p_stake is null or p_stake < 1 then raise exception 'bad_stake'; end if;
  select * into e from public.fronde_editions where id = p_edition and (test_user is null or test_user = me) for share;
  if not found then raise exception 'no_edition'; end if;
  if e.status <> 'annoncee' or now() >= e.start_at then raise exception 'bets_closed'; end if;
  if now() < coalesce(e.opens_at, e.created_at) then raise exception 'bets_not_open'; end if;
  if not exists (select 1 from jsonb_array_elements(e.racers) r where r->>'id' = p_racer) then raise exception 'bad_racer'; end if;
  perform pg_advisory_xact_lock(hashtext('fronde_bet:' || me::text));
  select id into rid from public.fronde_bets where user_id = me and client_nonce = p_nonce;
  if rid is not null then
    return jsonb_build_object('ok', true, 'id', rid, 'racer', p_racer, 'stake', p_stake, 'repeat', true,
      'my_total', (select coalesce(sum(stake), 0) from public.fronde_bets where edition_id = p_edition and user_id = me), 'pools', public._fronde_pools(p_edition));
  end if;
  if exists (select 1 from public.fronde_bets where user_id = me and placed_at > now() - interval '2 seconds') then raise exception 'too_fast'; end if;
  select coalesce(sum(stake), 0) into mine from public.fronde_bets where edition_id = p_edition and user_id = me;
  if mine + p_stake > e.stake_cap then raise exception 'over_cap'; end if;
  select (data->'savegame'->>'credits')::numeric, updated_at into cg, saved from public.saves where user_id = me order by updated_at desc limit 1;
  if cg is null then raise exception 'no_save'; end if;
  select coalesce(sum(stake), 0) into after from public.fronde_bets where user_id = me and placed_at > saved;
  if cg - after < p_stake then raise exception 'not_enough_credits'; end if;
  insert into public.fronde_bets (edition_id, user_id, racer, stake, client_nonce, anonymous)
    values (p_edition, me, p_racer, p_stake, p_nonce, coalesce(p_anonymous, false)) returning id into rid;
  return jsonb_build_object('ok', true, 'id', rid, 'racer', p_racer, 'stake', p_stake, 'my_total', mine + p_stake, 'pools', public._fronde_pools(p_edition));
end $$;
revoke all on function public.mp_fronde_bet(text, text, int, uuid, boolean) from public, anon;
grant execute on function public.mp_fronde_bet(text, text, int, uuid, boolean) to authenticated;

-- ── fil des paris : les 40 derniers (nom du commandant, ou anonyme) ──
create or replace function public.mp_fronde_feed(p_edition text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if not public._fronde_visible(p_edition, me) then raise exception 'no_edition'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('at', b.placed_at, 'racer', b.racer, 'stake', b.stake, 'mine', b.user_id = me,
            'who', case when b.anonymous then null else public._fronde_pseudo(b.user_id) end) order by b.placed_at desc)
     from (select * from public.fronde_bets where edition_id = p_edition order by placed_at desc limit 40) b), '[]'::jsonb);
end $$;
revoke all on function public.mp_fronde_feed(text) from public, anon;
grant execute on function public.mp_fronde_feed(text) to authenticated;

-- ── classement : meilleurs gains de l'édition (après l'arrivée) et de la saison (éditions publiques des 126 derniers jours,
--    soit 6 courses) ; anonyme si tous ses paris de l'édition l'étaient ; ma place ──
create or replace function public.mp_fronde_ranking(p_edition text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); ed jsonb; season jsonb;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if not public._fronde_visible(p_edition, me) then raise exception 'no_edition'; end if;
  with per as (
    select b.user_id, sum(b.stake) staked, bool_and(b.anonymous) anon,
           coalesce((select amount from public.fronde_payouts p where p.edition_id = p_edition and p.user_id = b.user_id and p.kind = 'gain'), 0) won
      from public.fronde_bets b join public.fronde_editions e on e.id = b.edition_id and e.status = 'reglee'
     where b.edition_id = p_edition group by b.user_id)
  select coalesce(jsonb_agg(jsonb_build_object('who', case when anon then null else public._fronde_pseudo(user_id) end, 'won', won, 'net', won - staked, 'mine', user_id = me) order by won - staked desc), '[]'::jsonb)
    into ed from (select * from per where won > 0 order by won - staked desc limit 10) x;
  with eds as (select id from public.fronde_editions where test_user is null and status = 'reglee' and start_at > now() - interval '126 days'),
  per as (
    select b.user_id, sum(b.stake) staked, bool_and(b.anonymous) anon, count(distinct b.edition_id) n,
           coalesce((select sum(amount) from public.fronde_payouts p where p.user_id = b.user_id and p.kind = 'gain' and p.edition_id in (select id from eds)), 0) won
      from public.fronde_bets b where b.edition_id in (select id from eds) group by b.user_id)
  select coalesce(jsonb_agg(jsonb_build_object('who', case when anon then null else public._fronde_pseudo(user_id) end, 'net', won - staked, 'editions', n, 'mine', user_id = me) order by won - staked desc), '[]'::jsonb)
    into season from (select * from per order by won - staked desc limit 10) x;
  return jsonb_build_object('edition', ed, 'season', season);
end $$;
revoke all on function public.mp_fronde_ranking(text) from public, anon;
grant execute on function public.mp_fronde_ranking(text) to authenticated;

-- ── tribune des commandants ──
create or replace function public.mp_fronde_chat(p_edition text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if not public._fronde_visible(p_edition, me) then raise exception 'no_edition'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'pseudo', pseudo, 'body', body, 'at', created_at, 'mine', user_id = me) order by created_at)
     from (select * from public.fronde_chat where edition_id = p_edition order by created_at desc limit 80) c), '[]'::jsonb);
end $$;
revoke all on function public.mp_fronde_chat(text) from public, anon;
grant execute on function public.mp_fronde_chat(text) to authenticated;

-- 280 caractères, 1 message / 8 s et 60 / heure par joueur ; un commandant (partie avec un monde) seulement
create or replace function public.mp_fronde_chat_post(p_edition text, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); nm text; b text; n int; rid uuid;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if coalesce(p_edition, '') !~ '^[A-Za-z0-9_-]{1,32}$' or not public._fronde_visible(p_edition, me) then raise exception 'no_edition'; end if;
  b := left(btrim(regexp_replace(coalesce(p_body, ''), '[\u0000-\u001f\u007f]', ' ', 'g')), 280);
  if length(b) < 1 then raise exception 'empty'; end if;
  select pseudo into nm from public.worlds where user_id = me limit 1;
  if nm is null then raise exception 'no_world'; end if;
  if exists (select 1 from public.fronde_chat where user_id = me and created_at > now() - interval '8 seconds') then raise exception 'too_fast'; end if;
  select count(*) into n from public.fronde_chat where user_id = me and created_at > now() - interval '1 hour';
  if n >= 60 then raise exception 'too_many'; end if;
  insert into public.fronde_chat (edition_id, user_id, pseudo, body) values (p_edition, me, nm, b) returning id into rid;
  return jsonb_build_object('id', rid, 'pseudo', nm, 'body', b, 'at', now(), 'mine', true);
end $$;
revoke all on function public.mp_fronde_chat_post(text, text) from public, anon;
grant execute on function public.mp_fronde_chat_post(text, text) to authenticated;
-- modération (SQL Editor) : delete from public.fronde_chat where id = '…';

-- ── vérifications ──
create or replace function public.verifier_fronde()
returns table (controle text, etat text) language sql security definer set search_path = public as $$
  select 'tables fermées aux joueurs', case when bool_and(not has_table_privilege('authenticated', t, 'select')) then 'ok' else 'ÉCHEC' end
    from unnest(array['public.fronde_editions', 'public.fronde_secrets', 'public.fronde_bets', 'public.fronde_payouts', 'public.fronde_chat', 'public.fronde_admins']) t
  union all
  select 'fonctions publiques ouvertes aux joueurs connectés', case when bool_and(has_function_privilege('authenticated', f, 'execute')) then 'ok' else 'ÉCHEC' end
    from unnest(array['public.mp_fronde_edition(text)', 'public.mp_fronde_bet(text,text,integer,uuid,boolean)', 'public.mp_fronde_claim(text)', 'public.mp_fronde_mine()',
                      'public.mp_fronde_feed(text)', 'public.mp_fronde_ranking(text)', 'public.mp_fronde_chat(text)', 'public.mp_fronde_chat_post(text,text)']) f
  union all
  select 'fonctions internes fermées', case when bool_and(not has_function_privilege('authenticated', f, 'execute')) then 'ok' else 'ÉCHEC' end
    from unnest(array['public._fronde_settle(text)', 'public.fronde_cancel(text)', 'public._fronde_pools(text)', 'public._fronde_visible(text,uuid)', 'public._fronde_pseudo(uuid)']) f
  union all
  select 'empreintes de graine cohérentes (éditions réglées)', case when bool_and(seed_hash = encode(extensions.digest(seed, 'sha256'), 'hex')) is not false then 'ok' else 'ÉCHEC' end
    from public.fronde_editions where seed is not null
  union all
  select 'administrateur de la Grande Fronde déclaré', case when exists (select 1 from public.fronde_admins) then 'ok' else 'ÉCHEC (compte introuvable)' end;
$$;
revoke all on function public.verifier_fronde() from public, anon, authenticated;
