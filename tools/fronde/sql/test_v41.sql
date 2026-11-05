-- Tests du schéma v41 (Grande Fronde) sur l'imitation de Supabase (supabase_fake.sql). Lancement : tools/fronde/test_sql.sh
-- Chaque contrôle affiche « ok — … » ; le premier échec arrête le script.
\set ON_ERROR_STOP on
\set QUIET on
-- joueurs : A (10 000 CG), B (3 000 CG), C (0 CG), D (sans sauvegarde)
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'), ('00000000-0000-0000-0000-00000000000c'), ('00000000-0000-0000-0000-00000000000d');
insert into public.saves (user_id, data, updated_at) values
  ('00000000-0000-0000-0000-00000000000a', '{"savegame":{"credits":10000}}', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-00000000000b', '{"savegame":{"credits":3000}}', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-00000000000c', '{"savegame":{"credits":0}}', now() - interval '1 hour');

-- édition E1 : départ dans 1 h ; plans publiés à t = 0 (Kerath), 30 000 s (Vessa), 140 000 s (Nox) ; Le Fulgurant gagne en 72 h
insert into public.fronde_editions (id, name, systems, racers, start_at, nominal_end_at, seed_hash)
values ('E1', 'Essai', '[{"id":"kerath"},{"id":"vessa"},{"id":"nox"}]',
        '[{"id":"sentinelle"},{"id":"cuirasse"},{"id":"mule"},{"id":"fulgurant"}]',
        now() + interval '1 hour', now() + interval '77 hours', encode(extensions.digest('graine-E1', 'sha256'), 'hex'));
insert into public.fronde_secrets values ('E1', 'graine-E1',
  '[{"racer":"fulgurant","sys":"kerath","t":0,"plan":{"kind":"plongée"}},{"racer":"mule","sys":"kerath","t":0,"plan":{"kind":"prudente"}},
    {"racer":"fulgurant","sys":"vessa","t":30000,"plan":{"kind":"prudente"}},{"racer":"mule","sys":"vessa","t":31000,"plan":{"kind":"classique"}},
    {"racer":"fulgurant","sys":"nox","t":140000,"plan":{"kind":"prudente"}}]',
  '{"winner":"fulgurant","finish":{"fulgurant":259200,"mule":259800},"t1":260000}');

-- ── accès direct refusé, appel anonyme refusé ──
set role authenticated;
select t.expect('select * from public.fronde_editions', 'permission denied');
select t.expect('select * from public.fronde_secrets', 'permission denied');
select t.expect('insert into public.fronde_bets (edition_id, user_id, racer, stake) values (''E1'', ''00000000-0000-0000-0000-00000000000a'', ''mule'', 1)', 'permission denied');
select t.expect('select public._fronde_settle(''E1'')', 'permission denied');
select t.expect('select public.mp_fronde_edition()', 'not_signed_in');
select t.ok(true, 'tables et fonctions internes fermées, appel anonyme refusé');

-- ── avant le départ : rien de publié ──
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select t.ok((public.mp_fronde_edition()->>'state') = 'annoncee', 'état annoncée avant le départ');
select t.ok(jsonb_array_length(public.mp_fronde_edition()->'reveals') = 0, 'aucun plan publié avant le départ');
select t.ok((public.mp_fronde_edition()->'edition'->>'seed') is null, 'graine cachée avant l''arrivée');
select t.ok((public.mp_fronde_edition()->'next_needed')::boolean = false, 'pas besoin d''une nouvelle édition');

