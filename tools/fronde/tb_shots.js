// Captures de l'écran Télébyte à des instants de course donnés (en heures). Usage :
//   node tools/fronde/tb_shots.js 2,20,40,60,73 [racerId]   (OUT, PORT, THREE_DIR, W, H, DSF comme shots.js)
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const OUT = process.env.OUT || './shots/', PORT = process.env.PORT || 8766, THREE_DIR = process.env.THREE_DIR;
const hours = (process.argv[2] || '2,20,40,60,73').split(',').map(Number), sel = process.argv[3] || null;
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const c = await b.newContext({ viewport: { width: +(process.env.W || 1280), height: +(process.env.H || 720) }, deviceScaleFactor: +(process.env.DSF || 1) });
  const p = await c.newPage();
  if (THREE_DIR) await p.route(/cdn\.jsdelivr\.net\/npm\/three@0\.186\.0\//, (r) => r.fulfill({ path: path.join(THREE_DIR, new URL(r.request().url()).pathname.replace(/^\/npm\/three@0\.186\.0\//, '')), contentType: 'application/javascript' }));
  p.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 400)));
  await p.goto(`http://localhost:${PORT}/telebyte/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.TB && TB.ready, null, { timeout: 120000 });
  if (sel) await p.evaluate((id) => TB.select(id), sel);
  for (const h of hours) {
    await p.evaluate((h) => { for (let i = 0; i < 40; i++) TB.set(h * 3600); }, h);
    await p.waitForTimeout(300);
    const f = path.join(OUT, `tb_${(sel || 'tout')}_${h}h.png`); await p.screenshot({ path: f }); console.log('ok', f);
  }
  await b.close();
})();
