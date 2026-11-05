-- Starbyte — v41 : « La Grande Fronde » — course interstellaire mensuelle commune à tous les joueurs, et paris.
-- Plan : docs/grande-fronde/PHASE3_PLAN_SERVEUR.md (dépôt catabyte-starbyte). À exécuter dans l'éditeur SQL de Supabase
-- après schema_mp_v40_mur_du_bar.sql. Peut être relancé sans risque.
--
-- Principe
--   · Une édition est créée par la fonction serveur fronde-tick (moteur de course partagé) : graine aléatoire tenue
--     secrète, course simulée une fois, plans des pilotes et résultat rangés dans fronde_secrets (table fermée).
--     Publiés avec l'édition : parcours, racers, heure de départ, durée annoncée, EMPREINTE de la graine (sha-256).
--   · Pendant la course, mp_fronde_edition ne rend que les plans des pilotes déjà entrés dans leur système
--     (départ + t ≤ maintenant) : le jeu reconstruit les trajectoires avec le même moteur ; l'avenir reste caché.
--   · Paris « vainqueur » en pari mutuel, en crédits galactiques (CG), ouverts jusqu'au départ, plafond par joueur et
--     par édition (5 000 CG), part de la maison 5 %. Les CG vivent dans la partie locale : le jeu les retire quand le
--     serveur accepte la mise ; le serveur vérifie la vraisemblance avec la dernière sauvegarde reçue.
--   · À l'arrivée (premier appel après la fin), règlement automatique : gains inscrits dans fronde_payouts, graine et
--     résultat publiés. Le jeu encaisse une seule fois (mp_fronde_claim) et ajoute les CG à la partie.
--   · Vérifiable : sha-256(graine) = empreinte publiée avant les paris ; la course se rejoue avec le moteur public.

create extension if not exists pgcrypto with schema extensions;   -- déjà présente sur Supabase (schéma extensions)