-- ── paris ──
select t.ok((public.mp_fronde_bet('E1', 'fulgurant', 4000, '11111111-1111-1111-1111-111111111111')->>'ok')::boolean, 'A mise 4 000 sur Le Fulgurant');
select t.ok((public.mp_fronde_bet('E1', 'fulgurant', 4000, '11111111-1111-1111-1111-111111111111')->>'repeat')::boolean, 'renvoi du même pari (même identifiant) : pas de doublon');
select t.ok((public.mp_fronde_mine()->'bets'->0->>'stake')::int = 4000 and jsonb_array_length(public.mp_fronde_mine()->'bets') = 1, 'mp_fronde_mine : un seul pari de 4 000');
select t.expect('select public.mp_fronde_bet(''E1'', ''mule'', 100)', 'too_fast');
select pg_sleep(2.1);
select t.expect('select public.mp_fronde_bet(''E1'', ''mule'', 1001)', 'over_cap');
select t.ok((public.mp_fronde_bet('E1', 'mule', 1000)->>'my_total')::int = 5000, 'A complète à 5 000 (plafond atteint pile)');
select t.expect('select public.mp_fronde_bet(''E1'', ''personne'', 10)', 'bad_racer');
select t.expect('select public.mp_fronde_bet(''E1'', ''mule'', 0)', 'bad_stake');
select t.expect('select public.mp_fronde_bet(''E9'', ''mule'', 10)', 'no_edition');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select t.ok((public.mp_fronde_bet('E1', 'mule', 2500)->>'ok')::boolean, 'B mise 2 500 sur La Mule');
select pg_sleep(2.1);
select t.expect('select public.mp_fronde_bet(''E1'', ''mule'', 600)', 'not_enough_credits');   -- 3 000 − 2 500 posés depuis la sauvegarde
select t.ok((public.mp_fronde_bet('E1', 'cuirasse', 500)->>'ok')::boolean, 'B mise ses 500 derniers CG sur Kerath Lourd');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
select t.expect('select public.mp_fronde_bet(''E1'', ''mule'', 1)', 'not_enough_credits');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
select t.expect('select public.mp_fronde_bet(''E1'', ''mule'', 1)', 'no_save');
select t.ok((public.mp_fronde_edition()->'pools'->>'total')::int = 8000, 'cagnotte publique : 8 000 CG');
select t.ok((public.mp_fronde_edition()->'pools'->'by_racer'->>'mule')::int = 3500, 'cagnotte par racer : La Mule 3 500');
select t.ok(jsonb_array_length(public.mp_fronde_edition()->'my_bets') = 0, 'D ne voit pas les paris des autres');

-- ── en course (départ il y a 10 h = 36 000 s) : seuls les plans d'entrées passées ──
reset role;
update public.fronde_editions set start_at = now() - interval '10 hours' where id = 'E1';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select t.ok((public.mp_fronde_edition()->>'state') = 'en_course', 'état en course');
select t.ok(jsonb_array_length(public.mp_fronde_edition()->'reveals') = 4, 'plans publiés : 4 (entrées ≤ 36 000 s), Nox encore caché');
select t.ok(not exists (select 1 from jsonb_array_elements(public.mp_fronde_edition()->'reveals') x where x->>'sys' = 'nox'), 'aucun plan de Nox');
select t.ok((public.mp_fronde_edition()->'edition'->'result') = 'null'::jsonb, 'résultat caché pendant la course');
select pg_sleep(2.1);
select t.expect('select public.mp_fronde_bet(''E1'', ''mule'', 10)', 'bets_closed');
select t.ok((public.mp_fronde_claim('E1')->>'claimed_now')::boolean = false, 'rien à encaisser pendant la course');

-- ── arrivée passée : règlement paresseux au premier appel ──
reset role;
update public.fronde_editions set start_at = now() - interval '73 hours' where id = 'E1';
set role authenticated;
select t.ok((public.mp_fronde_edition()->>'state') = 'reglee', 'réglée au premier appel après l''arrivée');
select t.ok((public.mp_fronde_edition()->'edition'->>'seed') = 'graine-E1', 'graine publiée');
select t.ok(encode(extensions.digest(public.mp_fronde_edition()->'edition'->>'seed', 'sha256'), 'hex') = public.mp_fronde_edition()->'edition'->>'seed_hash', 'sha-256(graine) = empreinte publiée avant les paris');
select t.ok(jsonb_array_length(public.mp_fronde_edition()->'reveals') = 5, 'tous les plans publiés après l''arrivée');
-- cagnotte 8 000 ; maison 5 % → 7 600 ; mises sur le vainqueur : A 4 000 (seul) → A reçoit 7 600
select t.ok((public.mp_fronde_edition()->'my_payout'->>'amount')::int = 7600, 'A gagne 7 600 CG (8 000 − 5 %)');
select t.ok((public.mp_fronde_mine()->'payouts'->0->>'amount')::int = 7600 and not (public.mp_fronde_mine()->'payouts'->0->>'claimed')::boolean, 'mp_fronde_mine : gain de 7 600 à encaisser');
select t.ok((public.mp_fronde_claim('E1')->>'amount')::int = 7600, 'A encaisse 7 600');
select t.ok((public.mp_fronde_claim('E1')->>'claimed_now')::boolean = false and (public.mp_fronde_claim('E1')->>'already')::boolean, 'double encaissement refusé');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select t.ok((public.mp_fronde_claim('E1')->>'amount')::int = 0 and not (public.mp_fronde_claim('E1')->>'already')::boolean, 'B a perdu : rien à encaisser');
select t.ok((public.mp_fronde_edition()->'next_needed')::boolean, 'plus d''édition à venir : le jeu demandera la suivante');
reset role;
select t.ok((select count(*) from public.fronde_payouts where edition_id = 'E1') = 1, 'une seule ligne de gain');
select public._fronde_settle('E1');
select t.ok((select count(*) from public.fronde_payouts where edition_id = 'E1') = 1, 'règlement idempotent');

