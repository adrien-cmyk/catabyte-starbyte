// Captures des vues de test de la sandbox (Playwright + SwiftShader, rendu image par image).
// Usage : node tools/fronde/shots.js [géante] [vue…]
//   OUT=dossier de sortie, PORT=port du serveur statique déjà lancé à la racine du dépôt (défaut 8766),
//   THREE_DIR=chemin d'un node_modules/three@0.186.0 local si le CDN n'est pas joignable, DSF=1|2, W/H=taille.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const OUT = process.env.OUT || './shots/';
const PORT = process.env.PORT || 8766;
const THREE_DIR = process.env.THREE_DIR;
const giants = (process.argv[2] || 'amber').split(',');
const views = process.argv.slice(3);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const c = await b.newContext({ viewport: { width: +(process.env.W || 1280), height: +(process.env.H || 720) }, deviceScaleFactor: +(process.env.DSF || 1) });
  const p = await c.newPage();
  if (THREE_DIR) await p.route(/cdn\.jsdelivr\.net\/npm\/three@0\.186\.0\//, (r) => {
    const rel = new URL(r.request().url()).pathname.replace(/^\/npm\/three@0\.186\.0\//, '');
    r.fulfill({ path: path.join(THREE_DIR, rel), contentType: 'application/javascript' });
  });
  p.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 600)));
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('CON', m.type(), m.text().slice(0, 600)); });
  await p.goto(`http://localhost:${PORT}/sandbox/index.html?clean${process.env.Q ? '&q=' + process.env.Q : ''}`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.RW && RW.ready, null, { timeout: 120000 });
  await p.evaluate(() => RW.stop());
  for (const g of giants) {
    await p.evaluate((g) => (['kerath', 'vessa', 'nox'].includes(g) ? RW.setSystem(g) : RW.setGiant(g)), g);
    const vs = views.length ? views : await p.evaluate(() => RW.views);
    for (const v of vs) {
      if (v.startsWith('cine:')) {           // plan de la caméra cinématique : cine:<indice>:<fraction>
        const [, i, u] = v.split(':');
        await p.evaluate(async ([i, u]) => { RW.cine(+i, +u); RW.frames(2); await RW.settle(); RW.frames(2); }, [i, u || 0.5]);
        await p.waitForTimeout(700);          // fin du fondu
        console.log('diag', JSON.stringify(await p.evaluate(() => RW.cineDiag())));
      } else await p.evaluate(async (v) => { RW.setView(v); RW.frames(3); await RW.settle(); if (v.startsWith('fleet')) { const t0 = performance.now(); while (!RW.fleetReady() && performance.now() - t0 < 60000) await new Promise((r) => setTimeout(r, 200)); } RW.frames(60); }, v);   // 60 images : le plafond de triangles a convergé
      const f = path.join(OUT, `${g}_${v.replace(/:/g, '-')}.png`);
      await p.screenshot({ path: f, timeout: 120000 });
      console.log('ok', f, JSON.stringify(await p.evaluate(() => RW.exag ? RW.exag() : RW.info())));
    }
  }
  await b.close();
})();
