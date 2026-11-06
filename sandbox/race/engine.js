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
//
// VERSION 2 (Phase 4, « course vivante ») — seulement si pilot.v >= 2 ; une édition sans v (créée avant) se rejoue
// exactement comme avant. Événements tirés de la graine, décidés par les pilotes, rangés DANS les plans publiés
// (plan.ev) pour que le rejeu n'ait besoin d'aucun hasard :
//   · assistance d'une lune (passage près d'une lune avant la périapse) : vitesse de sortie gratuite, risque de débris ;
//   · raccourci par la ceinture d'astéroïdes (étapes où elle existe : carte publique pilot.hazards) : étape plus
//     courte, chocs possibles ;
//   · éruption stellaire (risque annoncé sur la carte ; l'heure reste secrète) : s'abriter (temps perdu) ou foncer
//     (coque, électronique) ;
//   · panne de propulsion en étape (plus probable coque abîmée), arrêt de réparation (temps contre intégrité) ;
//   · réservoir presque vide : étape en économie.
// Chaque événement est aussi un fait de course (tracks[id].happenings) pour la voix off et le fil d'actualité.
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

// carte publique des dangers d'une édition (v2) : ceinture d'astéroïdes et risque d'éruption sur chaque étape
export const FLARE_P = { faible: 0.2, moyen: 0.45, 'élevé': 0.75 };
export function hazardsOf(systems, seed) {
  const R = rngOf(`${seed}|dangers`);
  return { legs: systems.slice(0, -1).map((s, k) => {
    const belt = R() < 0.7 ? { gain: +(0.08 + R() * 0.06).toFixed(3) } : null, x = R();
    return { from: s.id, to: systems[k + 1].id, belt, flare: x < 0.35 ? 'faible' : x < 0.75 ? 'moyen' : 'élevé' };
  }) };
}
const MIN = 60;
// décisions et tirages v2 d'un passage (et de l'étape qui suit) : seulement quand les pilotes décident
function decideV2(r, sys, k, last, plan, S, sl, ctx) {
  const R = rngOf(`${ctx.seed}|${r.id}|${sys.id}|v2`), ag = plan.ag, ev = {};
  // assistance d'une lune : les audacieux, s'il y a des lunes, jamais dans le dernier système (l'arrivée est à la périapse)
  if (!last && sys.moons.length && R() < 0.15 + ag * 0.55) {
    const m = sys.moons[Math.floor(R() * sys.moons.length)];
    ev.moon = { id: m.id, gain: Math.round((260 + R() * 380) * Math.min(1.4, m.r / 1.3e6)), dmg: R() < 0.22 + ag * 0.25 ? +((0.03 + R() * 0.04) * (r.tough || 1)).toFixed(4) : 0 };
  }
  if (last) return ev;
  const hz = ctx.hazards.legs[k] || {}, L = {};
  const integ = S.integrity - (ev.moon ? ev.moon.dmg : 0);
  // raccourci par la ceinture : audace, retard, coque encore solide
  if (hz.belt && integ > 0.55 && R() < 0.04 + ag * 0.55 + clamp(ctx.gap / 7200, 0, 0.25)) {
    const hits = []; let n = R() < 0.35 + (1 - integ) * 0.5 ? (R() < 0.3 ? 2 : 1) : 0;
    while (n--) hits.push({ f: +(0.3 + R() * 0.35).toFixed(3), dmg: +((0.035 + R() * 0.06) * (r.tough || 1)).toFixed(4) });
    hits.sort((a, b) => a.f - b.f);
    L.belt = { gain: hz.belt.gain, hits };
  }
  // éruption : une par étape au plus, à la même heure pour tous (fixée par le premier racer qui part sur l'étape)
  const fl = ctx.flares;
  if (!(k in fl)) { const Rf = rngOf(`${ctx.seed}|eruption|${k}`); fl[k] = Rf() < (FLARE_P[hz.flare] || 0) ? { t: null, u: Rf(), dur: (2 + Rf() * 2.5) * 3600 } : null; }
  if (fl[k]) L.flare = { prudent: ag < 0.45 || integ < 0.7, u: R() };   // l'issue dépend de l'heure (posée à l'application)
  // panne de propulsion en étape, plus probable avec une coque abîmée
  if (R() < 0.06 + (1 - integ) * 0.35) L.failure = { f: +(0.15 + R() * 0.7).toFixed(3), lost: Math.round((25 + R() * 45) * MIN) };
  // arrêt de réparation : coque très abîmée et pilote raisonnable
  if (integ < 0.72 && (ag < 0.6 || integ < 0.55)) L.repair = { f: 0.5, lost: Math.round((40 + R() * 40) * MIN), gain: +(0.12 + R() * 0.06).toFixed(3) };
  ev.leg = L;
  return ev;
}
// instant du passage au plus près d'une lune (avant la périapse), d'après la trajectoire
function moonApproach(sys, samples, tp, moonId) {
  const { list } = bodiesOf(sys), i = sys.moons.findIndex((m) => m.id === moonId), b = list[i + 1], o = [0, 0, 0];
  let best = null;
  for (const s of samples) { if (s.t > tp) break; b.pos(s.t, o); const d = Math.hypot(s.p[0] - o[0], s.p[1] - o[1], s.p[2] - o[2]); if (!best || d < best.d) best = { t: s.t, d }; }
  return best || { t: samples[0].t, d: Infinity };
}
const planKey = (racerId, sysId) => `${racerId}|${sysId}`;

