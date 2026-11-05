// Essai de la course d'essai (administrateur), sur la base locale (v41 + v42) et le faux Supabase (TEST_MINUTES, TEST_LEAD
// raccourcis) : bouton « course d'essai » → pari anonyme → fil → tribune → départ → arrivée → gain versé → classement ;
// un autre joueur ne voit pas la course d'essai. Captures dans OUT.
// Usage : PGHOST=… PGPORT=… PG_MODULE=… THREE_DIR=… OUT=… node tools/fronde/ui_test_race.js
const { chromium } = require('playwright'); const path = require('path');
const pg = require(process.env.PG_MODULE || 'pg');
const T = process.env.THREE_DIR, OUT = process.env.OUT || '.';
const db = new pg.Client({ user: 'postgres', database: process.env.PGDATABASE || 'fronde_live' });
const ADM = '00000000-0000-0000-0000-0000000000a1', OTHER = '00000000-0000-0000-0000-0000000000b2';
let fail = 0; const ok = (c, m) => { console.log((c ? 'ok — ' : 'ÉCHEC — ') + m); if (!c) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await db.connect();
  for (const [u, n] of [[ADM, 'Hadrien'], [OTHER, 'Lyra']]) {
    await db.query('insert into auth.users (id) values ($1) on conflict do nothing', [u]);
    await db.query('insert into public.worlds values ($1, $2) on conflict do nothing', [u, n]);
    await db.query(`insert into public.saves (user_id, data, updated_at) values ($1, '{"savegame":{"credits":10000}}', now() - interval '1 hour') on conflict (user_id) do nothing`, [u]);
  }
  await db.query('insert into public.fronde_admins values ($1) on conflict do nothing', [ADM]);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  if (T) await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@0\.186\.0\//, (r) => r.fulfill({ path: path.join(T, new URL(r.request().url()).pathname.replace(/^\/npm\/three@0\.186\.0\//, '')), contentType: 'application/javascript' }));
  const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 300)));
  const tv = () => p.frames().find((f) => f.url().includes('telebyte/index.html'));
  const openTv = async () => {
    await p.evaluate(() => { SBFronde.close(); SBFronde.open(); });
    for (let i = 0; i < 120 && !(tv() && await tv().evaluate(() => !!(window.TB && TB.ready)).catch(() => false)); i++) await sleep(500);
    await sleep(1500);
  };
  await p.goto(`http://localhost:8766/tools/fronde/fake_game.html?user=${ADM}`);
  await openTv();
  await tv().click('#bets-btn'); await sleep(500);
  ok(!!(await tv().$('#bt-test')), 'administrateur : bouton « course d\'essai » visible');
  await tv().click('#bt-test');
  for (let i = 0; i < 60 && !(tv() && await tv().evaluate(() => window.TB && TB.ready && TB.live() && TB.live().id.startsWith('essai')).catch(() => false)); i++) await sleep(500);
  const live = await tv().evaluate(() => TB.live());
  ok(live && live.id.startsWith('essai') && live.state === 'annoncee', `course d'essai créée : ${live && live.id}`);
  await sleep(1500);
  await tv().click('#bets-btn'); await sleep(500);
  const ed = (await db.query("select * from public.fronde_editions where test_user = $1 order by created_at desc limit 1", [ADM])).rows[0];
  const winner = (await db.query('select result->>\'winner\' w from public.fronde_secrets where edition_id = $1', [ed.id])).rows[0].w;
  await tv().click(`.bt-rows li[data-id="${winner}"]`); await sleep(200);
  await tv().fill('#bt-stake', '400'); await tv().check('#bt-anon');
  await p.screenshot({ path: `${OUT}/tr_1_pari.png` });
  await tv().click('#bt-go');
  for (let i = 0; i < 40 && !(await tv().evaluate(() => /enregistré/.test(document.querySelector('.bt-msg')?.textContent || ''))); i++) await sleep(250);
  ok(await p.evaluate(() => G.credits) === 10000 && /enregistré/.test(await tv().textContent('.bt-msg')), 'pari anonyme de 400 CG fictifs sur la course d\'essai : la partie reste à 10 000 CG');
  await tv().click('.bt-tabs button[data-t="fil"]'); await sleep(1500);
  ok(/Toi/.test(await tv().textContent('.bt-feed')), 'fil : mon pari y figure');
  await tv().click('.bt-tabs button[data-t="tribune"]'); await sleep(1200);
  await tv().fill('#bt-chat', 'Essai de la tribune, à vous les studios !'); await tv().click('#bt-send'); await sleep(1500);
  ok(/à vous les studios/.test(await tv().textContent('#bt-chatlog')), 'tribune : message publié et relu');
  await p.screenshot({ path: `${OUT}/tr_2_tribune.png` });
  // un autre joueur ne voit pas l'essai
  const otherSees = (await db.query(`select (public.mp_fronde_edition())->'edition'->>'id' id from (select set_config('request.jwt.claim.sub', $1, true)) x`, [OTHER])).rows[0].id;
  ok(!String(otherSees || '').startsWith('essai'), `un autre joueur ne voit pas la course d'essai (il voit ${otherSees || 'rien'})`);
  // départ (TEST_LEAD) puis arrivée (TEST_MINUTES)
  await tv().click('#bets-close');
  for (let i = 0; i < 240 && (await tv().evaluate(() => TB.live().state)) !== 'en_course'; i++) await sleep(1000);
  ok((await tv().evaluate(() => TB.live().state)) === 'en_course', 'départ de la course d\'essai');
  await sleep(4000); await p.screenshot({ path: `${OUT}/tr_3_course.png` });
  for (let i = 0; i < 600 && (await tv().evaluate(() => TB.live().state)) !== 'reglee'; i++) await sleep(1000);
  ok((await tv().evaluate(() => TB.live().state)) === 'reglee', 'arrivée de la course d\'essai');
  await sleep(3000); await p.evaluate(() => SBFronde.sync());
  ok(await p.evaluate(() => G.credits) === 10000, `essai : la partie n'est pas touchée à l'arrivée (${await p.evaluate(() => G.credits)} CG)`);
  ok(/fictifs/.test(await tv().textContent('#bets-body')), 'essai : gain affiché comme fictif');
  await sleep(800); await p.screenshot({ path: `${OUT}/tr_4_arrivee.png` });
  await tv().click('.bt-tabs button[data-t="classement"]'); await sleep(1500);
  ok(/Toi/.test(await tv().textContent('#bets-body')), 'classement : j\'y figure (anonyme pour les autres)');
  await p.screenshot({ path: `${OUT}/tr_5_classement.png` });
  await b.close(); await db.end();
  console.log(fail ? `${fail} échec(s)` : 'COURSE D\'ESSAI RÉUSSIE');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
