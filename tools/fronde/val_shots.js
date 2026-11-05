// Captures de validation de la Phase 2 (étape 9), format téléphone : vue système de course pour chaque système
// (Ensemble, Portes, Suivre le meneur) au cœur du passage. Les captures du Télébyte passent par tb_shots.js.
// Usage : node tools/fronde/val_shots.js   (OUT, PORT, THREE_DIR ; W, H, DSF : défaut 390 × 844 × 2)
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const OUT = process.env.OUT || './shots/', PORT = process.env.PORT || 8766, THREE_DIR = process.env.THREE_DIR;
const SYSTEMS = [['kerath', 6.0], ['vessa', 37.2], ['nox', 69.0]];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const c = await b.newContext({ viewport: { width: +(process.env.W || 390), height: +(process.env.H || 844) }, deviceScaleFactor: +(process.env.DSF || 2) });
  const p = await c.newPage();
  if (THREE_DIR) await p.route(/cdn\.jsdelivr\.net\/npm\/three@0\.186\.0\//, (r) => r.fulfill({ path: path.join(THREE_DIR, new URL(r.request().url()).pathname.replace(/^\/npm\/three@0\.186\.0\//, '')), contentType: 'application/javascript' }));
  p.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 400)));
  await p.goto(`http://localhost:${PORT}/sandbox/index.html?clean`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.RW && RW.ready, null, { timeout: 120000 });
  await p.evaluate(() => RW.stop());
  for (const [sys, h] of SYSTEMS) {
    for (const v of ['ensemble', 'portes', 'suivre']) {
      await p.evaluate(async ([sys, h, v]) => {
        RW.setSystem(sys); RW.course({ t: h * 3600 }); RW.setTimeScale(0);
        if (v === 'portes') RW.coursePortes();
        if (v === 'suivre') RW.raceSelect(RW.leader());
        RW.frames(3); await RW.settle();
        const t0 = performance.now(); while (!RW.fleetReady() && performance.now() - t0 < 60000) await new Promise((r) => setTimeout(r, 200));
        RW.frames(110);
      }, [sys, h, v]);
      await p.waitForTimeout(300);
      const f = path.join(OUT, `${sys}_${v}.png`); await p.screenshot({ path: f }); console.log('ok', f);
    }
  }
  await b.close();
})();
