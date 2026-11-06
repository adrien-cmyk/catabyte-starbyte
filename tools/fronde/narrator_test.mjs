// Essai du commentateur (Phase 4) sans navigateur : horloge réelle simulée, course de démo.
// Départ annoncé, « revoir » redit les faits, vue système (instant tous les 250 ms), pause calme, phrases d'un fait d'affilée.
// Usage : node tools/fronde/narrator_test.mjs
let REAL = 0; globalThis.performance = { now: () => REAL };
const { DemoFeed } = await import(new URL('../../sandbox/race/DemoFeed.js', import.meta.url));
const { createNarrator } = await import(new URL('../../telebyte/narrator.js', import.meta.url));
const f = new DemoFeed(), E = f.edition, racer = Object.fromEntries(E.racers.map((r) => [r.id, r]));
const hh = (s) => `${Math.floor(s/3600)} h`, dur = (s) => `${Math.round(s/60)} min`;
const mk = () => createNarrator({ feed: f, E, racer, hh, dur, pools: () => null });
let fail = 0; const ok = (c, m) => { console.log((c ? 'ok — ' : 'ÉCHEC — ') + m); if (!c) fail++; };
const run = (nar, t0, t1, rate, step = 0.05, tickEvery = 0) => { let t = t0, acc = 0; while (t < t1) { REAL += step * 1000; t += rate * step; acc += step; if (!tickEvery || acc >= tickEvery) { acc = 0; nar.update(Math.min(t, t1)); } else nar.update(nar._lastSent ?? t0); } return t; };
// 1. départ annoncé
let n = mk(); n.update(0); run(n, 0, 600, 60);
ok(n.log.some((x) => /parti|Top départ/.test(x.text)), 'le départ est annoncé');
// 2. revoir : un fait déjà dit est redit après un retour en arrière
n = mk(); const fe = n.tl.find((e) => e.prio >= 4 && e.t > 3600 * 3);
n.update(fe.t - 1200); run(n, fe.t - 1200, fe.t + 600, 60);
const c1 = n.log.length; n.update(fe.t - 1200); REAL += 50; run(n, fe.t - 1200, fe.t + 600, 60);
const lines = n._linesFor(fe, fe.t).map((l) => l[1]);
ok(n.log.slice(c1).some((x) => lines.includes(x.text) || x.text.split(' ').slice(0, 3).join(' ') === lines[0].split(' ').slice(0, 3).join(' ')), `revoir : « ${fe.kind} » redit après le retour en arrière`);
// 3. vue système (instant envoyé tous les 250 ms) à ×200 : les passages sont dits
n = mk(); const sys0 = n.tl.find((e) => e.kind === 'periapsis'); let t = sys0.t - 3000; n.update(t);
let acc = 0; while (t < sys0.t + 3000) { REAL += 16; acc += 16; t += 200 * 0.016; if (acc >= 250) { acc = 0; n._lt = t; } n.update(n._lt ?? sys0.t - 3000); }
const per = n.log.filter((x) => /Périapse|au plus près/.test(x.text)).length;
ok(per >= 1 && n.log.length >= 5, `vue système ×200 (instant tous les 250 ms) : ${n.log.length} phrases, ${per} périapse(s)`);
// 4. pause : pas de bavardage
n = mk(); run(n, 20 * 3600, 22 * 3600, 600); const c0 = n.log.length; for (let i = 0; i < 60 * 20; i++) { REAL += 50; n.update(22 * 3600); }
ok(n.log.length - c0 <= 3, `en pause 60 s : ${n.log.length - c0} phrase(s)`);
// 5. les phrases d'un fait restent ensemble
n = mk(); run(n, 0, 70 * 3600, 600);
let split = 0; for (let i = 0; i + 1 < n.log.length; i++) { if (n.log[i + 1].who === 'B' && /encaisse/.test(n.log[i + 1].text) && !/Périapse|au plus près/.test(n.log[i].text)) split++; }
ok(split === 0, `phrases d'un même fait d'affilée (${split} coupure)`);
console.log(fail ? fail + ' échec(s)' : 'SIMULATION OK'); process.exit(fail ? 1 : 0);
