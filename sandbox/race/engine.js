// engine — moteur de course de la Grande Fronde, en JavaScript pur et déterministe (aucune dépendance au rendu).
// C'est LE moteur partagé : le jeu (Télébyte, vue système) et le serveur (fonction fronde-tick, Phase 3) exécutent ce
// même code ; la copie serveur est générée par tools/fronde/sync_engine.py (ne pas la modifier à la main).
//
// Chaque passage dans un système est une vraie fronde gravitationnelle (Velocity Verlet sur la géante et ses lunes,
// core/Gravity.js), avec une poussée autour de la périapse. Les racers ne suivent pas une piste : à l'entrée de
// chaque système, leur PILOTE choisit sa trajectoire (choosePlan) d'après son caractère, sa place, son retard, son
// carburant et son état — prudente (large, peu de poussée), classique, ou plongée (arrivée lente sur un grand arc,
// passage rasant, forte poussée à la périapse : effet Oberth, sortie bien plus rapide). La vitesse de sortie fixe la
// durée de l'étape interstellaire suivante (fictive, brief §7) : celui qui semblait en retard peut ressortir devant.
// Le risque se paie : un passage rasant chauffe et abîme la coque, une coque abîmée ralentit les étapes suivantes,
// une grosse poussée vide le réservoir. Tout découle de la graine de l'édition.
//
//   runRace({ systems, racers, pilot })            → course complète, décisions des pilotes comprises
//   runRace({ systems, racers, pilot, plans })      → rejoue des plans déjà connus (révélés par le serveur) ; un racer
//                                                     dont le plan d'un système manque s'arrête à l'entrée de ce système
//   digest(result)                                 → empreinte texte des temps de passage (tests de déterminisme)
// Positions en repère local du système (géante au centre, plan équatorial XZ). Unités SI.
import { propagate, sampleAt, hyperbolicApproach } from '../core/Gravity.js';
import { gmOfGiant, sphereGM } from './raceData.js';

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

