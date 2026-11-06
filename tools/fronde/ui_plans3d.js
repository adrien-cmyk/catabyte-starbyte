// Plans 3D (GDD_PLANS_3D, étape 2) dans le Télébyte (démo hors ligne) : « Revoir » d'un dépassement joue le plan 3D
// (embarquée, extérieur au ralenti, arrière), bandeau rempli, « Passer », retour au schéma juste après le fait ;
// les autres « Revoir » gardent leur comportement. Captures dans OUT.
// Usage : THREE_DIR=… OUT=… node tools/fronde/ui_plans3d.js   (serveur statique de la racine du dépôt sur :8766)
const { chromium, devices } = require('playwright'); const path = require('path'); const T = process.env.THREE_DIR, OUT = process.env.OUT || '.';
let fail = 0; const ok = (c, m) => { console.log((c ? 'ok — ' : 'ÉCHEC — ') + m); if (!c) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  if (T) await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@0\.186\.0\//, (r) => r.fulfill({ path: path.join(T, new URL(r.request().url()).pathname.replace(/^\/npm\/three@0\.186\.0\//, '')), contentType: 'application/javascript' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('fronde.tv', '0'); localStorage.setItem('fronde.voice', 'texte'); } catch (e) {} });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERR', e.message.slice(0, 200)); });
  p.on('console', (m) => { if (/plans 3D/.test(m.text())) { errs.push(m.text()); console.log('WARN', m.text().slice(0, 200)); } });
  await p.goto('http://localhost:8766/telebyte/index.html'); await p.waitForFunction(() => window.TB && TB.ready, null, { timeout: 120000 });
  await p.evaluate(() => { document.getElementById('play').click(); TB.set(40 * 3600); }); await sleep(1200);
  await p.tap('#news'); await sleep(600);
  const k = await p.evaluate(() => TB.news.items.findIndex((x) => x.e.kind === 'overtake'));
  ok(k >= 0, 'un dépassement dans les moments forts');
  const ev = await p.evaluate((k) => TB.news.items[k].e, k);
  await p.tap(`.nw-rows button[data-k="${k}"]`);
  for (let i = 0; i < 60 && !(await p.evaluate(() => TB.p3d && TB.p3d.playing)); i++) await sleep(300);
  ok(await p.evaluate(() => TB.p3d && TB.p3d.playing), 'Revoir d\'un dépassement : le plan 3D démarre');
  const shots = new Set(); let hud = '';
  // (rendu logiciel lent : on attend que le plan atteigne le passage)
  for (let i = 0; i < 120 && !shots.has('exterieur'); i++) { await sleep(500); const st = await p.evaluate(() => ({ ...TB.p3d.state, hud: document.querySelector('#p3d .p3-card')?.textContent })); if (st.τ > 0) shots.add(st.shot); hud = st.hud; if (i === 2) await p.screenshot({ path: `${OUT}/t3d_1.png` }); }
  ok(shots.has('embarquee') && shots.has('exterieur'), `plans vus : ${[...shots].join(', ')}`);
  ok(/coque/.test(hud) && /carburant/.test(hud) && /P\d/.test(hud), `bandeau : ${hud.replace(/\s+/g, ' ').slice(0, 90)}`);
  await p.screenshot({ path: `${OUT}/t3d_2.png` });
  // « Passer »
  await p.tap('#p3d .p3-skip'); for (let i = 0; i < 20 && (await p.evaluate(() => TB.p3d.playing)); i++) await sleep(300);
  const after = await p.evaluate(() => ({ playing: TB.p3d.playing, hidden: document.getElementById('p3d').hidden, t: TB.state.t, in3d: TB.in3d }));
  ok(!after.playing && after.hidden && !after.in3d, '« Passer » : retour au schéma');
  ok(Math.abs(after.t - (ev.t + 60)) < 120, `horloge juste après le fait (${(after.t / 3600).toFixed(2)} h, fait ${(ev.t / 3600).toFixed(2)} h)`);
  // un autre « Revoir » (pas un dépassement) : comportement d'avant (vue système ou couloir), pas de 3D
  await p.tap('#news'); await sleep(500);
  const k2 = await p.evaluate(() => TB.news.items.findIndex((x) => x.e.kind !== 'overtake' && x.e.kind !== 'start'));
  await p.tap(`.nw-rows button[data-k="${k2}"]`); await sleep(1500);
  ok(!(await p.evaluate(() => TB.p3d.playing)), 'un autre fait : pas de plan 3D');
  ok(!errs.length, `aucune erreur (${errs.length})`);
  await b.close();
  console.log(fail ? `${fail} échec(s)` : 'PLANS 3D OK');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
