// Test du flux publié au fil de l'eau (Phase 3, étape 2) : à chaque instant t, ServerFeed (plans reçus jusqu'à t)
// doit montrer EXACTEMENT ce que montre la course complète au même instant — positions, vitesses, carburant, coque,
// classement, écarts — sans rien savoir de l'avenir (aucun plan d'un système pas encore atteint).
// Usage : node tools/fronde/feed_test.mjs
const here = new URL('.', import.meta.url);
const { DemoFeed, ServerFeed, MockSource } = await import(new URL('../../sandbox/race/DemoFeed.js', here));
const D = await import(new URL('../../sandbox/race/raceData.js', here));
let fail = 0, n = 0, updates = 0;
const bad = (m) => { if (fail++ < 12) console.log('ÉCHEC', m); };
for (const seed of ['fronde-222', 'test-7', 'test-19']) {
  const pilot = { ...D.PILOT, seed }, full = new DemoFeed({ pilot }), src = new MockSource({ pilot });
  const live = new ServerFeed({ source: src, pilot }).onUpdate(() => updates++);
  for (let t = 0; t <= full.edition.t1 + 600; t += 397) {
    live.sync(t); n++;
    // rien de l'avenir : aucun plan reçu dont l'entrée est après t
    for (const k of Object.keys(live.plans)) { const x = src.full.revealed.find((r) => `${r.racer}|${r.sys}` === k); if (x.t > t) bad(`${seed} t=${t} : plan ${k} reçu trop tôt`); }
    const a = full.standingsAt(t), b = live.standingsAt(t);
    if (a.map((r) => r.id + ':' + Math.round(r.gap)).join() !== b.map((r) => r.id + ':' + Math.round(r.gap)).join()) bad(`${seed} t=${t} : classement ${a.map((r) => r.id).join()} ≠ ${b.map((r) => r.id).join()}`);
    for (const r of D.RACERS) {
      const x = full.stateAt(r.id, t), y = live.stateAt(r.id, t);
      if (x.phase !== y.phase || x.system !== y.system || x.legTo !== y.legTo) { bad(`${seed} t=${t} ${r.id} : phase ${x.phase}/${x.system || x.legTo} ≠ ${y.phase}/${y.system || y.legTo}`); continue; }
      if (x.p && Math.hypot(x.p[0] - y.p[0], x.p[1] - y.p[1], x.p[2] - y.p[2]) > 1e-6) bad(`${seed} t=${t} ${r.id} : position différente`);
      if (Math.abs(x.fuel - y.fuel) > 1e-12 || Math.abs(x.integrity - y.integrity) > 1e-12) bad(`${seed} t=${t} ${r.id} : carburant/coque différents`);
      if (x.phase === 'leg' && Math.abs(x.f - y.f) > 1e-12) bad(`${seed} t=${t} ${r.id} : avancement d'étape différent`);
    }
  }
  if (!live.complete || Math.abs(live.edition.t1 - full.edition.t1) > 1e-6) bad(`${seed} : fin de course différente`);
}
console.log(fail ? `${fail} échec(s) sur ${n} instants` : `ok : ${n} instants comparés sur 3 éditions, identiques à la course complète ; ${updates} mises à jour ; aucun plan reçu en avance`);
process.exit(fail ? 1 : 0);