// hasard déterministe : une graine (texte) → générateur dans [0, 1)
export function rngOf(str) {
  let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const FUEL_PER_DV = 1 / 9000, FUEL_PER_LEG = 0.12;            // part du réservoir par m/s de poussée, par étape

// le pilote choisit sa trajectoire à l'entrée d'un système. ctx : { gap (s de retard sur le premier entré), rank, n,
// fuel, integrity, last (dernier système : l'arrivée est à la périapse), legsLeft }
export function choosePlan(racer, sys, ctx, R) {
  const behind = clamp(ctx.gap / 5400, 0, 1);
  let ag = racer.risk * 0.7 + behind * 0.55 + (ctx.n > 1 ? (ctx.rank - 1) / (ctx.n - 1) : 0) * 0.15 + (R() - 0.5) * 0.25;
  if (ctx.integrity < 0.85) ag -= 0.35;                       // coque abîmée : on lève le pied
  if (ctx.fuel - ctx.legsLeft * FUEL_PER_LEG < 0.25) ag -= 0.4; // réservoir juste : pas de grosse poussée
  ag = clamp(ag, 0, 1);
  const kind = !ctx.last && ag > 0.62 ? 'plongée' : ag < 0.3 ? 'prudente' : 'classique';
  const P = {
    plongée: { vInfK: 0.68 + R() * 0.08, rp: 1.035 + R() * 0.03, dvK: 1.7, az: 0.45 },
    classique: { vInfK: 0.95 + R() * 0.1, rp: 1.12 + R() * 0.08, dvK: 1.0, az: 0 },
    prudente: { vInfK: 0.98 + R() * 0.08, rp: 1.24 + R() * 0.08, dvK: 0.85, az: -0.2 },
  }[kind];
  // carburant : on garde de quoi finir (étapes restantes + réserve)
  const dvMax = Math.max(0, (ctx.fuel - ctx.legsLeft * FUEL_PER_LEG - 0.05) / FUEL_PER_DV);
  const dv = ctx.last ? Math.min(racer.dv * 0.5, dvMax) : Math.min(racer.dv * P.dvK, dvMax);
  const inc = (R() < 0.5 ? -1 : 1) * (3 + R() * 9) * Math.PI / 180;   // chacun son plan d'approche
  return { kind, ag, vInf: racer.vInf * P.vInfK, rp: P.rp + (ctx.last ? -0.03 * ag : 0), dv, azOff: P.az + (R() - 0.5) * 0.6, inc };
}
export const PLAN_LABEL = { plongée: 'plongée rasante', classique: 'passage classique', prudente: 'passage prudent' };

// une fronde selon le plan du pilote : arrivée hyperbolique (vitesse à l'infini choisie), périapse côté jour (azimut du
// soleil + 0,9 rad, décalé selon le plan), plan incliné propre au pilote, ligne des nœuds qui fait traverser l'anneau
// principal à l'aller ; poussée de dv autour de la périapse
export function passSystem(sys, plan, tStart, entryR = 9) {
  const { list, GM } = bodiesOf(sys), R = sys.R, rp = plan.rp * R, r0 = entryR * R;
  const s0 = hyperbolicApproach(GM, plan.vInf, rp, r0, [0, 0, 1], [1, 0, 0]);
  // orientation : périapse à l'azimut voulu, puis inclinaison autour de la ligne des nœuds
  const single = [{ GM, R, pos: (t, o) => { o[0] = o[1] = o[2] = 0; return o; } }];
  const S1 = propagate(single, { t: 0, p: s0.p, v: s0.v }, 2 * 86400, { dtMax: 300 });
  let ip = 0, rmin = Infinity; S1.forEach((x, i) => { const r = Math.hypot(...x.p); if (r < rmin) { rmin = r; ip = i; } });
  const Pp = norm(S1[ip].p), tpRel = S1[ip].t;
  const want = sys.sunAz + 0.9 + plan.azOff, have = Math.atan2(Pp[2], Pp[0]);
  const spinA = have - want, Y = [0, 1, 0];
  const P2 = rot(Pp, Y, spinA);
  const n = norm([s0.p[1] * s0.v[2] - s0.p[2] * s0.v[1], s0.p[2] * s0.v[0] - s0.p[0] * s0.v[2], s0.p[0] * s0.v[1] - s0.p[1] * s0.v[0]]);
  const node = norm(rot(P2, n, -74 * Math.PI / 180));
  const tf = (q) => rot(rot(q, Y, spinA), node, plan.inc);
  const p0 = tf(s0.p), v0 = tf(s0.v);
  // poussée prograde de dv répartie sur ±600 s autour de la périapse (instant prévu par la conique)
  const tp = tStart + tpRel, burn = 1200, acc = plan.dv / burn;
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
  // vitesse de sortie « à l'infini » (énergie de la branche sortante) : c'est elle qui lance l'étape suivante
  const e = samples[samples.length - 1], ve = Math.hypot(...e.v), re = Math.hypot(...e.p);
  const vOut = Math.sqrt(Math.max(1, ve * ve - 2 * GM / re));
  return { samples, cps, tp: tPer, rp: rm, hit: S.hit || null, tpPlanned: tp, vOut, plan };
}
export const V_REF = 1.55e4;                                          // vitesse de sortie de référence (étape de legHours)


const LABELS = { entry: 'entrée', ring: 'plan des anneaux', periapsis: 'périapse', exit: 'sortie' };
const planKey = (racerId, sysId) => `${racerId}|${sysId}`;

// plans : { 'racer|système': plan } pour rejouer ; sinon les pilotes décident (et la surchauffe est tirée)
export function runRace({ systems, racers, pilot, plans = null }) {
  const revealed = [];                                         // [{ racer, sys, t, plan }] dans l'ordre des entrées
  // simulation système par système, tous les racers ensemble : à chaque entrée, les pilotes voient la course
  const tracks = {};
  const st = Object.fromEntries(racers.map((r) => [r.id, { t: 0, segs: [], fuel: 1, integrity: 1, warpK: 1, events: [{ t: 0, fuel: 1, integrity: 1 }] }]));
  systems.forEach((sys, k) => {
    const last = k === systems.length - 1, order = [...racers].sort((a, b) => st[a.id].t - st[b.id].t), t0 = st[order[0].id].t;
    order.forEach((r, rank) => {
      const S = st[r.id]; if (S.stopped) return;
      let plan;
      if (plans) {                                              // rejeu : le plan est connu (ou pas encore révélé)
        plan = plans[planKey(r.id, sys.id)];
        if (!plan) { S.stopped = true; return; }
      } else {
        const R = rngOf(`${pilot.seed}|${r.id}|${sys.id}`);
        plan = choosePlan(r, sys, { gap: S.t - t0, rank: rank + 1, n: racers.length, fuel: S.fuel, integrity: S.integrity, last, legsLeft: systems.length - 1 - k }, R);
        // une plongée peut mal tourner : surchauffe → la poussée est coupée à mi-course, la coque prend cher. Plus le
        // passage est rasant et la coque déjà abîmée, plus c'est probable (tirage déterministe de l'édition)
        if (plan.kind === 'plongée') {
          const pFail = (0.15 + Math.max(0, 1.06 - plan.rp) * 4 + (1 - S.integrity) * 0.6) * (r.tough || 1);
          if (R() < pFail) { plan.failed = true; plan.dv *= 0.65; }
        }
      }
      revealed.push({ racer: r.id, sys: sys.id, t: S.t, plan });
      const sl = passSystem(sys, plan, S.t, pilot.entryR);
      const seg = { kind: 'system', sys, ...sl, t0: sl.samples[0].t, t1: sl.samples[sl.samples.length - 1].t };
      S.segs.push(seg);
      // coût du passage : carburant de la poussée ; chauffe d'un passage rasant ; traversée de l'anneau
      S.fuel -= plan.dv * FUEL_PER_DV;
      const rpR = sl.rp / sys.R, ring = sl.cps.find((c) => c.kind === 'ring');
      let dmg = Math.max(0, 1.08 - rpR) * 2.6 + (ring && ring.inRing ? 0.03 + 0.04 * plan.ag : 0) + (plan.failed ? 0.07 : 0);
      dmg *= r.tough || 1;                                    // robustesse de la coque (lourd : encaisse ; sport : fragile)
      S.integrity = Math.max(0.3, S.integrity - dmg); seg.damage = dmg;
      S.events.push({ t: sl.tpPlanned, fuel: S.fuel, integrity: S.integrity });
      S.t = seg.t1;
      if (!last) {
        // étape interstellaire : plus on sort vite, plus elle est courte ; une coque abîmée freine
        S.warpK = 0.8 + 0.2 * S.integrity;
        const dur = pilot.legHours * H * Math.pow(V_REF / sl.vOut, 0.65) / (r.warp * S.warpK);
        S.segs.push({ kind: 'leg', from: sys, to: systems[k + 1], t0: S.t, t1: S.t + dur, vOut: sl.vOut });
        S.fuel -= FUEL_PER_LEG; S.events.push({ t: S.t + dur, fuel: S.fuel, integrity: S.integrity });
        S.t += dur;
      }
    });
  });
  for (const r of racers) {
    const { segs, events } = st[r.id];
    // l'arrivée est la périapse du dernier système (« une seule trajectoire parfaite »)
    const lastSys = systems[systems.length - 1], done = segs.some((s) => s.kind === 'system' && s.sys.id === lastSys.id);
    const cps = [];
    for (const s of segs) if (s.kind === 'system') for (const c of s.cps) {
      const isLast = s.sys.id === lastSys.id;
      if (isLast && c.kind === 'exit') continue;
      const finish = isLast && c.kind === 'periapsis';
      cps.push({ ...c, sys: s.sys.id, label: finish ? 'arrivée · ' + s.sys.name : LABELS[c.kind] + ' · ' + s.sys.name, finish });
      if (finish) break;
    }
    tracks[r.id] = { segs, cps, finish: done ? cps[cps.length - 1].t : Infinity, events, complete: done };
  }
  const fins = racers.map((r) => tracks[r.id].finish);
  return { tracks, revealed, t1: Math.max(...fins), complete: fins.every(Number.isFinite) };
}

// plan sérialisable (ce que le serveur publie quand un pilote entre dans un système)
export const planOf = (p) => ({ kind: p.kind, ag: p.ag, vInf: p.vInf, rp: p.rp, dv: p.dv, azOff: p.azOff, inc: p.inc, failed: !!p.failed });
export const plansMap = (revealed) => Object.fromEntries(revealed.map((x) => [planKey(x.racer, x.sys), x.plan]));

// empreinte des temps de passage (ms) de tous les racers : identique partout où le moteur tourne
export function digest(res) {
  return Object.keys(res.tracks).sort().map((id) => id + ':' + res.tracks[id].cps.map((c) => Math.round(c.t * 1000)).join(',')).join(';');
}
