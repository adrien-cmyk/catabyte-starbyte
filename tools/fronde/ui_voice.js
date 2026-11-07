// Vraies voix des commentateurs (telebyte/voice.js), sans réseau : l'espace « fronde-voix » et la fonction fronde-voice
// sont simulés. Vérifie : phrase absente → lue une fois par la fonction → jouée ; sous-titres en même temps ; les
// phrases du moment (heure, chiffres) ne sont jamais envoyées à la lecture.
// Usage : THREE_DIR=… node tools/fronde/ui_voice.js   (serveur statique de la racine du dépôt sur :8766)
const { chromium } = require('playwright'); const path = require('path'); const T = process.env.THREE_DIR;
let fail = 0; const ok = (c, m) => { console.log((c ? 'ok — ' : 'ÉCHEC — ') + m); if (!c) fail++; };
const wav = (() => { const n = 4000, b = Buffer.alloc(44 + n); b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40); b.fill(128, 44); return b; })();
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  if (T) await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@0\.186\.0\//, (r) => r.fulfill({ path: path.join(T, new URL(r.request().url()).pathname.replace(/^\/npm\/three@0\.186\.0\//, '')), contentType: 'application/javascript' }));
  let heads = 0, gens = 0; const have = new Set();
  await ctx.route(/supabase\.co\/storage\/v1\/object\/public\/fronde-voix\//, (r) => { heads++; const k = r.request().url().split('/').pop(); if (have.has(k) || r.request().method() === 'GET') return r.fulfill({ status: 200, body: wav, contentType: 'audio/mpeg' }); return r.fulfill({ status: 404, body: '' }); });
  const asked = []; await ctx.route(/supabase\.co\/functions\/v1\/fronde-voice/, async (r) => { gens++; const j = JSON.parse(r.request().postData()); asked.push(j.text); const u = 'https://elupnpdcblztpfywnhjl.supabase.co/storage/v1/object/public/fronde-voix/gen' + gens + '.mp3'; have.add('gen' + gens + '.mp3'); r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ url: u, cached: false }) }); });
  await ctx.addInitScript(() => { window.FRONDE_TOKEN = 'jeton'; window.__plays = []; const p = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { window.__plays.push(this.src.slice(0, 90)); return p.call(this); };
    try { localStorage.setItem('fronde.tv', '0'); localStorage.setItem('sb_fronde_hello', '9'); } catch (e) {} });
  const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 200)));
  // en direct seulement, le Télébyte fait lire les phrases manquantes : ici, la démo l'autorise pour l'essai
  await p.addInitScript(() => { window.FRONDE_VOICE_GENERATE = true; });
  await p.goto('http://localhost:8766/telebyte/index.html');
  await p.waitForFunction(() => window.TB && TB.ready, null, { timeout: 120000 });
  await p.mouse.click(195, 240); await p.waitForTimeout(25000);
  const r = await p.evaluate(() => ({ mode: TB.nar.mode, log: TB.nar.log.slice(0, 6).map((x) => x.who + ' ' + x.text.slice(0, 60)), plays: window.__plays.filter((s) => !s.startsWith('data:')), ok: TB.nar.audioOk, sub: document.getElementById('sub').textContent.slice(0, 80) }));
  ok(r.mode === 'voix', `mode voix par défaut (${r.mode})`);
  ok(gens > 0 && r.plays.length > 0, `phrases lues par la fonction (${gens}) puis jouées (${r.plays.length})`);
  ok(!asked.some((x) => /Point course|On vous retrouve|réservoir à \d/.test(x)), 'les phrases du moment (heure, chiffres) restent en sous-titres');
  ok(!!r.sub, `sous-titres affichés (« ${r.sub.slice(0, 40)}… »)`);
  console.log(fail ? `${fail} échec(s)` : 'VOIX OK'); process.exitCode = fail ? 1 : 0;
  await b.close();
})();
