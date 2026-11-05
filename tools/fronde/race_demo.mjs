// Course pilote du flux de démonstration, en console : timeline, points de contrôle, classement à intervalles.
// Usage : node tools/fronde/race_demo.mjs
import { DemoFeed } from '../../sandbox/race/DemoFeed.js';
const t0 = performance.now();
const feed = new DemoFeed();
const hh = (s) => { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return `${h} h ${String(m).padStart(2, '0')}`; };
console.log(`construite en ${(performance.now() - t0).toFixed(0)} ms — durée ${hh(feed.edition.t1)}`);
for (const r of feed.racers) {
  const tr = feed.tracks[r.id];
  const sys = tr.segs.filter((s) => s.kind === 'system').map((s) => `${s.sys.name} rp ${(s.rp / s.sys.R).toFixed(3)} R${s.hit ? ' IMPACT' : ''}`);
  console.log(`· ${r.name.padEnd(13)} arrivée ${hh(tr.finish)} | ${tr.cps.length} pts de contrôle | ${sys.join(' · ')}`);
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
