-- Tests du schéma v43 (courses d'essai en CG fictifs). Après test_v42.sql.
\set ON_ERROR_STOP on
\set QUIET on
-- Kovac (admin de test_v42) n'a plus de CG dans sa partie : il peut quand même parier sur une course d'essai
reset role;
update public.saves set data = '{"savegame":{"credits":0}}', updated_at = now() where user_id = '00000000-0000-0000-0000-0000000000e1';
insert into public.fronde_editions (id, name, systems, racers, start_at, opens_at, nominal_end_at, seed_hash, rate, test_user)
values ('T2', 'Essai fictif', '[]', '[{"id":"mule"},{"id":"fulgurant"}]', now() + interval '5 minutes', now() - interval '1 minute', now() + interval '40 minutes', encode(extensions.digest('t2', 'sha256'), 'hex'), 144, '00000000-0000-0000-0000-0000000000e1');
insert into public.fronde_secrets values ('T2', 't2', '[]', '{"winner":"mule","finish":{},"t1":259200}');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
select pg_sleep(2.1);
select t.ok((public.mp_fronde_bet('T2', 'mule', 3000)->>'ok')::boolean, 'essai : pari de 3 000 accepté avec 0 CG dans la partie (CG fictifs)');
select t.ok(not exists (select 1 from jsonb_array_elements(public.mp_fronde_mine()->'bets') x where x->>'edition' = 'T2'), 'essai : absent de mp_fronde_mine (la partie n''est pas touchée)');
select t.expect('select public.mp_fronde_bet(''F1'', ''mule'', 1)', 'bets_closed');
reset role; update public.fronde_editions set start_at = now() - interval '40 minutes' where id = 'T2'; set role authenticated;
select t.ok((public.mp_fronde_edition('T2')->'my_payout'->>'amount')::int = 2850, 'essai réglé : gain fictif de 2 850 (3 000 − 5 %)');
select t.ok((public.mp_fronde_claim('T2')->>'test')::boolean and (public.mp_fronde_claim('T2')->>'amount')::int = 0, 'essai : rien à encaisser dans la partie');
select t.ok(not exists (select 1 from jsonb_array_elements(public.mp_fronde_mine()->'payouts') x where x->>'edition' = 'T2'), 'essai : gain absent de mp_fronde_mine');
reset role;
select t.ok(bool_and(etat = 'ok'), 'verifier_fronde (v43) : tous les contrôles ok') from public.verifier_fronde();
\echo 'TOUS LES TESTS v43 PASSENT'