-- ── E2 : personne n'a misé sur le vainqueur → remboursement intégral ──
insert into public.fronde_editions (id, name, systems, racers, start_at, nominal_end_at, seed_hash)
values ('E2', 'Essai 2', '[]', '[{"id":"mule"},{"id":"fulgurant"}]', now() + interval '1 hour', now() + interval '77 hours', encode(extensions.digest('s2', 'sha256'), 'hex'));
insert into public.fronde_secrets values ('E2', 's2', '[]', '{"winner":"fulgurant","finish":{},"t1":100}');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_sleep(2.1);
select public.mp_fronde_bet('E2', 'mule', 300);
reset role;
update public.fronde_editions set start_at = now() - interval '1 hour' where id = 'E2';
set role authenticated;
select t.ok((public.mp_fronde_claim('E2')->>'kind') = 'remboursement' , 'aucun gagnant : remboursement');
reset role;
select t.ok((select amount from public.fronde_payouts where edition_id = 'E2') = 300, 'remboursé intégralement (300)');

-- ── E3 : annulation (SQL Editor) → remboursement ──
insert into public.fronde_editions (id, name, systems, racers, start_at, nominal_end_at, seed_hash)
values ('E3', 'Essai 3', '[]', '[{"id":"mule"}]', now() + interval '1 hour', now() + interval '77 hours', 'x');
insert into public.fronde_secrets values ('E3', 's3', '[]', '{"winner":"mule","finish":{},"t1":100}');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_sleep(2.1);
select t.expect('select public.mp_fronde_bet(''E3'', ''mule'', 1)', 'not_enough_credits');   -- B a tout misé sur E1 depuis sa sauvegarde
reset role;
update public.saves set data = '{"savegame":{"credits":400}}', updated_at = now() where user_id = '00000000-0000-0000-0000-00000000000b';
set role authenticated;
select t.ok((public.mp_fronde_bet('E3', 'mule', 400)->>'ok')::boolean, 'nouvelle sauvegarde : B peut miser à nouveau');
select t.expect('select public.fronde_cancel(''E3'')', 'permission denied');
reset role;
select public.fronde_cancel('E3');
select t.ok((select status from public.fronde_editions where id = 'E3') = 'annulee' and (select amount from public.fronde_payouts where edition_id = 'E3') = 400, 'annulation : B remboursé de 400');

-- ── priorité d'affichage : celle qui court avant la prochaine ──
insert into public.fronde_editions (id, name, systems, racers, start_at, nominal_end_at, seed_hash)
values ('R', 'Court', '[]', '[{"id":"mule"}]', now() - interval '1 hour', now() + interval '70 hours', 'x'),
       ('N', 'Prochaine', '[]', '[{"id":"mule"}]', now() + interval '20 days', now() + interval '23 days', 'x');
insert into public.fronde_secrets values ('R', 'r', '[]', '{"winner":"mule","finish":{},"t1":250000}'), ('N', 'n', '[]', '{"winner":"mule","finish":{},"t1":250000}');
set role authenticated;
select t.ok((public.mp_fronde_edition()->'edition'->>'id') = 'R', 'l''édition en cours passe avant la prochaine');
reset role;
select t.ok(bool_and(etat = 'ok'), 'verifier_fronde : tous les contrôles ok') from public.verifier_fronde() where controle not like 'administrateur%';
\echo 'TOUS LES TESTS v41 PASSENT'
