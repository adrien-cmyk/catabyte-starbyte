// Réalisateur du Télébyte, mode TV (Phase 4, étape 4), sur la démo hors ligne : sans aucun geste, la régie plonge dans
// le système où ça se passe et suit un racer, montre le couloir pendant une étape, affiche le bandeau, lance un
// ralenti sur un moment fort ; un toucher la met en pause. Captures dans OUT.
// Usage : THREE_DIR=… OUT=… node tools/fronde/ui_director.js   (serveur statique de la racine du dépôt sur :8766)
const { chromium } = require('playwright'); const path = require('path'); const T = process.env.THREE_DIR, OUT = process.env.OUT || '.';
let fail = 0; const ok = (c, m) => { console.log((c ? 'ok — ' : 'ÉCHEC — ') + m); if (!c) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  if (T) await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@0\.186\.0\//, (r) => r.fulfill({ path: path.join(T, new URL(r.request().url()).pathname.replace(/^\/npm\/three@0\.186\.0\//, '')), contentType: 'application/javascript' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('fronde.voice', 'texte'); localStorage.setItem('fronde.tv', '0'); } catch (e) {} });   // mode TV activé après le placement de l'horloge (sinon la régie plonge dès le chargement)
  await ctx.addInitScript(() => { try { for (const k of ['repetition', 'essai']) localStorage.setItem('fronde.racers.' + k, '1'); const S = Storage.prototype.getItem; Storage.prototype.getItem = function (k) { return /^fronde\.racers\./.test(k) ? '1' : S.call(this, k); }; } catch (e) {} });   // fiche des racers déjà vue : l'essai pilote lui-même
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERR', e.message.slice(0, 200)); });
  p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)); if (/réalisateur/.test(m.text())) { errs.push(m.text()); console.log('WARN', m.text().slice(0, 200)); } });
  await p.goto('http://localhost:8766/telebyte/index.html'); await p.waitForFunction(() => window.TB && TB.ready, null, { timeout: 120000 });
  // juste avant le premier passage à Kerath (plongée du Fulgurant ?) : la régie doit y plonger d'elle-même
  const tp = await p.evaluate(() => { let m = Infinity; for (const r of TB.feed.racers) { const s = TB.feed.tracks[r.id].segs.find((x) => x.kind === 'system'); m = Math.min(m, s.tp); } return m; });
  await p.evaluate((x) => { TB.set(x); document.getElementById('play').click(); }, tp - 2400);
  await p.evaluate(() => document.getElementById('tv').click()); ok(await p.evaluate(() => TB.dir.on), 'mode TV activé (bouton 📺)');
  let inSys = false; for (let i = 0; i < 80 && !inSys; i++) { await sleep(500); inSys = await p.evaluate(() => TB.state.inSystem); }
  const st = await p.evaluate(() => TB.dir.state);
  ok(inSys, `la régie plonge seule dans le système (${st.target && st.target.kind} ${st.target && st.target.sys}, ${st.cuts} coupe(s))`);
  ok(!(await p.evaluate(() => document.getElementById('lower').hidden)) || st.cuts > 0, 'bandeau d\'incrustation affiché');
  await sleep(2500);
  const fr = p.frames().find((f) => f.url().includes('sandbox/index.html'));
  const view = await fr.evaluate(() => RW.camDiag().view);
  ok(view === 'follow', `dans le système : poursuite du racer (${view})`);
  await p.screenshot({ path: `${OUT}/d1_systeme.png` });
  // ralenti sur un moment fort du racer suivi (au plus 60 s)
  let slows = 0, badge = false; for (let i = 0; i < 120 && !slows; i++) { await sleep(500); slows = (await p.evaluate(() => TB.dir.state.slows.length)); if (slows) badge = await fr.evaluate(() => !document.getElementById('slowbadge').hidden); }
  if (!slows) { const fr2 = p.frames().find((f) => f.url().includes('sandbox/index.html')); console.log('   iframe', JSON.stringify(await fr2.evaluate(async () => { const a = RW.frameCount(), l = RW.live(); await new Promise((r) => setTimeout(r, 2000)); return { a, b: RW.frameCount(), l, l2: RW.live() }; }))); }
  if (!slows) console.log('   diag', JSON.stringify(await p.evaluate(() => ({ t: TB.state.t, sel: TB.state.sel, tgt: TB.dir.state.target, strong: TB.nar.tl.filter((e) => e.racer === TB.state.sel && (e.kind === 'moon' || e.kind === 'failed' || (e.kind === 'periapsis' && e.data.plan === 'plongée'))).map((e) => [e.kind, Math.round(e.t)]) }))));
  ok(slows > 0, `ralenti lancé (${await p.evaluate(() => TB.dir.state.slows.join(', '))}) ; bandeau « Ralenti » : ${badge}`);
  if (badge) { await sleep(3000); await p.screenshot({ path: `${OUT}/d2_ralenti.png` }); const vis = await fr.evaluate(() => { const d = RW.camDiag(); return d.chase; }); ok(vis, 'ralenti : la caméra reste en poursuite'); }
  // une étape interstellaire : le couloir
  const legT = await p.evaluate(() => { const s = TB.feed.tracks[TB.feed.racers[0].id].segs.find((x) => x.kind === 'leg'); return (s.t0 + s.t1) / 2; });
  await fr.evaluate(() => document.querySelector('#rh-back').click()).catch(() => {}); await sleep(200);
  await p.evaluate(() => TB.dir.resume());                                   // le clic « retour » compte comme un geste : on relance la régie
  await p.evaluate((x) => { TB.set(x); document.getElementById('play').click(); TB.dir.resume(); }, legT);
  let corr = false; for (let i = 0; i < 60 && !corr; i++) { await sleep(500); corr = await p.evaluate(() => TB.cor.isOpen && !TB.state.inSystem); }
  ok(corr, `pendant une étape : le couloir (${JSON.stringify(await p.evaluate(() => TB.dir.state.target && TB.dir.state.target.kind))})`);
  await p.screenshot({ path: `${OUT}/d3_couloir.png` });
  // un toucher : pause de la régie
  await p.mouse.click(200, 500); await sleep(900);   // la pause part juste après le clic
  const paused = await p.evaluate(() => TB.dir.state.pausedUntil > performance.now());
  ok(paused && !(await p.evaluate(() => document.getElementById('lower').hidden)), 'un toucher met la régie en pause (bandeau « en pause »)');
  // bouton 📺 : arrêt
  ok(await p.$('#lower [data-tv-off]') !== null, 'bandeau de pause : « rendre à la régie » et « arrêter la TV »');
  await p.click('#lower [data-tv-resume]'); ok(await p.evaluate(() => TB.dir.on && !TB.dir.paused()), '« rendre à la régie » : elle reprend');
  await p.click('#tv'); ok(await p.evaluate(() => !TB.dir.on), 'bouton 📺 : mode TV coupé');
  ok(!errs.length, `aucune erreur (${errs.length})`);
  await b.close();
  console.log(fail ? `${fail} échec(s)` : 'RÉGIE OK');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
