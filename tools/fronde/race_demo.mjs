// Course pilote du flux de démonstration, en console : timeline, points de contrôle, classement à intervalles.
// Usage : node tools/fronde/race_demo.mjs
import { DemoFeed } from '../../sandbox/race/DemoFeed.js';
const t0 = performance.now();
const feed = new DemoFeed();
const hh = (s) => { const m0 = Math.round(s / 60), h = Math.floor(m0 / 60), m = m0 % 60; return `${h} h ${String(m).padStart(2, '0')}`; };
console.log(`construite en ${(performance.now() - t0).toFixed(0)} ms — durée ${hh(feed.edition.t1)}`);
for (const r of feed.racers) {
  const tr = feed.tracks[r.id];
  console.log(`· ${r.name.padEnd(13)} arrivée ${hh(tr.finish)} | ${tr.cps.length} pts de contrôle`);
  for (const s of tr.segs) {
    if (s.kind === 'system') console.log(`    ${s.sys.name.padEnd(7)} ${s.plan.kind.padEnd(10)} agressivité ${s.plan.ag.toFixed(2)} | arrivée ${(s.plan.vInf / 1e3).toFixed(1)} km/s · périapse ${(s.rp / s.sys.R).toFixed(3)} R à ${hh(s.tp)} · poussée ${s.plan.dv.toFixed(0)} m/s · sortie ${(s.vOut / 1e3).toFixed(1)} km/s · dégâts ${(s.damage * 100).toFixed(0)} %${s.hit ? ' IMPACT' : ''}`);
    else console.log(`    étape ${s.from.name}→${s.to.name} ${hh(s.t1 - s.t0)}`);
  }
}
console.log('\npoints de contrôle :', feed.tracks.sentinelle.cps.map((c) => c.label).join(' → '));
for (const t of [3 * 3600, 6 * 3600, 20 * 3600, 36 * 3600, 50 * 3600, 60 * 3600, feed.edition.t1 + 60]) {
  const st = feed.standingsAt(t);
  console.log(`\n${hh(t)}  prochain : ${(feed.nextEvent(t) || {}).label || '—'}`);
  for (const row of st) {
    const s = feed.stateAt(row.id, t);
    const where = s.phase === 'system' ? `${s.system} ${(s.speed / 1e3).toFixed(1)} km/s ${s.temp.toFixed(0)} K` : s.phase === 'leg' ? `voyage ${s.legFrom}→${s.legTo} ${(s.f * 100).toFixed(0)} %` : 'arrivé';
    console.log(`  ${row.rank}. ${row.name.padEnd(13)} +${(row.gap / 60).toFixed(1).padStart(6)} min  ${where}  carburant ${(s.fuel * 100).toFixed(0)} %  intégrité ${(s.integrity * 100).toFixed(0)} %`);
  }
}
