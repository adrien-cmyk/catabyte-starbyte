// Essai de bout en bout « en direct » (Phase 3, étape 5), sur la base locale (schéma v41) et le faux Supabase :
// jeu factice → Télébyte en superposition → pari → CG retirés → rattrapage après coupure → départ → vue système →
// arrivée → gain versé. Captures dans OUT. Prérequis : base fronde_live (supabase_fake.sql + v41), faux Supabase sur
// :8767, serveur statique de la racine du dépôt sur :8766.
// Usage : PGHOST=… PGPORT=… PG_MODULE=… THREE_DIR=… OUT=… node tools/fronde/ui_live_test.js
const { chromium } = require('playwright'); const path = require('path');
const pg = require(process.env.PG_MODULE || 'pg');
const T = process.env.THREE_DIR, OUT = process.env.OUT || '.';
const db = new pg.Client({ user: 'postgres', database: process.env.PGDATABASE || 'fronde_live' });
const A = '00000000-0000-0000-0000-0000000000a1';
let fail = 0; const ok = (c, m) => { console.log((c ? 'ok — ' : 'ÉCHEC — ') + m); if (!c) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await db.connect();
  await db.query(`insert into auth.users values ($1) on conflict do nothing`, [A]);
  await db.query(`insert into public.saves (user_id, data, updated_at) values ($1, '{"savegame":{"credits":10000}}', now() - interval '1 hour') on conflict (user_id) do update set data = excluded.data`, [A]);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  if (T) await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@0\.186\.0\//, (r) => r.fulfill({ path: path.join(T, new URL(r.request().url()).pathname.replace(/^\/npm\/three@0\.186\.0\//, '')), contentType: 'application/javascript' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('fronde.tv', '0'); } catch (e) {} });   // mode TV coupé : l'essai pilote lui-même
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 300)));
  p.on('console', (m) => { if (m.type() === 'error') console.log('CON', m.text().slice(0, 200)); });
  const tv = () => p.frames().find((f) => f.url().includes('telebyte/index.html'));
  const openTv = async () => {
    await p.evaluate(() => { SBFronde.close(); SBFronde.open(); });
    for (let i = 0; i < 120 && !(tv() && await tv().evaluate(() => !!(window.TB && TB.ready)).catch(() => false)); i++) await sleep(500);
    await sleep(1500);
  };

  // 1. ouverture depuis le jeu : pas d'édition → le Télébyte demande sa création (fronde-tick)
  await p.goto('http://localhost:8766/tools/fronde/fake_game.html');
  await openTv();
  const live = await tv().evaluate(() => TB.live());
  ok(live && live.state === 'annoncee', `édition créée par fronde-tick et suivie en direct : ${live && live.id}, état ${live && live.state}`);
  const ed = (await db.query("select * from public.fronde_editions where status = 'annoncee'")).rows[0];
  const winner = (await db.query('select result->>\'winner\' w from public.fronde_secrets where edition_id = $1', [ed.id])).rows[0].w;
  const loser = ed.racers.map((r) => r.id).find((x) => x !== winner);

  // 2. pari depuis le Télébyte : 500 CG sur le vainqueur (connu ici seulement grâce à la base de test)
  await tv().click('#bets-btn'); await sleep(400);
  await tv().click(`.bt-rows li[data-id="${winner}"]`); await sleep(200);
  await tv().fill('#bt-stake', '500');
  await p.screenshot({ path: `${OUT}/live_1_paris.png` });
  await tv().click('#bt-go');
  for (let i = 0; i < 40 && !(await tv().evaluate(() => /enregistré/.test(document.querySelector('.bt-msg')?.textContent || ''))); i++) await sleep(250);
  ok(await p.evaluate(() => G.credits) === 9500, 'pari de 500 CG : la partie passe de 10 000 à 9 500 CG');
  ok((await db.query('select count(*)::int n from public.fronde_bets')).rows[0].n === 1, 'un pari enregistré sur le serveur');
  await p.screenshot({ path: `${OUT}/live_2_pari_pris.png` });

  // 3. coupure : un pari accepté par le serveur mais jamais appliqué à la partie → la synchronisation rattrape (une fois)
  await sleep(2100);
  await p.evaluate(async ([id, r]) => {
    const c = window.FRONDE_SB; await fetch(c.url + '/rest/v1/rpc/mp_fronde_bet', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + window.FRONDE_TOKEN }, body: JSON.stringify({ p_edition: id, p_racer: r, p_stake: 300 }) });
  }, [ed.id, loser]);
  await p.evaluate(() => SBFronde.sync()); await p.evaluate(() => SBFronde.sync());
  ok(await p.evaluate(() => G.credits) === 9200, 'pari non appliqué (page fermée) : rattrapé à la synchronisation suivante, une seule fois (9 200 CG)');

  // 4. départ passé de 7 h : paris fermés, course en direct, vue système nourrie par le serveur
  await db.query("update public.fronde_editions set start_at = now() - interval '7 hours' where id = $1", [ed.id]);
  await openTv();
  ok((await tv().evaluate(() => TB.live())).state === 'en_course', 'après le départ : état en course');
  await tv().click('#bets-btn'); await sleep(400);
  ok(!(await tv().$('#bt-go')), 'paris fermés : plus de bouton « Parier »');
  await p.screenshot({ path: `${OUT}/live_3_en_course.png` });
  await tv().click('#bets-close');
  const sys0 = ed.systems[0].id;
  await tv().evaluate((s) => TB.dive(s), sys0);
  for (let i = 0; i < 160 && !(await tv().evaluate(() => TB.state.inSystem)); i++) await sleep(500);
  ok(await tv().evaluate(() => TB.state.inSystem), `vue système de ${sys0} ouverte en direct`);
  const sysf = p.frames().find((f) => f.url().includes('embed'));
  const fs = await sysf.evaluate(() => ({ live: !!(window.RW && document.querySelector('#race:not([hidden])')) }));
  await sleep(3000);
  await p.screenshot({ path: `${OUT}/live_4_systeme.png` });
  ok(fs.live, 'la vue système affiche la course du serveur');

  // 5. arrivée : règlement, gain versé une fois dans la partie
  await db.query("update public.fronde_editions set start_at = now() - interval '90 hours' where id = $1", [ed.id]);
  await openTv();
  for (let i = 0; i < 40 && (await p.evaluate(() => G.credits)) === 9200; i++) await sleep(500);
  const pay = (await db.query('select amount from public.fronde_payouts where edition_id = $1 and user_id = $2', [ed.id, A])).rows[0];
  const exp = Math.floor(800 * 0.95 * 500 / 500);   // cagnotte 800, maison 5 %, seul parieur du vainqueur
  ok(pay && pay.amount === exp, `réglée : gain de ${pay && pay.amount} CG (cagnotte 800 − 5 %)`);
  ok(await p.evaluate(() => G.credits) === 9200 + exp, `gain versé dans la partie : ${await p.evaluate(() => G.credits)} CG`);
  await p.evaluate(() => SBFronde.sync());
  ok(await p.evaluate(() => G.credits) === 9200 + exp, 'pas de double versement');
  await tv().click('#bets-btn'); await sleep(500);
  await p.screenshot({ path: `${OUT}/live_5_arrivee.png` });
  ok(await p.evaluate(() => G.fronde && Object.keys(G.fronde.applied).length === 2 && EXTRA_SAVE_KEYS.includes('fronde')), 'trace des paris appliqués gardée dans la sauvegarde (clé fronde)');
  await b.close(); await db.end();
  console.log(fail ? `${fail} échec(s)` : 'ESSAI EN DIRECT RÉUSSI');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
