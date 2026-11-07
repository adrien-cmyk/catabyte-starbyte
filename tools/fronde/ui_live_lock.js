// Vue système en direct (répétition #repetition, faux serveur dans la page, course très accélérée) :
// les boutons d'étape ouvrent le direct si la course n'a pas quitté le système, le revoir sinon ; en direct, la vue
// reste calée sur l'horloge du serveur (pas de va-et-vient) ; la pastille « revoir » ramène au direct.
// Usage : THREE_DIR=… node tools/fronde/ui_live_lock.js   (serveur statique de la racine du dépôt sur :8766)
const { chromium } = require('playwright'); const path = require('path'); const T = process.env.THREE_DIR;
let fail = 0; const ok = (c, m) => { console.log((c ? 'ok — ' : 'ÉCHEC — ') + m); if (!c) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  if (T) await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@0\.186\.0\//, (r) => r.fulfill({ path: path.join(T, new URL(r.request().url()).pathname.replace(/^\/npm\/three@0\.186\.0\//, '')), contentType: 'application/javascript' }));
  await ctx.addInitScript(() => { window.FRONDE_DEMO = { countdown: 5, rate: 1500 }; });
  await ctx.addInitScript(() => { try { localStorage.setItem('fronde.tv', '0'); } catch (e) {} });   // mode TV coupé : l'essai pilote lui-même
  await ctx.addInitScript(() => { try { for (const k of ['repetition', 'essai']) localStorage.setItem('fronde.racers.' + k, '1'); localStorage.setItem('sb_fronde_hello', '9'); localStorage.setItem('fronde.voice2', 'texte'); const S = Storage.prototype.getItem; Storage.prototype.getItem = function (k) { return /^fronde\.racers\./.test(k) ? '1' : S.call(this, k); }; } catch (e) {} });   // fiche des racers déjà vue : l'essai pilote lui-même
  const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 200)));
  await p.goto('http://localhost:8766/telebyte/index.html#repetition');
  await p.waitForFunction(() => window.TB && TB.ready && TB.live(), null, { timeout: 120000 });
  const sys = () => p.frames().find((f) => f.url().includes('sandbox/index.html'));
  const inSys = async () => { for (let i = 0; i < 80; i++) { if (await p.evaluate(() => TB.state.inSystem) && sys() && await sys().evaluate(() => window.RW && RW.live && RW.live().now != null).catch(() => false)) return true; await sleep(250); } return false; };
  const back = async () => { await sys().evaluate(() => document.querySelector('#rh-back').click()); await sleep(1500); };
  // attendre que la course ait quitté Kerath (tous les racers au-delà)
  await p.waitForFunction(() => TB.live().now > 8 * 3600, null, { timeout: 240000 });
  console.log('maintenant', (await p.evaluate(() => TB.live().now / 3600)).toFixed(1) + ' h');
  await p.click('#stages button[data-i="0"]');
  ok(await inSys(), 'Kerath : vue système ouverte');
  await sleep(1500);
  let L = await sys().evaluate(() => RW.live());
  ok(!L.lock && L.t < L.now - 3600, `Kerath quitté : revoir (t ${(L.t / 3600).toFixed(1)} h, présent ${(L.now / 3600).toFixed(1)} h, pastille « ${L.pill} »)`);
  ok(/revoir/.test(L.pill) && /^×/.test(L.speed), 'pastille « revoir », vitesse de revoir');
  await sys().evaluate(() => document.querySelector('#race .rh-live').click()); await sleep(800);
  L = await sys().evaluate(() => RW.live());
  ok(L.lock && Math.abs(L.t - L.now) / 1500 < 1 && L.speed === 'direct', `pastille touchée : retour au direct (écart ${((L.now - L.t) / 1500).toFixed(2)} s réelles, « ${L.pill} »)`);
  await back();
  // une étape que la course n'a pas quittée (la dernière) : direct, calé sur l'horloge
  await p.click('#stages button[data-i="9"]');
  ok(await inSys(), 'Orvane (dernière étape) : vue système ouverte');
  const samples = [];
  for (let i = 0; i < 12; i++) { samples.push(await sys().evaluate(() => RW.live())); await sleep(250); }
  const maxGap = Math.max(...samples.map((s) => Math.abs(s.now - s.t))), mono = samples.every((s, i) => !i || s.t >= samples[i - 1].t);
  // l'écart vient seulement de l'image en cours (SwiftShader : images lentes ; course ×1500) : on le compte en secondes réelles
  const f0 = await sys().evaluate(() => RW.frameCount()); await sleep(2000); const fps = (await sys().evaluate(() => RW.frameCount()) - f0) / 2;
  ok(samples.every((s) => s.lock) && mono && maxGap / 1500 < Math.max(4, 8 / Math.max(fps, 0.5)), `Orvane : direct tenu (verrou ${samples.map((s) => +s.lock).join('')}, écart max ${(maxGap / 1500).toFixed(2)} s réelles à ${fps.toFixed(1)} im/s, temps croissant : ${mono})`);
  // la caméra s'oriente au doigt (glisser) en direct, dans les trois vues
  for (const v of ['overview', 'gates', 'follow']) {
    // personne dans ce système : « Suivre » ouvre le couloir du Télébyte (Phase 4), rien à orienter ici
    if (v === 'follow' && await sys().evaluate(() => !document.getElementById('rh-corr').hidden)) { console.log('   (Suivre : racers en voyage, le couloir prend le relais)'); continue; }
    await sys().evaluate((v) => document.querySelector(`.rh-views button[data-v="${v}"]`).click(), v); await sleep(1500);
    const y0 = await sys().evaluate(() => RW.camYaw());
    await p.mouse.move(150, 420); await p.mouse.down(); for (let i = 0; i < 10; i++) { await p.mouse.move(150 + i * 15, 420); await sleep(40); } await p.mouse.up();
    await sleep(1200);
    const y1 = await sys().evaluate(() => RW.camYaw());
    ok(Math.abs(y1 - y0) > 0.1, `vue ${v} en direct : la caméra tourne au doigt (lacet ${y0.toFixed(2)} → ${y1.toFixed(2)})`);
  }
  await b.close();
  console.log(fail ? `${fail} échec(s)` : 'DIRECT VERROUILLÉ');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