// plans : { 'racer|système': plan } pour rejouer ; sinon les pilotes décident (et la surchauffe est tirée)
export function runRace({ systems, racers, pilot, plans = null, memo = null }) {
  const V2 = (pilot.v || 1) >= 2;
  const hazards = V2 ? (pilot.hazards || hazardsOf(systems, pilot.seed)) : null, flares = {};
  const revealed = [];                                         // [{ racer, sys, t, plan }] dans l'ordre des entrées
  // simulation système par système, tous les racers ensemble : à chaque entrée, les pilotes voient la course
  const tracks = {};
  const st = Object.fromEntries(racers.map((r) => [r.id, { t: 0, segs: [], fuel: 1, integrity: 1, warpK: 1, events: [{ t: 0, fuel: 1, integrity: 1 }], happenings: [] }]));
  systems.forEach((sys, k) => {
    const last = k === systems.length - 1, order = [...racers].sort((a, b) => st[a.id].t - st[b.id].t), t0 = st[order[0].id].t;
    order.forEach((r, rank) => {
      const S = st[r.id]; if (S.stopped) return;
      let plan;
      if (plans) {                                              // rejeu : le plan est connu (ou pas encore révélé)
        plan = plans[planKey(r.id, sys.id)];
        if (!plan) { S.stopped = true; S.waiting = { sys, t: S.t }; return; }   // entrée connue (fin d'étape), plan pas encore publié
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
      const mk = memo && `${sys.id}|${S.t}|${JSON.stringify(plan)}`;      // rejeux successifs : un passage déjà calculé est repris
      const sl = (mk && memo.get(mk)) || passSystem(sys, plan, S.t, pilot.entryR);
      if (mk) memo.set(mk, sl);
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
      // v2 : événements du passage et de l'étape (décidés ici par les pilotes, ou relus dans le plan publié)
      let vOut = sl.vOut, ev = null;
      if (V2) {
        if (!plans) plan.ev = decideV2(r, sys, k, last, plan, S, sl, { seed: pilot.seed, hazards, flares, gap: S.t - t0 });
        ev = plan.ev || {};
        const HP = S.happenings;
        if (ev.moon) {
          const a = moonApproach(sys, sl.samples, sl.tp, ev.moon.id), m = sys.moons.find((x) => x.id === ev.moon.id);
          vOut += ev.moon.gain;
          HP.push({ t: a.t, kind: 'moon', sys: sys.id, prio: 4, data: { moon: m ? m.name.split(' · ')[0] : ev.moon.id, gain: ev.moon.gain, dmg: ev.moon.dmg, d: a.d } });
          if (ev.moon.dmg) { S.integrity = Math.max(0.3, S.integrity - ev.moon.dmg); S.events[S.events.length - 1].integrity = S.integrity; S.events.push({ t: a.t, fuel: S.fuel + plan.dv * FUEL_PER_DV, integrity: S.integrity }); }
        }
      }
      if (!last) {
        // étape interstellaire : plus on sort vite, plus elle est courte ; une coque abîmée freine
        S.warpK = 0.8 + 0.2 * S.integrity;
        let dur = pilot.legHours * H * Math.pow(V_REF / vOut, 0.65) / (r.warp * S.warpK);
        const legT0 = S.t, legFuel = S.fuel, L = ev && ev.leg;
        const marks = [];                                        // [t, dIntégrité, fait] dans l'étape
        if (L) {
          const HP = S.happenings, base = dur;
          if (L.belt) { dur *= 1 - L.belt.gain; HP.push({ t: legT0 + 60, kind: 'belt', sys: systems[k + 1].id, prio: 4, data: { gain: L.belt.gain, saved: base - dur } }); }
          if (S.fuel - FUEL_PER_LEG < 0.12) { dur *= 1.05; HP.push({ t: legT0 + 120, kind: 'fuelSave', sys: systems[k + 1].id, prio: 3, data: {} }); }
          const pure = dur;                                      // durée de vol, avant les temps perdus
          if (L.belt) for (const h of L.belt.hits) marks.push([legT0 + h.f * pure, -h.dmg, { kind: 'beltHit', prio: 4, data: { dmg: h.dmg } }]);
          if (L.failure) marks.push([legT0 + L.failure.f * pure, 0, { kind: 'failure', prio: 4, data: { lost: L.failure.lost } }, L.failure.lost]);
          if (L.repair) marks.push([legT0 + L.repair.f * pure, L.repair.gain, { kind: 'repair', prio: 3, data: { lost: L.repair.lost, gain: L.repair.gain } }, L.repair.lost]);
          if (L.flare) {
            // l'heure de l'éruption : posée par le premier racer parti sur l'étape (pilotes) ; relue dans le plan (rejeu)
            if (!plans) { const F = flares[k]; if (F.t == null) F.t = legT0 + (0.25 + F.u * 0.5) * pure; L.flare.t = Math.round(F.t); L.flare.dur = Math.round(F.dur); }
            const tf = L.flare.t, f = (tf - legT0) / pure;
            if (f > 0 && f < 1) {                                // l'éruption tombe pendant son étape
              const lost = L.flare.prudent ? Math.round((25 + L.flare.u * 25) * MIN) : L.flare.u < 0.3 ? Math.round((60 + L.flare.u * 120) * MIN) : 0;
              const dmg = L.flare.prudent ? 0 : +((0.03 + L.flare.u * 0.05) * (r.tough || 1)).toFixed(4);
              marks.push([tf, -dmg, { kind: 'flare', prio: 4, data: { prudent: L.flare.prudent, lost, dmg, dur: L.flare.dur } }, lost]);
            } else if (f >= 1 && f < 1 + (L.flare.dur || 0) / pure) marks.push([tf, 0, { kind: 'flareMiss', prio: 2, data: {} }]);
          }
          marks.sort((a, b) => a[0] - b[0]);
          // les temps perdus décalent la suite de l'étape
          let shift = 0;
          for (const m of marks) {
            const t = m[0] + shift;
            if (m[1]) { S.integrity = clamp(S.integrity + m[1], 0.3, 1); }
            S.events.push({ t, fuel: legFuel, integrity: S.integrity });
            if (m[2].kind !== 'flareMiss') HP.push({ t, sys: systems[k + 1].id, ...m[2], data: { ...m[2].data, integrity: S.integrity } });
            shift += m[3] || 0;
          }
          dur += shift;
        }
        S.segs.push({ kind: 'leg', from: sys, to: systems[k + 1], t0: S.t, t1: S.t + dur, vOut, belt: !!(L && L.belt) });
        S.fuel -= FUEL_PER_LEG; S.events.push({ t: S.t + dur, fuel: S.fuel, integrity: S.integrity });
        S.t += dur;
      }
    });
  });
  for (const r of racers) {
    const { segs, events, happenings } = st[r.id];
    events.sort((a, b) => a.t - b.t); happenings.sort((a, b) => a.t - b.t);
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
    // en attente d'un plan : son entrée dans le système suivant est déjà connue (heure d'arrivée de l'étape)
    const w = st[r.id].waiting;
    if (!done && w) cps.push({ kind: 'entry', t: w.t, sys: w.sys.id, label: LABELS.entry + ' · ' + w.sys.name, finish: false, provisional: true });
    tracks[r.id] = { segs, cps, finish: done ? cps[cps.length - 1].t : Infinity, events, happenings, complete: done };
  }
  const fins = racers.map((r) => tracks[r.id].finish);
  return { tracks, revealed, t1: Math.max(...fins), complete: fins.every(Number.isFinite), hazards };
}

// plan sérialisable (ce que le serveur publie quand un pilote entre dans un système)
export const planOf = (p) => ({ kind: p.kind, ag: p.ag, vInf: p.vInf, rp: p.rp, dv: p.dv, azOff: p.azOff, inc: p.inc, failed: !!p.failed, ...(p.ev ? { ev: JSON.parse(JSON.stringify(p.ev)) } : {}) });
export const plansMap = (revealed) => Object.fromEntries(revealed.map((x) => [planKey(x.racer, x.sys), x.plan]));

// empreinte des temps de passage (ms) de tous les racers : identique partout où le moteur tourne
export function digest(res) {
  return Object.keys(res.tracks).sort().map((id) => id + ':' + res.tracks[id].cps.map((c) => Math.round(c.t * 1000)).join(',')).join(';');
}
