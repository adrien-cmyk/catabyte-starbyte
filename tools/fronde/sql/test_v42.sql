-- Tests du schéma v42 (fenêtre de paris, anonymat, fil, classement, tribune, essais accélérés). Après test_v41.sql.
\set ON_ERROR_STOP on
\set QUIET on
insert into auth.users values ('00000000-0000-0000-0000-0000000000e1'), ('00000000-0000-0000-0000-0000000000e2');
insert into public.worlds values ('00000000-0000-0000-0000-0000000000e1', 'Kovac'), ('00000000-0000-0000-0000-0000000000e2', 'Lyra');
insert into public.saves (user_id, data, updated_at) values ('00000000-0000-0000-0000-0000000000e1', '{"savegame":{"credits":9000}}', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-0000000000e2', '{"savegame":{"credits":9000}}', now() - interval '1 hour');
insert into public.fronde_admins values ('00000000-0000-0000-0000-0000000000e1');
-- F1 : départ dans 4 jours, paris ouverts 3 jours avant → pas encore ouverts
insert into public.fronde_editions (id, name, systems, racers, start_at, opens_at, nominal_end_at, seed_hash)
values ('F1', 'Essai fenêtre', '[]', '[{"id":"mule"},{"id":"fulgurant"}]', now() + interval '4 days', now() + interval '1 day', now() + interval '7 days', encode(extensions.digest('f1', 'sha256'), 'hex'));
insert into public.fronde_secrets values ('F1', 'f1', '[]', '{"winner":"mule","finish":{},"t1":259200}');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
select t.expect('select public.mp_fronde_bet(''F1'', ''mule'', 10)', 'bets_not_open');
select t.ok(not (public.mp_fronde_edition('F1')->>'bets_open')::boolean, 'paris pas encore ouverts (3 jours avant le départ seulement)');
reset role; update public.fronde_editions set opens_at = now() - interval '1 minute' where id = 'F1'; set role authenticated;
select t.ok((public.mp_fronde_edition('F1')->>'bets_open')::boolean, 'fenêtre ouverte : paris ouverts');
select t.ok((public.mp_fronde_bet('F1', 'mule', 700, null, false)->>'ok')::boolean, 'Kovac mise 700 sur La Mule (nommé)');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', false);
select t.ok((public.mp_fronde_bet('F1', 'fulgurant', 300, null, true)->>'ok')::boolean, 'Lyra mise 300 sur Le Fulgurant (anonyme)');
select t.ok((public.mp_fronde_feed('F1')->0->>'who') is null and (public.mp_fronde_feed('F1')->1->>'who') = 'Kovac', 'fil : le pari anonyme sans nom, l''autre avec « Kovac »');
select t.ok((public.mp_fronde_feed('F1')->0->>'mine')::boolean, 'fil : mon pari est marqué comme le mien');
-- tribune
select t.ok((public.mp_fronde_chat_post('F1', '  Allez La Mule ! ')->>'body') = 'Allez La Mule !', 'tribune : message de Lyra publié (espaces retirés)');
select t.expect('select public.mp_fronde_chat_post(''F1'', ''encore'')', 'too_fast');
select t.expect('select public.mp_fronde_chat_post(''F1'', ''   '')', 'empty');
select t.ok(jsonb_array_length(public.mp_fronde_chat('F1')) = 1 and (public.mp_fronde_chat('F1')->0->>'pseudo') = 'Lyra', 'tribune : lue par tous, avec le nom');
reset role; insert into auth.users values ('00000000-0000-0000-0000-0000000000e3'); set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e3', false);
select t.expect('select public.mp_fronde_chat_post(''F1'', ''salut'')', 'no_world');
-- classement après l'arrivée
reset role; update public.fronde_editions set start_at = now() - interval '4 days' where id = 'F1'; set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
select t.ok((public.mp_fronde_edition('F1')->>'state') = 'reglee', 'F1 réglée');
-- cagnotte 1 000, maison 5 % → 950 pour Kovac (seul sur le vainqueur) : net +250
select t.ok((public.mp_fronde_ranking('F1')->'edition'->0->>'who') = 'Kovac' and (public.mp_fronde_ranking('F1')->'edition'->0->>'net')::int = 250, 'classement de l''édition : Kovac, +250 net');
select t.ok(exists (select 1 from jsonb_array_elements(public.mp_fronde_ranking('F1')->'season') x where x->>'who' = 'Kovac' and (x->>'net')::int = 250 and (x->>'mine')::boolean), 'classement de la saison : Kovac à +250, marqué comme moi');
select t.ok(not exists (select 1 from jsonb_array_elements(public.mp_fronde_ranking('F1')->'season') x where x->>'who' = 'Lyra'), 'saison : Lyra (anonyme) n''apparaît pas sous son nom');
-- course d'essai accélérée, visible par Kovac seul ; temps × 144
reset role;
insert into public.fronde_editions (id, name, systems, racers, start_at, opens_at, nominal_end_at, seed_hash, rate, test_user)
values ('T1', 'Course d''essai', '[]', '[{"id":"mule"}]', now() - interval '10 minutes', now() - interval '20 minutes', now() + interval '30 minutes', encode(extensions.digest('t1', 'sha256'), 'hex'), 144, '00000000-0000-0000-0000-0000000000e1');
insert into public.fronde_secrets values ('T1', 't1', '[{"racer":"mule","sys":"kerath","t":0,"plan":{}},{"racer":"mule","sys":"vessa","t":100000,"plan":{}}]', '{"winner":"mule","finish":{},"t1":259200}');
set role authenticated;
select t.ok((public.mp_fronde_edition()->'edition'->>'id') = 'T1' and (public.mp_fronde_edition()->'edition'->>'test')::boolean, 'Kovac voit d''abord sa course d''essai');
select t.ok(abs((public.mp_fronde_edition()->>'elapsed')::float8 - 600 * 144) < 600, 'temps de course accéléré : 10 min réelles ≈ 24 h de course');
select t.ok(jsonb_array_length(public.mp_fronde_edition()->'reveals') = 1, 'essai : plans publiés selon le temps accéléré');
select t.ok((public.mp_fronde_edition()->>'is_admin')::boolean, 'Kovac est administrateur');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', false);
select t.ok(coalesce(public.mp_fronde_edition()->'edition'->>'id', '') <> 'T1', 'Lyra ne voit pas la course d''essai de Kovac');
select t.expect('select public.mp_fronde_feed(''T1'')', 'no_edition');
select t.expect('select public.mp_fronde_bet(''T1'', ''mule'', 10)', 'no_edition');
select t.ok(not (public.mp_fronde_edition()->>'is_admin')::boolean, 'Lyra n''est pas administratrice');
-- fin de l'essai : 72 h / 144 = 30 min réelles
reset role; update public.fronde_editions set start_at = now() - interval '31 minutes' where id = 'T1'; set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
select t.ok((public.mp_fronde_edition('T1')->>'state') = 'reglee', 'essai réglé au bout de 30 minutes réelles');
reset role;
select t.ok(bool_and(etat = 'ok'), 'verifier_fronde (v42) : tous les contrôles ok') from public.verifier_fronde();
\echo 'TOUS LES TESTS v42 PASSENT'