-- ── éditions (publiques, lues par les fonctions) ──
create table if not exists public.fronde_editions (
  id             text primary key,                     -- ex. '2026-12'
  name           text not null,
  systems        jsonb not null,                       -- parcours (données publiques des systèmes, dans l'ordre)
  racers         jsonb not null,                       -- racers engagés (profils publics)
  pilot          jsonb not null default '{}'::jsonb,   -- format (legHours, entryR, nominalHours…), sans la graine
  start_at       timestamptz not null,                 -- départ = fermeture des paris
  nominal_end_at timestamptz not null,                 -- fin annoncée (la vraie fin reste secrète jusqu'à l'arrivée)
  seed_hash      text not null,                        -- sha-256 (hex) de la graine, publié avant les paris
  seed           text,                                 -- révélée à l'arrivée
  result         jsonb,                                -- publié à l'arrivée : { winner, finish: { racer: t }, t1 }
  house_pct      numeric not null default 5 check (house_pct >= 0 and house_pct <= 20),
  stake_cap      int not null default 5000 check (stake_cap > 0),
  status         text not null default 'annoncee' check (status in ('annoncee', 'reglee', 'annulee')),
  engine         text,                                 -- empreinte du moteur qui a simulé l'édition
  created_at     timestamptz not null default now(),
  settled_at     timestamptz
);
create index if not exists fronde_editions_start_idx on public.fronde_editions (start_at desc);

-- ── secrets (fermée : seules les fonctions serveur la lisent) ──
create table if not exists public.fronde_secrets (
  edition_id text primary key references public.fronde_editions (id) on delete cascade,
  seed       text not null,
  reveals    jsonb not null,                           -- [{ racer, sys, t, plan }] : tous les plans, dans l'ordre des entrées
  result     jsonb not null                            -- { winner, finish: { racer: t }, t1 }
);

-- ── paris et gains ──
create table if not exists public.fronde_bets (
  id         uuid primary key default gen_random_uuid(),
  edition_id text not null references public.fronde_editions (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  racer      text not null,
  stake      int not null check (stake > 0),
  placed_at  timestamptz not null default now()
);
create index if not exists fronde_bets_edition_idx on public.fronde_bets (edition_id, racer);
create index if not exists fronde_bets_user_idx on public.fronde_bets (user_id, placed_at desc);

create table if not exists public.fronde_payouts (
  edition_id text not null references public.fronde_editions (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  amount     int not null check (amount >= 0),
  kind       text not null check (kind in ('gain', 'remboursement')),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  primary key (edition_id, user_id)
);

alter table public.fronde_editions enable row level security;
alter table public.fronde_secrets  enable row level security;
alter table public.fronde_bets     enable row level security;
alter table public.fronde_payouts  enable row level security;
revoke all on public.fronde_editions, public.fronde_secrets, public.fronde_bets, public.fronde_payouts from public, anon, authenticated;

-- ── règlement (interne, idempotent) : appelé paresseusement par les fonctions publiques après l'arrivée ──
-- Pari mutuel : cagnotte = toutes les mises ; la maison prélève house_pct ; le reste va aux parieurs du vainqueur au
-- prorata de leurs mises (arrondi à l'unité inférieure). Personne n'a misé sur le vainqueur : tout le monde est
-- remboursé intégralement (pas de prélèvement).
create or replace function public._fronde_settle(p_id text)
returns void language plpgsql security definer set search_path = public as $$
declare e public.fronde_editions; s public.fronde_secrets; total bigint; win bigint; pool bigint;
begin
  select * into e from public.fronde_editions where id = p_id for update;
  if not found or e.status <> 'annoncee' then return; end if;
  select * into s from public.fronde_secrets where edition_id = p_id;
  if not found then return; end if;
  if now() < e.start_at + make_interval(secs => (s.result->>'t1')::float8) then return; end if;   -- pas encore arrivée
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

-- annulation (SQL Editor seulement) : toutes les mises remboursées, édition close
create or replace function public.fronde_cancel(p_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.fronde_editions where id = p_id and status = 'annoncee' for update;
  if not found then raise exception 'not_open'; end if;
  insert into public.fronde_payouts (edition_id, user_id, amount, kind)
    select p_id, user_id, sum(stake), 'remboursement' from public.fronde_bets where edition_id = p_id group by user_id
    on conflict do nothing;
  update public.fronde_editions set status = 'annulee', settled_at = now() where id = p_id;
end $$;
revoke all on function public.fronde_cancel(text) from public, anon, authenticated;

-- ── cagnotte par racer (publique : les cotes du pari mutuel) ──
create or replace function public._fronde_pools(p_id text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('total', coalesce(sum(stake), 0), 'by_racer',
         coalesce((select jsonb_object_agg(racer, s) from (select racer, sum(stake) s from public.fronde_bets where edition_id = p_id group by racer) x), '{}'::jsonb),
         'bettors', count(distinct user_id))
    from public.fronde_bets where edition_id = p_id;
$$;
revoke all on function public._fronde_pools(text) from public, anon, authenticated;

-- ── lecture d'une édition (par défaut : celle qui court, sinon la prochaine, sinon la dernière réglée depuis moins de 7 jours) ──
-- rend : édition publique, état, temps écoulé, plans publiés jusqu'à maintenant, cagnotte, mes paris, mon gain.
-- next_needed = true quand aucune édition n'est à venir ni en cours : le jeu appelle alors fronde-tick pour la créer.
create or replace function public.mp_fronde_edition(p_id text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); e public.fronde_editions; s public.fronde_secrets; el float8; st text; rv jsonb; nxt boolean;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if p_id is not null and p_id !~ '^[A-Za-z0-9_-]{1,32}$' then raise exception 'bad_edition'; end if;
  if p_id is null then
    -- priorité : celle qui court, puis la prochaine, puis la dernière réglée (7 jours)
    select * into e from public.fronde_editions
     where status = 'annoncee' or settled_at > now() - interval '7 days'
     order by case when status = 'annoncee' and start_at <= now() then 0 when status = 'annoncee' then 1 else 2 end,
              case when status = 'annoncee' and start_at > now() then start_at end asc nulls last, start_at desc
     limit 1;
  else
    select * into e from public.fronde_editions where id = p_id;
  end if;
  nxt := not exists (select 1 from public.fronde_editions where status = 'annoncee');
  if e.id is null then return jsonb_build_object('edition', null, 'next_needed', nxt); end if;
  perform public._fronde_settle(e.id);                   -- règlement paresseux après l'arrivée
  select * into e from public.fronde_editions where id = e.id;
  select * into s from public.fronde_secrets where edition_id = e.id;
  el := extract(epoch from (now() - e.start_at));
  st := case when e.status <> 'annoncee' then e.status when el < 0 then 'annoncee' else 'en_course' end;
  -- plans publiés : seulement ceux dont l'entrée est passée (tous une fois l'édition réglée)
  select coalesce(jsonb_agg(x order by (x->>'t')::float8), '[]'::jsonb) into rv
    from jsonb_array_elements(coalesce(s.reveals, '[]'::jsonb)) x
   where e.status = 'reglee' or (x->>'t')::float8 <= el;
  return jsonb_build_object(
    'edition', jsonb_build_object('id', e.id, 'name', e.name, 'systems', e.systems, 'racers', e.racers, 'pilot', e.pilot,
       'start_at', e.start_at, 'nominal_end_at', e.nominal_end_at, 'seed_hash', e.seed_hash, 'seed', e.seed, 'result', e.result,
       'house_pct', e.house_pct, 'stake_cap', e.stake_cap, 'engine', e.engine),
    'state', st, 'elapsed', el, 'server_now', now(),
    'reveals', rv,
    'pools', public._fronde_pools(e.id),
    'my_bets', coalesce((select jsonb_agg(jsonb_build_object('racer', racer, 'stake', stake, 'at', placed_at) order by placed_at)
                          from public.fronde_bets where edition_id = e.id and user_id = me), '[]'::jsonb),
    'my_payout', (select jsonb_build_object('amount', amount, 'kind', kind, 'claimed', claimed_at is not null)
                    from public.fronde_payouts where edition_id = e.id and user_id = me),
    'next_needed', nxt);
end $$;
revoke all on function public.mp_fronde_edition(text) from public, anon;
grant execute on function public.mp_fronde_edition(text) to authenticated;

-- ── parier : « vainqueur », jusqu'au départ ──
-- Vraisemblance : CG de la dernière sauvegarde reçue, moins les mises posées depuis cette sauvegarde, ≥ mise.
-- Le jeu retire la mise de sa partie quand cette fonction répond ok (et sauvegarde).
create or replace function public.mp_fronde_bet(p_edition text, p_racer text, p_stake int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); e public.fronde_editions; mine bigint; cg numeric; saved timestamptz; after bigint; rid uuid;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if coalesce(p_edition, '') !~ '^[A-Za-z0-9_-]{1,32}$' then raise exception 'bad_edition'; end if;
  if coalesce(p_racer, '') !~ '^[a-z0-9_-]{1,32}$' then raise exception 'bad_racer'; end if;
  if p_stake is null or p_stake < 1 then raise exception 'bad_stake'; end if;
  select * into e from public.fronde_editions where id = p_edition for share;
  if not found then raise exception 'no_edition'; end if;
  if e.status <> 'annoncee' or now() >= e.start_at then raise exception 'bets_closed'; end if;
  if not exists (select 1 from jsonb_array_elements(e.racers) r where r->>'id' = p_racer) then raise exception 'bad_racer'; end if;
  -- un pari à la fois par joueur (verrou sur le joueur) : plafond et vraisemblance sans course entre deux appels
  perform pg_advisory_xact_lock(hashtext('fronde_bet:' || me::text));
  if exists (select 1 from public.fronde_bets where user_id = me and placed_at > now() - interval '2 seconds') then raise exception 'too_fast'; end if;
  select coalesce(sum(stake), 0) into mine from public.fronde_bets where edition_id = p_edition and user_id = me;
  if mine + p_stake > e.stake_cap then raise exception 'over_cap'; end if;
  select (data->'savegame'->>'credits')::numeric, updated_at into cg, saved from public.saves where user_id = me order by updated_at desc limit 1;
  if cg is null then raise exception 'no_save'; end if;
  select coalesce(sum(stake), 0) into after from public.fronde_bets where user_id = me and placed_at > saved;
  if cg - after < p_stake then raise exception 'not_enough_credits'; end if;
  insert into public.fronde_bets (edition_id, user_id, racer, stake) values (p_edition, me, p_racer, p_stake) returning id into rid;
  return jsonb_build_object('ok', true, 'id', rid, 'racer', p_racer, 'stake', p_stake, 'my_total', mine + p_stake, 'pools', public._fronde_pools(p_edition));
end $$;
revoke all on function public.mp_fronde_bet(text, text, int) from public, anon;
grant execute on function public.mp_fronde_bet(text, text, int) to authenticated;

-- ── encaisser : une seule fois ; le jeu ajoute amount à ses CG quand claimed_now = true ──
create or replace function public.mp_fronde_claim(p_edition text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); a int; k text;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if coalesce(p_edition, '') !~ '^[A-Za-z0-9_-]{1,32}$' then raise exception 'bad_edition'; end if;
  perform public._fronde_settle(p_edition);
  update public.fronde_payouts set claimed_at = now()
   where edition_id = p_edition and user_id = me and claimed_at is null
   returning amount, kind into a, k;
  if a is null then
    return jsonb_build_object('claimed_now', false, 'amount', 0,
      'already', exists (select 1 from public.fronde_payouts where edition_id = p_edition and user_id = me));
  end if;
  return jsonb_build_object('claimed_now', true, 'amount', a, 'kind', k);
end $$;
revoke all on function public.mp_fronde_claim(text) from public, anon;
grant execute on function public.mp_fronde_claim(text) to authenticated;

-- ── vérifications (à lancer après installation) ──
--   select public.verifier_fronde();   → liste des contrôles, tous « ok »
create or replace function public.verifier_fronde()
returns table (controle text, etat text) language sql security definer set search_path = public as $$
  select 'tables fermées aux joueurs', case when bool_and(not has_table_privilege('authenticated', t, 'select')) then 'ok' else 'ÉCHEC' end
    from unnest(array['public.fronde_editions', 'public.fronde_secrets', 'public.fronde_bets', 'public.fronde_payouts']) t
  union all
  select 'fonctions publiques ouvertes aux joueurs connectés', case when bool_and(has_function_privilege('authenticated', f, 'execute')) then 'ok' else 'ÉCHEC' end
    from unnest(array['public.mp_fronde_edition(text)', 'public.mp_fronde_bet(text,text,integer)', 'public.mp_fronde_claim(text)']) f
  union all
  select 'fonctions internes fermées', case when bool_and(not has_function_privilege('authenticated', f, 'execute')) then 'ok' else 'ÉCHEC' end
    from unnest(array['public._fronde_settle(text)', 'public.fronde_cancel(text)', 'public._fronde_pools(text)']) f
  union all
  select 'empreintes de graine cohérentes (éditions réglées)', case when bool_and(seed_hash = encode(extensions.digest(seed, 'sha256'), 'hex')) is not false then 'ok' else 'ÉCHEC' end
    from public.fronde_editions where seed is not null;
$$;
revoke all on function public.verifier_fronde() from public, anon, authenticated;
