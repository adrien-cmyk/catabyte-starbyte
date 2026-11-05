// DemoFeed — flux de course de démonstration (Phase 2), en JavaScript pur et déterministe.
// Même interface que le futur flux serveur (Phase 3, Supabase) : la carte de course et Télébyte ne lisent que ça.
//
//   feed.edition                       → { id, name, systems[], racers[], checkpoints[], t0, t1 }
//   feed.stateAt(racerId, t)           → { phase: 'system'|'leg'|'done', system, legFrom, legTo, f, p, v, speed,
//                                          accel, fuel, temp, integrity, next, lastCp, rank }
//   feed.standingsAt(t)                → [{ id, rank, cp, lastCp, gap, phase }]
//   feed.plannedPath(racerId, systemId) / feed.actualPath(racerId, systemId, t)   → échantillons { t, p }
//   feed.nextEvent(t)                  → { t, racer, label } (prochain point de contrôle, tous racers confondus)
//
// Chaque passage dans un système est une vraie fronde gravitationnelle (Velocity Verlet sur la géante et ses lunes,
// core/Gravity.js), avec une poussée autour de la périapse ; les étapes interstellaires sont fictives (brief §7) :
// une durée propre à chaque racer. Positions en repère local du système (géante au centre, plan équatorial XZ).
import { propagate, sampleAt, hyperbolicApproach } from '../core/Gravity.js';
import { RACE_SYSTEMS, RACERS, PILOT, gmOfGiant, sphereGM } from './raceData.js';

const H = 3600;
const rot = (p, k, a) => {                                   // rotation de p autour de l'axe unitaire k (Rodrigues)
  const c = Math.cos(a), s = Math.sin(a), d = k[0] * p[0] + k[1] * p[1] + k[2] * p[2];
  const x = [k[1] * p[2] - k[2] * p[1], k[2] * p[0] - k[0] * p[2], k[0] * p[1] - k[1] * p[0]];
  return [0, 1, 2].map((i) => p[i] * c + x[i] * s + k[i] * d * (1 - c));
};
const norm = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };

// astres d'un système, positions exactes au temps t (repère local)
function bodiesOf(sys) {
  const GM = gmOfGiant(sys.R);
  const list = [{ GM, R: sys.R, pos: (t, o) => { o[0] = o[1] = o[2] = 0; return o; } }];
  for (const m of sys.moons) {
    const a = m.a * sys.R, P = 2 * Math.PI * Math.sqrt(a ** 3 / GM);
    list.push({ GM: sphereGM(m.r, m.rho), R: m.r, pos: (t, o) => {
      const ang = m.phase + 2 * Math.PI * t / P;
      o[0] = Math.cos(ang) * a; o[1] = Math.sin(ang) * Math.sin(m.inc) * a; o[2] = Math.sin(ang) * Math.cos(m.inc) * a; return o;
    } });
  }
  return { list, GM };
}

