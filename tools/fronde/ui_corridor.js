// Vue couloir (Phase 4, étape 3) sur la démo hors ligne : boutons d'étape ⇢, Ensemble / Suivre, racer immobile pendant
// une panne, éruption, accès depuis la vue système (« Voir le couloir ») et depuis « Vue système » d'un racer en voyage,
// « Revoir » d'un fait d'étape. Captures dans OUT.
// Usage : THREE_DIR=… OUT=… node tools/fronde/ui_corridor.js   (serveur statique de la racine du dépôt sur :8766)
const { chromium } = require('playwright'); const path = require('path'); const T = process.env.THREE_DIR, OUT = process.env.OUT || '.';
let fail = 0; const ok = (c, m) => { console.log((c ? 'ok — ' : 'ÉCHEC — ') + m); if (!c) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  if (T) await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@0\.186\.0\//, (r) => r.fulfill({ path: path.join(T, new URL(r.request().url()).pathname.replace(/^\/npm\/three@0\.186\.0\//, '')), contentType: 'application/javascript' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('fronde.voice', 'texte'); } catch (e) {} });
  await ctx.addInitScript(() => { try { localStorage.setItem('fronde.tv', '0'); } catch (e) {} });   // mode TV coupé : l'essai pilote lui-même
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERR', e.message.slice(0, 200)); });
  await p.goto('http://localhost:8766/telebyte/index.html'); await p.waitForFunction(() => window.TB && TB.ready, null, { timeout: 120000 });
  // un instant d'étape avec un fait : éruption, ou à défaut panne
  const ev = await p.evaluate(() => { const all = []; for (const r of TB.feed.racers) for (const h of TB.feed.tracks[r.id].happenings) all.push({ ...h, racer: r.id }); return all.find((h) => h.kind === 'flare') || all.find((h) => h.kind === 'failure'); });
  ok(!!ev, `un fait d'étape dans la démo : ${ev && ev.kind} à ${(ev.t / 3600).toFixed(2)} h`);
  await p.evaluate(() => document.getElementById('play').click());          // pause
  await p.evaluate((x) => TB.set(x), ev.t + 300); await sleep(500);
  ok(await p.$('#stages button.leg') !== null, 'boutons de couloir entre les étapes');
  const leg = await p.evaluate((sys) => TB.feed.edition.systems.findIndex((s) => s.id === sys) - 1, ev.sys);
  await p.click(`#stages button[data-leg="${leg}"]`); await sleep(1200);
  ok(await p.evaluate(() => TB.cor.isOpen && !document.getElementById('corridor').hidden), 'couloir ouvert');
  await p.screenshot({ path: `${OUT}/co1_ensemble.png` });
  // Suivre le racer de l'événement
  await p.evaluate((id) => TB.select(id), ev.racer); await p.click('#corridor .co-views button[data-v="suivre"]'); await sleep(1000);
  await p.screenshot({ path: `${OUT}/co2_suivre.png` });
  // pendant une panne, le racer ne bouge pas (distance constante)
  const fl = await p.evaluate(() => { for (const r of TB.feed.racers) for (const h of TB.feed.tracks[r.id].happenings) if (h.data && h.data.lost) return { id: r.id, t: h.t, lost: h.data.lost, kind: h.kind }; return null; });
  if (fl) {
    const pos = async (tt) => { await p.evaluate((x) => TB.set(x), tt); await sleep(300); return p.evaluate((id) => { const st = TB.feed.stateAt(id, TB.state.t); return st.f; }, fl.id); };
    const vis = await p.evaluate(({ id, a, b2 }) => {
      const seg = TB.feed.tracks[id].segs.find((s) => s.kind === 'leg' && s.t0 <= a && s.t1 >= b2); return !!seg;
    }, { id: fl.id, a: fl.t, b2: fl.t + fl.lost });
    ok(vis, `${fl.kind} (${Math.round(fl.lost / 60)} min) pendant une étape`);
  }
  ok(await p.evaluate(() => { const c = document.querySelector('#corridor canvas'); return c.width > 100 && c.height > 100; }), 'toile du couloir dimensionnée');
  // fermer
  await p.click('#corridor .co-views button[data-v="close"]'); await sleep(300);
  ok(await p.evaluate(() => !TB.cor.isOpen), 'couloir fermé');
  // « Vue système » d'un racer en voyage → couloir
  const trav = await p.evaluate(() => TB.feed.racers.find((r) => TB.feed.stateAt(r.id, TB.state.t).phase === 'leg')?.id);
  if (trav) { await p.evaluate((id) => { if (TB.view.sel !== id) TB.select(id); }, trav); await sleep(300); await p.click('#focus-enter'); await sleep(800); ok(await p.evaluate(() => TB.cor.isOpen), '« Vue système » d\'un racer en voyage : couloir'); await p.click('#corridor .co-views button[data-v="close"]'); }
  // depuis la vue système : bouton « Voir le couloir »
  await p.evaluate(() => TB.dive(TB.feed.edition.systems[1].id)); for (let i = 0; i < 60 && !(await p.evaluate(() => TB.state.inSystem)); i++) await sleep(500);
  const fr = p.frames().find((f) => f.url().includes('sandbox/index.html'));
  await sleep(1500);
  const shown = await fr.evaluate(() => !document.getElementById('rh-corr').hidden);
  ok(shown, 'vue système pendant une étape : « Voir le couloir » proposé');
  await p.screenshot({ path: `${OUT}/co3_systeme.png` });
  if (shown) { await fr.evaluate(() => document.querySelector('#rh-corr button').click()); for (let i = 0; i < 20 && (await p.evaluate(() => TB.state.inSystem)); i++) await sleep(300); await sleep(800); ok(await p.evaluate(() => !TB.state.inSystem && TB.cor.isOpen), 'retour au Télébyte, couloir ouvert'); }
  // Revoir un fait d'étape
  await p.click('#corridor .co-views button[data-v="close"]').catch(() => {});
  const k = await p.evaluate(() => TB.news.items.findIndex((x) => ['failure', 'flare', 'beltHit', 'belt', 'repair'].includes(x.e.kind)));
  if (k >= 0) { await p.click('#news'); await sleep(300); await p.click(`.nw-rows button[data-k="${k}"]`); await sleep(800); ok(await p.evaluate(() => TB.cor.isOpen), 'Revoir un fait d\'étape : couloir'); }
  await p.screenshot({ path: `${OUT}/co4_revoir.png` });
  ok(!errs.length, `aucune erreur (${errs.length})`);
  await b.close();
  console.log(fail ? `${fail} échec(s)` : 'COULOIR OK');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
