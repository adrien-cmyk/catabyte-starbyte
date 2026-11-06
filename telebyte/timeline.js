// Chronologie de la course (Phase 4) : les faits marquants, déduits de ce que le flux a déjà révélé. Elle nourrit le
// fil d'actualité et la voix off. JavaScript pur : aucun accès au rendu ni à la page.
//
//   buildTimeline(feed) → [{ t, kind, racer, sys, prio, data, key }] trié par t
//
// ÉQUITÉ : la liste peut contenir des faits à venir de quelques heures (un plan publié à l'entrée d'un système décrit
// tout le passage) ; les lecteurs ne montrent QUE les faits dont t ≤ l'instant affiché (filtre `upTo`).
// Les événements du moteur (Phase 4, partie A) arrivent dans tracks[id].happenings et sont repris tels quels.
const G0 = 9.81;

// accès aux grandeurs d'un passage à l'instant t (échantillons du moteur, interpolation linéaire)
function sampleNear(samples, t) {
  let lo = 0, hi = samples.length - 1;
  if (!samples.length) return null;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (samples[m].t <= t) lo = m; else hi = m; }
  return samples[lo];
}
const speedOf = (s) => (s && s.v ? Math.hypot(s.v[0], s.v[1], s.v[2]) : 0);

export function buildTimeline(feed) {
  const E = feed.edition, out = [];
  const push = (e) => { e.key = `${e.kind}|${e.racer || ''}|${e.sys || ''}|${Math.round(e.t)}`; out.push(e); };
  const lastSys = E.systems[E.systems.length - 1];
  push({ t: 0, kind: 'start', prio: 5, data: {} });
  for (const r of E.racers) {
    const tr = feed.tracks[r.id]; if (!tr) continue;
    let fuelWarn = 1;
    for (const seg of tr.segs) {
      if (seg.kind === 'system') {
        const sys = seg.sys, plan = seg.plan || {};
        push({ t: seg.t0 + 1, kind: 'plan', racer: r.id, sys: sys.id, prio: plan.kind === 'plongée' ? 4 : 2, data: { plan: plan.kind, last: sys.id === lastSys.id } });
        for (const c of seg.cps) {
          if (c.kind === 'ring' && c.inRing) push({ t: c.t, kind: 'ring', racer: r.id, sys: sys.id, prio: 3, data: { r: c.r } });
          if (c.kind === 'periapsis' && sys.id !== lastSys.id) {
            const s = sampleNear(seg.samples, c.t), v = speedOf(s);
            push({ t: c.t, kind: 'periapsis', racer: r.id, sys: sys.id, prio: plan.kind === 'plongée' ? 4 : 3, data: { v, rp: c.r, plan: plan.kind, g: periG(sys, c.r) } });
          }
          if (c.kind === 'exit') push({ t: c.t, kind: 'exit', racer: r.id, sys: sys.id, prio: 2, data: { vOut: seg.vOut } });
        }
        if (plan.failed) push({ t: (seg.tpPlanned || seg.tp) - 300, kind: 'failed', racer: r.id, sys: sys.id, prio: 5, data: {} });
        if (seg.damage > 0.04) push({ t: (seg.tp || seg.t0) + 900, kind: 'damage', racer: r.id, sys: sys.id, prio: seg.damage > 0.1 ? 4 : 3, data: { dmg: seg.damage } });
      } else if (seg.kind === 'leg') {
        push({ t: seg.t0 + 2, kind: 'leg', racer: r.id, sys: seg.to.id, prio: 2, data: { from: seg.from.id, to: seg.to.id, dur: seg.t1 - seg.t0, vOut: seg.vOut, last: seg.to.id === lastSys.id } });
      }
    }
    // carburant : seuils franchis (états annoncés par le moteur)
    for (const ev of tr.events || []) {
      const th = ev.fuel < 0.15 ? 0.15 : ev.fuel < 0.3 ? 0.3 : 1;   // un seul avis par état, même si deux seuils sont franchis d'un coup
      if (th < fuelWarn) { fuelWarn = th; push({ t: ev.t, kind: 'fuel', racer: r.id, prio: th < 0.2 ? 4 : 3, data: { fuel: ev.fuel } }); }
    }
    // événements du moteur (partie A) : repris tels quels
    for (const h of tr.happenings || []) push({ ...h, racer: h.racer || r.id, prio: h.prio || 4, data: h.data || {} });
    if (Number.isFinite(tr.finish)) push({ t: tr.finish, kind: 'finish', racer: r.id, sys: lastSys.id, prio: 5, data: {} });
  }
  // grande finale : le premier racer qui entre dans le dernier système
  let tFin = Infinity, who = null;
  for (const r of E.racers) { const s = (feed.tracks[r.id] || { segs: [] }).segs.find((x) => x.kind === 'system' && x.sys.id === lastSys.id); if (s && s.t0 < tFin) { tFin = s.t0; who = r.id; } }
  if (who) push({ t: tFin, kind: 'finale', racer: who, sys: lastSys.id, prio: 5, data: {} });
  // dépassements : à chaque point de contrôle passé, le classement avant et après (mêmes règles que standingsAt)
  const cpTimes = [...new Set(E.racers.flatMap((r) => (feed.tracks[r.id] ? feed.tracks[r.id].cps.map((c) => c.t) : [])))].sort((a, b) => a - b);
  let prev = null;
  for (const t of cpTimes) {
    const order = rankAt(feed, t + 0.001);
    if (prev) {
      for (let i = 0; i < order.length; i++) {
        const id = order[i], was = prev.indexOf(id);
        if (was > i) {                                             // il a gagné des places : qui a-t-il passé ?
          const passed = prev.slice(i, was).filter((x) => order.indexOf(x) > i);
          if (passed.length) push({ t, kind: 'overtake', racer: id, prio: i === 0 ? 5 : 4, data: { rank: i + 1, passed, lead: i === 0 } });
        }
      }
    }
    prev = order;
  }
  // après son arrivée, un racer ne fait plus l'actualité (sortie du dernier système, dépassement à l'arrivée même)
  const fin = Object.fromEntries(E.racers.map((r) => [r.id, feed.tracks[r.id] ? feed.tracks[r.id].finish : Infinity]));
  for (let i = out.length - 1; i >= 0; i--) { const e = out[i]; if (e.racer && e.kind !== 'finish' && e.t >= fin[e.racer] - 0.01) out.splice(i, 1); }
  out.sort((a, b) => a.t - b.t || b.prio - a.prio);
  // finish : rang d'arrivée
  let k = 0; for (const e of out) if (e.kind === 'finish') e.data.place = ++k;
  return out;
}

// accélération (en g) au plus près de la géante, pour la voix off : GM / r²
function periG(sys, rpR) {
  const GM = 1.267e17 * (sys.R / 7.0e7) ** 2.2, r = rpR * sys.R;
  return GM / (r * r) / G0;
}

function rankAt(feed, t) {
  const rows = feed.racers.map((r) => {
    const tr = feed.tracks[r.id], cps = tr ? tr.cps : [];
    let n = 0, last = 0; for (const c of cps) if (c.t <= t) { n++; last = c.t; }
    return { id: r.id, n, last };
  });
  rows.sort((a, b) => (b.n - a.n) || (a.last - b.last));
  return rows.map((x) => x.id);
}

export const upTo = (tl, t) => { let lo = 0, hi = tl.length; while (lo < hi) { const m = (lo + hi) >> 1; if (tl[m].t <= t) lo = m + 1; else hi = m; } return tl.slice(0, lo); };