// une fronde : arrivée hyperbolique, périapse placée côté jour (azimut du soleil + 0,9 rad), plan incliné de 4°
// avec une ligne des nœuds qui fait traverser l'anneau principal à l'aller ; poussée de dv autour de la périapse
function slingshot(sys, racer, tStart) {
  const { list, GM } = bodiesOf(sys), R = sys.R, rp = racer.rp * R, r0 = PILOT.entryR * R;
  const s0 = hyperbolicApproach(GM, racer.vInf, rp, r0, [0, 0, 1], [1, 0, 0]);
  // orientation : périapse à l'azimut voulu, puis inclinaison autour de la ligne des nœuds
  const single = [{ GM, R, pos: (t, o) => { o[0] = o[1] = o[2] = 0; return o; } }];
  const S1 = propagate(single, { t: 0, p: s0.p, v: s0.v }, 2 * 86400, { dtMax: 300 });
  let ip = 0, rmin = Infinity; S1.forEach((x, i) => { const r = Math.hypot(...x.p); if (r < rmin) { rmin = r; ip = i; } });
  const Pp = norm(S1[ip].p), tpRel = S1[ip].t;
  const want = sys.sunAz + 0.9, have = Math.atan2(Pp[2], Pp[0]);
  const spinA = have - want, Y = [0, 1, 0];
  const P2 = rot(Pp, Y, spinA);
  const n = norm([s0.p[1] * s0.v[2] - s0.p[2] * s0.v[1], s0.p[2] * s0.v[0] - s0.p[0] * s0.v[2], s0.p[0] * s0.v[1] - s0.p[1] * s0.v[0]]);
  const node = norm(rot(P2, n, -74 * Math.PI / 180));
  const tf = (q) => rot(rot(q, Y, spinA), node, 4 * Math.PI / 180);
  const p0 = tf(s0.p), v0 = tf(s0.v);
  // poussée prograde de dv répartie sur ±600 s autour de la périapse (instant prévu par la conique)
  const tp = tStart + tpRel, burn = 1200, acc = racer.dv / burn;
  const thrust = (t, p, v, out) => {
    const on = Math.abs(t - tp) < burn / 2, l = Math.hypot(v[0], v[1], v[2]) || 1;
    out[0] = on ? acc * v[0] / l : 0; out[1] = on ? acc * v[1] / l : 0; out[2] = on ? acc * v[2] / l : 0;
  };
  // on propage jusqu'à la sortie (rayon r0, branche sortante)
  const S = propagate(list, { t: tStart, p: p0, v: v0 }, 2 * 86400, { dtMax: 120, thrust });
  let iOut = S.length - 1;
  for (let i = ip; i < S.length; i++) if (S[i].t > tp && Math.hypot(...S[i].p) > r0) { iOut = i; break; }
  const samples = S.slice(0, iOut + 1);
  // points de contrôle, les mêmes pour tous : entrée, passage du plan des anneaux (le premier, à l'aller ; « dans
  // l'anneau » si le rayon y tombe : raccourci risqué), périapse, sortie
  const cps = [{ kind: 'entry', t: samples[0].t }];
  let rm = Infinity, tPer = tp, ringDone = false;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    if (!ringDone && a.p[1] * b.p[1] < 0) {
      const f = a.p[1] / (a.p[1] - b.p[1]), x = a.p[0] + (b.p[0] - a.p[0]) * f, z = a.p[2] + (b.p[2] - a.p[2]) * f;
      const r = Math.hypot(x, z) / R;
      cps.push({ kind: 'ring', t: a.t + (b.t - a.t) * f, r, inRing: !!(sys.ring && r > sys.ring.inner && r < sys.ring.outer) });
      ringDone = true;
    }
    const r = Math.hypot(...b.p); if (r < rm) { rm = r; tPer = b.t; }
  }
  cps.push({ kind: 'periapsis', t: tPer, r: rm / R });
  cps.push({ kind: 'exit', t: samples[samples.length - 1].t });
  cps.sort((a, b) => a.t - b.t);
  return { samples, cps, tp: tPer, rp: rm, hit: S.hit || null, tpPlanned: tp };
}

