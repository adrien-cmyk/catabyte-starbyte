// Banc de mesure de la sandbox : pour chaque niveau de qualité et chaque vue de test, appels de dessin, triangles,
// points (toutes passes de rendu comprises) et temps CPU d'un pas de simulation, comparés aux budgets du plan (§9).
// Les temps d'image mesurés ici passent par SwiftShader (rendu logiciel) : ils ne disent rien du GPU d'un téléphone.
// Usage : node tools/fronde/perf.js [sortie.md]   (PORT, THREE_DIR comme shots.js)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 8766, THREE_DIR = process.env.THREE_DIR;
const OUT = process.argv[2] || 'docs/grande-fronde/PERF_PHASE1.md';
const VIEWS = ['system', 'giant', 'limb', 'night', 'ring-cross', 'ring-inside', 'graze-kesh', 'kesh', 'field-entry', 'field-in', 'racer', 'trajectory'];
const LEVELS = (process.env.LEVELS || '0,1,2,3').split(',').map(Number);

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const rows = [];
  for (const q of LEVELS) {
    const c = await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const p = await c.newPage();
    if (THREE_DIR) await p.route(/cdn\.jsdelivr\.net\/npm\/three@0\.186\.0\//, (r) => {
      const rel = new URL(r.request().url()).pathname.replace(/^\/npm\/three@0\.186\.0\//, '');
      r.fulfill({ path: path.join(THREE_DIR, rel), contentType: 'application/javascript' });
    });
    p.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 300)));
    await p.goto(`http://localhost:${PORT}/sandbox/index.html?clean&q=${q}`, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.RW && RW.ready, null, { timeout: 120000 });
    await p.evaluate(() => RW.stop());
    for (const v of VIEWS) {
      const r = await p.evaluate(async (v) => { RW.setView(v); RW.frames(3); await RW.settle(); RW.frames(90); return { ...RW.bench(8), fs: RW.info().field, rs: RW.info().ring }; }, v);
      rows.push({ q, v, ...r }); console.log(q, v, JSON.stringify(r));
    }
    await c.close();
  }
  await b.close();
  // rapport
  const names = ['Haute', 'Moyenne', 'Économe', 'Minimale'];
  let md = `# La Grande Fronde — mesures de la sandbox (Phase 1, étape 14)\n\n`;
  md += `Relevé automatique (\`node tools/fronde/perf.js\`) le ${new Date().toISOString().slice(0, 10)}, fenêtre 1280 × 720, densité de pixels 1.\n\n`;
  md += `- **Appels de dessin, triangles, points** : comptés sur toutes les passes (rendu, halo, sortie). Ils ne dépendent pas de la machine : ce sont les chiffres à comparer aux budgets.\n`;
  md += `- **Pas CPU** : temps JavaScript d'une image de simulation (lunes, champs, trajectoire, caméra), hors rendu. Indicatif.\n`;
  md += `- **Champs de rochers** : plafond à 70 / 60 / 50 / 40 % du budget de triangles selon le niveau ; au-delà, les seuils de détail se relèvent d'eux-mêmes (colonne « seuils × ») ; s'ils sont au maximum, la densité de rochers proches baisse (colonne « rochers gardés », avec la part fixée par le niveau de qualité).\n`;
  md += `- **Les temps d'image complets ne sont pas reportés** : ce banc tourne sur SwiftShader (rendu logiciel). Les images par seconde réelles se mesurent sur l'appareil, avec le compteur de perf.js.\n\n`;
  for (const q of LEVELS) {
    const R = rows.filter((r) => r.q === q), B = R[0] && R[0].budget;
    md += `## ${names[q]} — budget ≤ ${B.calls} appels, ≤ ${(B.tris / 1e3).toFixed(0)} k triangles\n\n`;
    md += `| Vue | Appels | Triangles | Points | Pas CPU (ms) | Seuils × | Rochers gardés | Budget |\n|---|---:|---:|---:|---:|---:|---:|---|\n`;
    for (const r of R) {
      const ok = r.calls <= B.calls && r.tris <= B.tris;
      const ps = Math.max((r.fs && r.fs.pxScale) || 1, (r.rs && r.rs.pxScale) || 1);
      md += `| ${r.v} | ${r.calls} | ${(r.tris / 1e3).toFixed(0)} k | ${(r.points / 1e3).toFixed(1)} k | ${r.stepMs} | ${ps.toFixed(2)} | ${Math.round(100 * Math.min((r.fs && r.fs.tris ? r.fs.keep : 1) ?? 1, (r.rs && r.rs.tris ? r.rs.keep : 1) ?? 1))} % | ${ok ? 'tenu' : '**dépassé**'} |\n`;
    }
    md += '\n';
  }
  fs.writeFileSync(OUT, md); console.log('écrit', OUT);
})();
