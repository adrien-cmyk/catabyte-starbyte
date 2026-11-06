// Voix off et fil d'actualité du Télébyte (Phase 4, étape 1), sur la démo hors ligne puis en répétition :
// sous-titres et paroles (synthèse vocale simulée : on enregistre ce qui serait dit), bandeau « dernière minute »,
// moments forts et « Revoir », bouton du commentaire, voix off qui continue dans la vue système, pas d'erreur.
// Usage : THREE_DIR=… OUT=… node tools/fronde/ui_commentary.js   (serveur statique de la racine du dépôt sur :8766)
const { chromium } = require('playwright'); const path = require('path'); const T = process.env.THREE_DIR, OUT = process.env.OUT || '.';
let fail = 0; const ok = (c, m) => { console.log((c ? 'ok — ' : 'ÉCHEC — ') + m); if (!c) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STUB = () => {
  // synthèse vocale simulée : chaque phrase « dure » 40 ms par caractère
  window.__spoken = [];
  const voices = [{ name: 'Thomas', lang: 'fr-FR' }, { name: 'Amélie', lang: 'fr-CA' }];
  let busy = null;
  window.SpeechSynthesisUtterance = function (text) { this.text = text; };
  Object.defineProperty(window, 'speechSynthesis', { value: {
    getVoices: () => voices, addEventListener() {}, cancel() { if (busy) { clearTimeout(busy.h); busy = null; } },
    speak(u) { window.__spoken.push({ text: u.text, voice: u.voice && u.voice.name, rate: u.rate, pitch: u.pitch }); if (!u.text.trim()) return; const h = setTimeout(() => { busy = null; u.onend && u.onend(); }, 40 * u.text.length); busy = { h }; },
  } });
};
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  if (T) await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@0\.186\.0\//, (r) => r.fulfill({ path: path.join(T, new URL(r.request().url()).pathname.replace(/^\/npm\/three@0\.186\.0\//, '')), contentType: 'application/javascript' }));
  await ctx.addInitScript(STUB);
  await ctx.addInitScript(() => { try { localStorage.setItem('fronde.tv', '0'); } catch (e) {} });   // mode TV coupé : l'essai pilote lui-même
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERR', e.message.slice(0, 200)); });
  p.on('console', (m) => { if (m.type() === 'warning' && /commentaire/.test(m.text())) { errs.push(m.text()); console.log('WARN', m.text().slice(0, 200)); } });
  await p.goto('http://localhost:8766/telebyte/index.html');
  await p.waitForFunction(() => window.TB && TB.ready, null, { timeout: 120000 });
  await p.mouse.click(200, 400);                                          // premier toucher : le son est autorisé
  await sleep(9000);
  const s1 = await p.evaluate(() => ({ log: TB.nar.log.map((x) => x.who + ' ' + x.text), sub: document.getElementById('sub').hidden ? null : document.getElementById('sub').textContent, spoken: window.__spoken.filter((x) => x.text.trim()), news: document.getElementById('news').hidden ? null : document.getElementById('news').textContent, t: TB.state.t }));
  console.log('  dit :', s1.log.slice(0, 6).join(' | '));
  ok(s1.log.length >= 2, `la voix off parle dès la lecture (${s1.log.length} phrases en 9 s, t = ${(s1.t / 3600).toFixed(1)} h)`);
  ok(s1.spoken.length >= 1 && s1.spoken.some((x) => x.voice === 'Thomas') , `synthèse vocale appelée (${s1.spoken.length} phrases, voix ${[...new Set(s1.spoken.map((x) => x.voice))].join(', ')})`);
  ok(!!s1.news && /Dernière minute/.test(s1.news), `bandeau « dernière minute » : ${s1.news}`);
  await p.screenshot({ path: `${OUT}/c1_voix.png` });
  // avancer au cœur de la course : faits forts
  await p.evaluate(() => TB.set(38.7 * 3600)); await p.evaluate(() => { document.getElementById('play').click(); }); await sleep(6000);
  const s2 = await p.evaluate(() => TB.nar.log.map((x) => x.text));
  ok(s2.some((x) => /On vous retrouve/.test(x)), 'saut dans le temps : la voix off fait le point au lieu de tout rattraper');
  console.log('  après le saut :', s2.slice(-4).join(' | '));
  // moments forts
  await p.click('#news'); await sleep(400);
  const rows = await p.$$eval('.nw-rows li', (l) => l.map((x) => x.textContent));
  ok(rows.length >= 3, `moments forts : ${rows.length} titres (${rows.slice(0, 3).join(' / ')})`);
  await p.screenshot({ path: `${OUT}/c2_moments.png` });
  // revoir un moment dans un système (plongée) : la vue système s'ouvre un peu avant
  const target = await p.evaluate(() => { const it = TB.news.items; const i = it.findIndex((x) => x.e.t > 3600 && (x.e.kind === 'plan' || x.e.kind === 'periapsis' || x.e.kind === 'failed')); return i < 0 ? null : { i, t: it[i].e.t, sys: it[i].e.sys }; });
  ok(!!target, 'un moment fort dans un système à revoir');
  if (target) {
    await p.click(`.nw-rows button[data-k="${target.i}"]`);
    for (let i = 0; i < 60 && !(await p.evaluate(() => TB.state.inSystem)); i++) await sleep(500);
    const st = await p.evaluate(() => TB.state);
    ok(st.inSystem && st.t < target.t && st.t > target.t - 3600, `Revoir : vue système ouverte à ${(st.t / 3600).toFixed(2)} h (moment à ${(target.t / 3600).toFixed(2)} h)`);
    const n0 = await p.evaluate(() => TB.nar.log.length); await sleep(12000);
    const s3 = await p.evaluate(() => ({ n: TB.nar.log.length, sub: document.getElementById('sub').textContent, subHidden: document.getElementById('sub').hidden, last: TB.nar.log.slice(-3).map((x) => x.text) }));
    ok(s3.n > n0, `dans la vue système, la voix off continue (${s3.n - n0} phrases en 12 s : ${s3.last.join(' | ')})`);
    await p.screenshot({ path: `${OUT}/c3_systeme.png` });
    const fr = p.frames().find((f) => f.url().includes('sandbox/index.html'));
    await fr.evaluate(() => document.querySelector('#rh-back').click()); await sleep(1500);
  }
  // bouton : voix → sous-titres → rien → voix
  const modes = [];
  for (let i = 0; i < 3; i++) { await p.click('#voice'); await sleep(200); modes.push(await p.evaluate(() => TB.nar.mode)); }
  ok(modes.join(',') === 'texte,off,voix', `bouton du commentaire : ${modes.join(' → ')}`);
  await p.click('#voice'); await sleep(200); const before = await p.evaluate(() => window.__spoken.length); await sleep(8000);
  const after = await p.evaluate(() => ({ n: window.__spoken.length, log: TB.nar.log.length }));
  ok(after.n === before, 'mode sous-titres : plus aucune parole');
  await p.click('#voice'); await p.click('#voice');                     // off → voix
  ok(!errs.length, `aucune erreur (${errs.length})`);
  // toutes les phrases d'une course de démo : pas de « undefined », pas de NaN
  const all = await p.evaluate(() => TB.nar.tl.flatMap((e) => TB.nar._linesFor(e, e.t).map((l) => l[1])));
  const bad = all.filter((x) => /undefined|NaN|null|\[object/.test(x));
  ok(all.length > 40 && !bad.length, `${all.length} phrases de course, ${bad.length} mal formées ${bad.slice(0, 2).join(' | ')}`);
  await b.close();
  console.log(fail ? `${fail} échec(s)` : 'COMMENTAIRE OK');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