export class DemoFeed {
  constructor({ systems = RACE_SYSTEMS, racers = RACERS, pilot = PILOT } = {}) {
    this.systems = systems; this.racers = racers; this.pilot = pilot;
    this.tracks = {};                                   // racerId → [{ kind:'system', sys, ...slingshot } | { kind:'leg', from, to, t0, t1 }]
    const labels = { entry: 'entrée', ring: 'plan des anneaux', periapsis: 'périapse', exit: 'sortie' };
    for (const r of racers) {
      let t = 0; const segs = [];
      systems.forEach((sys, k) => {
        const sl = slingshot(sys, r, t);
        segs.push({ kind: 'system', sys, ...sl, t0: sl.samples[0].t, t1: sl.samples[sl.samples.length - 1].t });
        t = segs[segs.length - 1].t1;
        if (k < systems.length - 1) {
          const dur = pilot.legHours * H / r.warp;
          segs.push({ kind: 'leg', from: sys, to: systems[k + 1], t0: t, t1: t + dur });
          t += dur;
        }
      });
      // l'arrivée est la périapse du dernier système (« une seule trajectoire parfaite »)
      const last = segs[segs.length - 1];
      const cps = [];
      for (const s of segs) if (s.kind === 'system') for (const c of s.cps) {
        if (s === last && c.kind === 'exit') continue;
        const finish = s === last && c.kind === 'periapsis';
        cps.push({ ...c, sys: s.sys.id, label: finish ? 'arrivée · ' + s.sys.name : labels[c.kind] + ' · ' + s.sys.name, finish });
        if (finish) break;
      }
      this.tracks[r.id] = { segs, cps, finish: cps[cps.length - 1].t };
    }
    const t1 = Math.max(...racers.map((r) => this.tracks[r.id].finish));
    this.edition = { id: pilot.id, name: pilot.name, seed: pilot.seed, systems, racers, t0: 0, t1, checkpoints: this.tracks[racers[0].id].cps.map((c) => c.label) };
  }
  _seg(id, t) { const tr = this.tracks[id]; return tr.segs.find((s) => t >= s.t0 && t <= s.t1) || (t < 0 ? tr.segs[0] : tr.segs[tr.segs.length - 1]); }
  stateAt(id, t) {
    const tr = this.tracks[id], racer = this.racers.find((r) => r.id === id), s = this._seg(id, t);
    const done = t >= tr.finish;
    const passed = tr.cps.filter((c) => c.t <= t), next = tr.cps.find((c) => c.t > t) || null;
    const st = { id, phase: done ? 'done' : s.kind, lastCp: passed.length ? passed[passed.length - 1] : null, next, cpCount: passed.length };
    // carburant : 1 au départ ; chaque poussée de périapse et chaque étape interstellaire en consomment
    const burns = tr.segs.filter((x) => x.kind === 'system' && x.tp < t).length, legs = tr.segs.filter((x) => x.kind === 'leg');
    const legUsed = legs.reduce((a, l) => a + Math.min(1, Math.max(0, (t - l.t0) / (l.t1 - l.t0))), 0);
    st.fuel = Math.max(0, 1 - burns * racer.dv / 9000 - legUsed * 0.12);
    if (s.kind === 'system') {
      const p = [0, 0, 0], v = [0, 0, 0]; sampleAt(s.samples, Math.min(Math.max(t, s.t0), s.t1), p, v);
      const r = Math.hypot(...p), R = s.sys.R;
      st.system = s.sys.id; st.p = p; st.v = v; st.speed = Math.hypot(...v);
      st.accel = gmOfGiant(R) / (r * r) + (Math.abs(t - s.tpPlanned) < 600 ? racer.dv / 1200 : 0);
      // température : chauffe radiative et frottement de la haute atmosphère près de la géante, plus la poussée
      st.temp = 290 + 1400 * Math.pow(R / r, 6) + (Math.abs(t - s.tpPlanned) < 600 ? 260 : 0);
      // intégrité : chaque traversée d'anneau déjà faite coûte selon le risque pris (déterministe)
      st.integrity = 1 - tr.cps.filter((c) => c.inRing && c.t <= t).length * 0.04 * (1.5 - racer.rp);
    } else {
      const f = Math.min(1, Math.max(0, (t - s.t0) / (s.t1 - s.t0)));
      st.legFrom = s.from.id; st.legTo = s.to.id; st.f = f; st.speed = null; st.accel = 0; st.temp = 260;
      st.integrity = 1 - tr.cps.filter((c) => c.inRing && c.t <= t).length * 0.04 * (1.5 - racer.rp);
    }
    return st;
  }
  // classement : nombre de points de contrôle passés, puis ordre de passage au dernier ; écart au premier au dernier
  // point de contrôle commun (en secondes). ÉQUITÉ DES PARIS : n'utilise que des passages déjà faits (≤ t), jamais
  // la trajectoire à venir, que le serveur connaît mais ne doit pas laisser deviner.
  standingsAt(t) {
    const rows = this.racers.map((r) => {
      const tr = this.tracks[r.id], passed = tr.cps.filter((c) => c.t <= t);
      return { id: r.id, name: r.name, cp: passed.length, lastT: passed.length ? passed[passed.length - 1].t : 0, done: t >= tr.finish, finish: tr.finish };
    });
    rows.sort((a, b) => (b.cp - a.cp) || (a.lastT - b.lastT));
    const lead = rows[0];
    rows.forEach((row, i) => {
      row.rank = i + 1;
      const k = Math.min(row.cp, lead.cp) - 1;
      row.gap = i === 0 || k < 0 ? 0 : this.tracks[row.id].cps[k].t - this.tracks[lead.id].cps[k].t;
      row.phase = this.stateAt(row.id, t).phase;
    });
    return rows;
  }
  plannedPath(id, sysId) { const s = this.tracks[id].segs.find((x) => x.kind === 'system' && x.sys.id === sysId); return s ? s.samples : []; }
  actualPath(id, sysId, t) { return this.plannedPath(id, sysId).filter((x) => x.t <= t); }
  nextEvent(t) {
    let best = null;
    for (const r of this.racers) { const c = this.tracks[r.id].cps.find((x) => x.t > t); if (c && (!best || c.t < best.t)) best = { t: c.t, racer: r.id, label: c.label }; }
    return best;
  }
}
