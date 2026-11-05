-- Starbyte — v43 : Grande Fronde, courses d'essai en CG fictifs et administrateur par nom de commandant (06/11/2026).
-- À exécuter après schema_mp_v42_fronde_social.sql. Peut être relancé sans risque.
--   · une course d'essai ne touche jamais la vraie partie : mises sans vérification des CG (budget fictif côté Télébyte),
--     paris et gains d'essai absents de mp_fronde_mine (la passerelle du jeu ne les applique pas) ;
--   · l'administrateur peut aussi être reconnu par son nom de commandant (le compte de jeu n'a pas toujours l'email).

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
  -- course d'essai : CG fictifs (10 000 par essai, plafond 5 000) — la partie n'est pas consultée et ne sera pas touchée
  if e.test_user is null then
    select (data->'savegame'->>'credits')::numeric, updated_at into cg, saved from public.saves where user_id = me order by updated_at desc limit 1;
    if cg is null then raise exception 'no_save'; end if;
    select coalesce(sum(b.stake), 0) into after from public.fronde_bets b join public.fronde_editions x on x.id = b.edition_id and x.test_user is null
     where b.user_id = me and b.placed_at > saved;
    if cg - after < p_stake then raise exception 'not_enough_credits'; end if;
  end if;
  insert into public.fronde_bets (edition_id, user_id, racer, stake, client_nonce, anonymous)
    values (p_edition, me, p_racer, p_stake, p_nonce, coalesce(p_anonymous, false)) returning id into rid;
  return jsonb_build_object('ok', true, 'id', rid, 'racer', p_racer, 'stake', p_stake, 'my_total', mine + p_stake, 'pools', public._fronde_pools(p_edition));
end $$;
revoke all on function public.mp_fronde_bet(text, text, int, uuid, boolean) from public, anon;
grant execute on function public.mp_fronde_bet(text, text, int, uuid, boolean) to authenticated;


-- mes paris et gains (90 jours) pour la passerelle du jeu : éditions publiques seulement (les essais restent fictifs)
create or replace function public.mp_fronde_mine()
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); ed text;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  for ed in select distinct b.edition_id from public.fronde_bets b join public.fronde_editions e on e.id = b.edition_id
             where b.user_id = me and e.status = 'annoncee' loop
    perform public._fronde_settle(ed);
  end loop;
  return jsonb_build_object(
    'bets', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'edition', b.edition_id, 'racer', b.racer, 'stake', b.stake, 'at', b.placed_at) order by b.placed_at)
                        from public.fronde_bets b join public.fronde_editions e on e.id = b.edition_id and e.test_user is null
                       where b.user_id = me and b.placed_at > now() - interval '90 days'), '[]'::jsonb),
    'payouts', coalesce((select jsonb_agg(jsonb_build_object('edition', p.edition_id, 'amount', p.amount, 'kind', p.kind, 'claimed', p.claimed_at is not null) order by p.created_at)
                           from public.fronde_payouts p join public.fronde_editions e on e.id = p.edition_id and e.test_user is null
                          where p.user_id = me and p.created_at > now() - interval '90 days'), '[]'::jsonb));
end $$;
revoke all on function public.mp_fronde_mine() from public, anon;
grant execute on function public.mp_fronde_mine() to authenticated;

-- encaisser : pas pour un essai (rien à verser dans la partie)
create or replace function public.mp_fronde_claim(p_edition text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); a int; k text;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if coalesce(p_edition, '') !~ '^[A-Za-z0-9_-]{1,32}$' then raise exception 'bad_edition'; end if;
  if exists (select 1 from public.fronde_editions where id = p_edition and test_user is not null) then
    return jsonb_build_object('claimed_now', false, 'amount', 0, 'already', false, 'test', true);
  end if;
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

-- administrateur : par email (déjà en v42) ou par nom de commandant
insert into public.fronde_admins (user_id) select user_id from public.worlds where lower(pseudo) = 'hadrien' on conflict do nothing;

-- ce qui s'affiche en bas après « Run » : les comptes administrateurs de la Grande Fronde, avec email et commandant.
-- Si ton compte de jeu n'y est pas, cherche-le :  select w.user_id, w.pseudo, u.email from public.worlds w left join auth.users u on u.id = w.user_id where w.pseudo ilike '%hadrien%';
-- puis :  insert into public.fronde_admins values ('<user_id>');
select a.user_id, u.email, (select string_agg(w.pseudo, ', ') from public.worlds w where w.user_id = a.user_id) as commandant
  from public.fronde_admins a left join auth.users u on u.id = a.user_id;
