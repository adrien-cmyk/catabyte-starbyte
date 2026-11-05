// Banc de mesure des vues de course (Phase 2, étape 9) : pour chaque système, chaque niveau de qualité et chaque vue
// (Ensemble, Portes, Suivre), appels de dessin, triangles, points et temps CPU d'un pas, comparés aux budgets du plan.
// Fenêtre téléphone (390 × 844). Les temps d'image passent par SwiftShader : seuls les comptes et le CPU comptent.
// Usage : node tools/fronde/perf_race.js [sortie.md]   (PORT, THREE_DIR comme shots.js ; LEVELS=0,1,2,3)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 8766, THREE_DIR = process.env.THREE_DIR;
const OUT = process.argv[2] || 'docs/grande-fronde/PERF_PHASE2.md';
const LEVELS = (process.env.LEVELS || '0,1,2,3').split(',').map(Number);
// instant de mesure : au cœur du passage (le peloton près de la géante), heures de course
const SYSTEMS = [['kerath', 6.0], ['vessa', 37.2], ['nox', 69.0]];
const VIEWS = ['overview', 'gates', 'follow'];

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const rows = [];
  for (const q of LEVELS) {
    const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const p = await c.newPage();
    if (THREE_DIR) await p.route(/cdn\.jsdelivr\.net\/npm\/three@0\.186\.0\//, (r) => r.fulfill({ path: path.join(THREE_DIR, new URL(r.request().url()).pathname.replace(/^\/npm\/three@0\.186\.0\//, '')), contentType: 'application/javascript' }));
    p.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 300)));
    await p.goto(`http://localhost:${PORT}/sandbox/index.html?clean&q=${q}`, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.RW && RW.ready, null, { timeout: 120000 });
    await p.evaluate(() => RW.stop());
    for (const [sys, h] of SYSTEMS) {
      for (const v of VIEWS) {
        const r = await p.evaluate(async ([sys, h, v]) => {
          RW.setSystem(sys); RW.course({ t: h * 3600 }); RW.setTimeScale(0);
          if (v === 'gates') RW.coursePortes();
          if (v === 'follow') RW.raceSelect(RW.leader());
          RW.frames(3); await RW.settle();
          const t0 = performance.now(); while (!RW.fleetReady() && performance.now() - t0 < 60000) await new Promise((r) => setTimeout(r, 200));
          RW.frames(90); return RW.bench(8);
        }, [sys, h, v]);
        rows.push({ q, sys, v, ...r }); console.log(q, sys, v, JSON.stringify(r));
      }
    }
    await c.close();
  }
  await b.close();
  const k = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + ' M' : n >= 1e3 ? Math.round(n / 1e3) + ' k' : String(n));
  const L = ['# Grande Fronde — mesures des vues de course (Phase 2, étape 9)', '',
    'Fenêtre téléphone 390 × 844, rendu logiciel (SwiftShader) : les **comptes** (appels de dessin, triangles) et le **temps CPU d\'un pas** sont fiables, pas le temps d\'image GPU. Budgets du plan technique §9.', '',
    '| Qualité | Système | Vue | Appels | Budget | Triangles | Budget | Points | Pas (ms) | Dans le budget |', '|---|---|---|---:|---:|---:|---:|---:|---:|---|'];
  for (const r of rows) {
    const ok = r.calls <= r.budget.calls && r.tris <= r.budget.tris;
    L.push(`| ${r.level} | ${r.sys} | ${({ overview: 'Ensemble', gates: 'Portes', follow: 'Suivre' })[r.v]} | ${r.calls} | ${r.budget.calls} | ${k(r.tris)} | ${k(r.budget.tris)} | ${k(r.points)} | ${r.stepMs} | ${ok ? 'oui' : '**non**'} |`);
  }
  fs.writeFileSync(OUT, L.join('\n') + '\n'); console.log('écrit', OUT);
})();
