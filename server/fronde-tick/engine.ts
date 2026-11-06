// STARBYTE — moteur de course de la Grande Fronde, COPIE GÉNÉRÉE par tools/fronde/sync_engine.mjs (dépôt catabyte-starbyte).
// Ne pas modifier ici : retoucher sandbox/race/engine.js (ou Gravity.js, raceData.js), relancer le script, redéployer fronde-tick.
// Source : 1913cfe11b23cc2a (empreinte des fichiers du moteur)
// @ts-nocheck
const __m = {};
// ── sandbox/core/Gravity.js ──
__m.gravity = (() => {
// Gravity — gravitation newtonienne et intégrateur Velocity Verlet à pas adaptatif, en JavaScript pur (float64,
// aucune dépendance à three.js) : le même code tournera sur le serveur de course (Phase 3).
//   a = −Σ G·M · r / |r|³          (r = position du vaisseau − position de l'astre)
// Le pas suit le temps dynamique local : dt = η · min √(r³ / GM) sur les astres, borné ; près d'un astre le pas
// se resserre automatiquement (passages rasants), loin il s'allonge (croisière).
// bodies : [{ GM, R, pos(t, out) }] — pos renvoie la position de l'astre au temps t (m, s).

const G = 6.674e-11;
const GM_GIANT = 1.267e17;                     // masse de Jupiter (cohérent avec les orbites des lunes)
const gmOfSphere = (radius, density) => G * (4 / 3) * Math.PI * radius ** 3 * density;

function accel(bodies, p, t, out, tmp = [0, 0, 0]) {
  out[0] = out[1] = out[2] = 0;
  let tdyn = Infinity, hit = null;
  for (const b of bodies) {
    b.pos(t, tmp);
    const rx = p[0] - tmp[0], ry = p[1] - tmp[1], rz = p[2] - tmp[2];
    const r2 = rx * rx + ry * ry + rz * rz, r = Math.sqrt(r2), k = -b.GM / (r2 * r);
    out[0] += k * rx; out[1] += k * ry; out[2] += k * rz;
    tdyn = Math.min(tdyn, Math.sqrt(r2 * r / b.GM));
    if (r < b.R) hit = b;
  }
  return { tdyn, hit };
}

// propage un état { t, p:[3], v:[3] } pendant `duration` secondes ; renvoie les échantillons { t, p, v, a }
// opts : eta (fraction du temps dynamique), dtMin, dtMax, thrust(t, p, v, out) facultatif (accélération propre)
function propagate(bodies, state, duration, { eta = 0.004, dtMin = 0.05, dtMax = 60, thrust = null } = {}) {
  const out = [];
  let t = state.t; const p = state.p.slice(), v = state.v.slice();
  const a = [0, 0, 0], a2 = [0, 0, 0], th = [0, 0, 0], tmp = [0, 0, 0];
  const total = (pp, tt, res) => {
    const info = accel(bodies, pp, tt, res, tmp);
    if (thrust) { thrust(tt, pp, v, th); res[0] += th[0]; res[1] += th[1]; res[2] += th[2]; }
    return info;
  };
  let info = total(p, t, a);
  out.push({ t, p: p.slice(), v: v.slice(), a: a.slice() });
  const tEnd = t + duration;
  while (t < tEnd) {
    const dt = Math.min(Math.max(eta * info.tdyn, dtMin), dtMax, tEnd - t);
    // Velocity Verlet : demi-coup de vitesse, dérive, nouvelle accélération, demi-coup
    for (let i = 0; i < 3; i++) { v[i] += 0.5 * dt * a[i]; p[i] += dt * v[i]; }
    t += dt;
    info = total(p, t, a2);
    for (let i = 0; i < 3; i++) { v[i] += 0.5 * dt * a2[i]; a[i] = a2[i]; }
    out.push({ t, p: p.slice(), v: v.slice(), a: a.slice() });
    if (info.hit) { out.hit = info.hit; break; }        // impact : la trajectoire s'arrête
  }
  return out;
}

// état interpolé au temps t (Hermite cubique sur position et vitesse : continu et précis entre échantillons)
function sampleAt(samples, t, outP, outV) {
  const n = samples.length;
  if (t <= samples[0].t) { outP.splice(0, 3, ...samples[0].p); outV.splice(0, 3, ...samples[0].v); return 0; }
  if (t >= samples[n - 1].t) { outP.splice(0, 3, ...samples[n - 1].p); outV.splice(0, 3, ...samples[n - 1].v); return n - 1; }
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (samples[m].t <= t) lo = m; else hi = m; }
  const A = samples[lo], B = samples[hi], h = B.t - A.t, s = (t - A.t) / h, s2 = s * s, s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  const d00 = (6 * s2 - 6 * s) / h, d10 = 3 * s2 - 4 * s + 1, d01 = (-6 * s2 + 6 * s) / h, d11 = 3 * s2 - 2 * s;
  for (let i = 0; i < 3; i++) {
    outP[i] = h00 * A.p[i] + h10 * h * A.v[i] + h01 * B.p[i] + h11 * h * B.v[i];
    outV[i] = d00 * A.p[i] + d10 * A.v[i] + d01 * B.p[i] + d11 * B.v[i];
  }
  return lo;
}

// conditions d'une fronde hyperbolique : départ à `r0` du centre, vitesse à l'infini v∞, périapse visée rp,
// dans le plan défini par (u : direction d'arrivée, w : côté du passage). Renvoie { p, v } relatifs à l'astre.
function hyperbolicApproach(GM, vInf, rp, r0, u, w) {
  const b = rp * Math.sqrt(1 + 2 * GM / (rp * vInf * vInf));           // paramètre d'impact
  const e = 1 + rp * vInf * vInf / GM;                                // excentricité
  const a = -GM / (vInf * vInf);                                      // demi-grand axe (négatif)
  const p = a * (1 - e * e);                                          // paramètre de la conique
  // anomalie vraie au départ (branche entrante) : r0 = p / (1 + e cos ν)
  const nu = -Math.acos(Math.min(1, Math.max(-1, (p / r0 - 1) / e)));
  // repère : x vers la périapse, y dans le sens du mouvement à la périapse
  // l'asymptote d'arrivée fait l'angle νmax ; on oriente pour que la direction d'arrivée soit u
  const nuMax = Math.acos(-1 / e);
  const rx = r0 * Math.cos(nu), ry = r0 * Math.sin(nu);
  const h = Math.sqrt(GM * p);
  const vx = -GM / h * Math.sin(nu), vy = GM / h * (e + Math.cos(nu));
  // direction d'arrivée dans ce repère : vitesse à l'infini entrante = −(cos νmax, sin νmax) tournée de… : on la calcule
  const ax = Math.sin(nuMax), ay = -Math.cos(nuMax);                  // direction du mouvement le long de l'asymptote entrante
  const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];   // normale du plan
  const wy = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];   // ⟂ u dans le plan
  // base (X, Y) du plan orbital telle que (ax, ay) → u
  const X = [0, 1, 2].map((i) => ax * u[i] - ay * wy[i]), Y = [0, 1, 2].map((i) => ay * u[i] + ax * wy[i]);
  return {
    p: [0, 1, 2].map((i) => rx * X[i] + ry * Y[i]),
    v: [0, 1, 2].map((i) => vx * X[i] + vy * Y[i]),
    b, e, vp: Math.sqrt(vInf * vInf + 2 * GM / rp),
  };
}

return { G, GM_GIANT, gmOfSphere, accel, propagate, sampleAt, hyperbolicApproach };
})();

// ── sandbox/race/raceData.js ──
__m.raceData = (() => {
// Données de la course pilote (Phase 2) — JavaScript pur, partagé plus tard avec le serveur (Phase 3).
// Trois vrais systèmes de l'univers Starbyte (adresse amas-secteur-système), quatre racers aux profils distincts.
// Toutes les grandeurs sont en unités SI (m, s, m/s) ; le repère local d'un système est celui de sa géante
// (plan équatorial XZ, axe de rotation Y).

const GM_JUP = 1.267e17, R_JUP = 7.0e7;
// masse d'une géante à partir de son rayon (densité proche de celle de Jupiter)
const gmOfGiant = (R) => GM_JUP * (R / R_JUP) ** 2.2;

// moons : orbites en rayons de la géante (a), densité rho (kg/m³) ; starDist en UA ; sunAz / sunEl : direction du
// soleil dans le repère de la géante (azimut, élévation en radians)
const G = 6.674e-11, sphereGM = (r, rho) => G * (4 / 3) * Math.PI * r ** 3 * rho;

const RACE_SYSTEMS = [
  {
    id: 'kerath', name: 'Kerath', address: 'A-C-07', star: 'yellow', starDist: 5.2, giant: 'amber', R: 7.0e7, sunAz: -2.54, sunEl: 0.12,
    moons: [
      { id: 'oro', name: 'Oro · lune volcanique', family: 'volcanic', r: 1.82e6, a: 3.4, phase: 2.2, inc: 0.01, rho: 3500 },
      { id: 'kesh', name: 'Kesh · lune cratérisée', family: 'rocky', r: 1.15e6, a: 5.6, phase: 1.15, inc: 0.03, rho: 3300 },
      { id: 'ilva', name: 'Ilva · lune glacée', family: 'icy', r: 1.56e6, a: 8.3, phase: 0.25, inc: 0.02, rho: 1900 },
    ],
    ring: { inner: 1.24, outer: 2.32 },
    galPos: [0, 0, 0],                         // position galactique (années-lumière) pour la vue univers
  },
  {
    id: 'vessa', name: 'Vessa', address: 'A-F-12', star: 'white', starDist: 9.5, giant: 'blue', R: 6.2e7, sunAz: 0.6, sunEl: 0.22,
    moons: [
      { id: 'tirn', name: 'Tirn · lune glacée', family: 'icy', r: 1.30e6, a: 4.1, phase: 0.8, inc: 0.04, rho: 1800 },
      { id: 'sael', name: 'Saël · lune cratérisée', family: 'rocky', r: 0.9e6, a: 6.8, phase: 3.9, inc: 0.02, rho: 3000 },
    ],
    ring: { inner: 1.3, outer: 2.1 },
    galPos: [9.4, 1.2, -3.1],
  },
  {
    id: 'nox', name: 'Nox', address: 'B-A-03', star: 'red', starDist: 0.9, giant: 'black', R: 8.1e7, sunAz: -0.4, sunEl: 0.06,
    moons: [
      { id: 'cendre', name: 'Cendre · lune volcanique', family: 'volcanic', r: 1.4e6, a: 3.8, phase: 4.6, inc: 0.02, rho: 3400 },
    ],
    ring: { inner: 1.22, outer: 2.0 },
    galPos: [17.8, -0.6, 2.4],
  },
];

// profils : rp = périapse visée (rayons de géante), dv = poussée à la périapse (m/s, effet Oberth),
// warp = facteur de vitesse interstellaire (1 = référence), vInf = vitesse d'arrivée de croisière (m/s),
// risk = caractère du pilote (0 prudent … 1 casse-cou) : il pèse sur le choix de trajectoire à chaque système (DemoFeed.choosePlan)
// tough = fragilité de la coque (< 1 : encaisse la chauffe et rate moins ses plongées ; > 1 : fragile).
// Équilibre vérifié sur 40 éditions : chacun gagne (Fulgurant favori ~40 %), écart médian 1er–2e ≈ 16 min.
const RACERS = [
  { id: 'sentinelle', name: 'Sentinelle', ship: 'sr01', livery: '#e8394a', rp: 1.12, dv: 900, warp: 1.00, vInf: 1.20e4, risk: 0.45, tough: 1 },
  { id: 'cuirasse', name: 'Kerath Lourd', ship: 'kv01', livery: '#5b86ff', rp: 1.30, dv: 1300, warp: 0.96, vInf: 1.15e4, risk: 0.15, tough: 0.6 },
  { id: 'mule', name: 'La Mule', ship: 'tk07', livery: '#56c878', rp: 1.20, dv: 650, warp: 1.05, vInf: 1.18e4, risk: 0.3, tough: 0.8 },
  { id: 'fulgurant', name: 'Le Fulgurant', ship: 'sport', livery: '#f2c230', rp: 1.06, dv: 950, warp: 1.0, vInf: 1.2e4, risk: 0.65, tough: 1.25 },
];

// format de la course pilote (brief §5) : 72 h simulées, 3 systèmes, étapes interstellaires entre eux
const PILOT = {
  id: 'pilote-1', name: 'Grande Fronde · course pilote', seed: 'fronde-52',    // démo (moteur v2) : lune, ceinture et chocs, éruption, panne, réparation ; 3 racers en 17 min
  legHours: 20.5,                              // durée de référence d'une étape interstellaire
  entryR: 9,                                   // entrée et sortie d'un système à 9 rayons de géante
  nominalHours: 76,                            // durée annoncée d'une édition (la vraie fin reste secrète jusqu'à l'arrivée)
  v: 2,                                        // version du moteur (Phase 4 : événements de course) ; une édition sans v se rejoue en v1
};


return { sphereGM, gmOfGiant, RACE_SYSTEMS, RACERS, PILOT };
})();

// ── sandbox/race/engine.js ──
__m.engine = (() => {
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
//   · panne de propulsion en étape (plus probable coque abîmée), arrêt de réparation (temps contre intégrité).
// Chaque événement est aussi un fait de course (tracks[id].happenings) pour la voix off et le fil d'actualité.
// Positions en repère local du système (géante au centre, plan équatorial XZ). Unités SI.
const { propagate, sampleAt, hyperbolicApproach } = __m.gravity;
const { gmOfGiant, sphereGM } = __m.raceData;
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
function rngOf(str) {
  let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// v2 : hasard à 128 bits d'état (cyrb128 → sfc32) : la course dépend de toute la graine, pas de 32 bits
function rng2(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  let a = (h1 ^ h2 ^ h3 ^ h4) >>> 0, b = (h2 ^ h1) >>> 0, c = (h3 ^ h1) >>> 0, d = (h4 ^ h1) >>> 0;
  const next = () => { a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0; return (t >>> 0) / 4294967296; };
  for (let i = 0; i < 12; i++) next();
  return next;
}
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const FUEL_PER_DV = 1 / 9000, FUEL_PER_LEG = 0.12;            // part du réservoir par m/s de poussée, par étape

// le pilote choisit sa trajectoire à l'entrée d'un système. ctx : { gap (s de retard sur le premier entré), rank, n,
// fuel, integrity, last (dernier système : l'arrivée est à la périapse), legsLeft }
function choosePlan(racer, sys, ctx, R) {
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
const PLAN_LABEL = { plongée: 'plongée rasante', classique: 'passage classique', prudente: 'passage prudent' };

// une fronde selon le plan du pilote : arrivée hyperbolique (vitesse à l'infini choisie), périapse côté jour (azimut du
// soleil + 0,9 rad, décalé selon le plan), plan incliné propre au pilote, ligne des nœuds qui fait traverser l'anneau
// principal à l'aller ; poussée de dv autour de la périapse
function passSystem(sys, plan, tStart, entryR = 9) {
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
const ENGINE_V = 2;                                           // version la plus récente que ce moteur sait rejouer
const V_REF = 1.55e4;                                          // vitesse de sortie de référence (étape de legHours)


const LABELS = { entry: 'entrée', ring: 'plan des anneaux', periapsis: 'périapse', exit: 'sortie' };

// carte publique des dangers d'une édition (v2) : ceinture d'astéroïdes et risque d'éruption sur chaque étape
const FLARE_P = { faible: 0.2, moyen: 0.45, 'élevé': 0.75 };
function hazardsOf(systems, seed) {
  const R = rng2(`${seed}|dangers`);
  return { legs: systems.slice(0, -1).map((s, k) => {
    const belt = R() < 0.7 ? { gain: +(0.03 + R() * 0.03).toFixed(3) } : null, x = R();
    return { from: s.id, to: systems[k + 1].id, belt, flare: x < 0.35 ? 'faible' : x < 0.75 ? 'moyen' : 'élevé' };
  }) };
}
const MIN = 60;
// décisions et tirages v2 d'un passage (et de l'étape qui suit) : seulement quand les pilotes décident
function decideV2(r, sys, k, last, plan, S, sl, ctx) {
  const R = rng2(`${ctx.seed}|${r.id}|${sys.id}|v2`), ag = plan.ag, ev = {};
  // assistance d'une lune : les audacieux, s'il y a des lunes, jamais dans le dernier système (l'arrivée est à la périapse)
  // (la lune la plus proche de la trajectoire, avant la périapse ; trop loin, ou seulement à l'entrée : pas d'assistance)
  if (!last && sys.moons.length && R() < 0.2 + ag * 0.6) {
    let best = null; for (const m of sys.moons) { const a = moonApproach(sys, sl.samples, sl.tp, m.id); if (!best || a.d < best.a.d) best = { m, a }; }
    const u1 = R(), u2 = R(), u3 = R();
    if (best && best.a.i > 0 && best.a.d < 2.6e8) {
      const near = clamp(1.45 - best.a.d / 2.2e8, 0.35, 1.2);
      ev.moon = { id: best.m.id, t: Math.round(Math.min(best.a.t, sl.tpPlanned - 600)), d: Math.round(best.a.d / 1e3), gain: Math.round((260 + u1 * 380) * Math.min(1.4, best.m.r / 1.3e6) * near), dmg: u2 < 0.22 + ag * 0.25 ? +((0.03 + u3 * 0.04) * (r.tough || 1)).toFixed(4) : 0 };
    }
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
  if (!(k in fl)) { const Rf = rng2(`${ctx.seed}|eruption|${k}`); fl[k] = Rf() < (FLARE_P[hz.flare] || 0) ? { t: null, u: Rf(), dur: (2 + Rf() * 2.5) * 3600 } : null; }
  if (fl[k]) L.flare = { prudent: ag < 0.45 || integ < 0.7, u: R() };   // l'issue dépend de l'heure (posée à l'application)
  // panne de propulsion en étape, plus probable avec une coque abîmée
  if (R() < 0.06 + (1 - integ) * 0.35) L.failure = { f: +(0.15 + R() * 0.7).toFixed(3), lost: Math.round((15 + R() * 25) * MIN) };
  // arrêt de réparation : coque très abîmée et pilote raisonnable
  if (integ < 0.72 && (ag < 0.6 || integ < 0.55)) L.repair = { f: 0.5, lost: Math.round((25 + R() * 25) * MIN), gain: +(0.12 + R() * 0.06).toFixed(3) };
  ev.leg = L;
  return ev;
}
// instant du passage au plus près d'une lune (avant la périapse), d'après la trajectoire
function moonApproach(sys, samples, tp, moonId) {
  const { list } = bodiesOf(sys), i = sys.moons.findIndex((m) => m.id === moonId), b = list[i + 1], o = [0, 0, 0];
  let best = null;
  samples.forEach((s, i) => { if (s.t > tp) return; b.pos(s.t, o); const d = Math.hypot(s.p[0] - o[0], s.p[1] - o[1], s.p[2] - o[2]); if (!best || d < best.d) best = { t: s.t, d, i }; });
  return best || { t: samples[0].t, d: Infinity, i: 0 };
}
const planKey = (racerId, sysId) => `${racerId}|${sysId}`;

// plans : { 'racer|système': plan } pour rejouer ; sinon les pilotes décident (et la surchauffe est tirée)
function runRace({ systems, racers, pilot, plans = null, memo = null }) {
  const V2 = (pilot.v || 1) >= 2;
  const hazards = V2 ? (pilot.hazards || (pilot.seed ? hazardsOf(systems, pilot.seed) : null)) : null, flares = {};
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
        const R = (V2 ? rng2 : rngOf)(`${pilot.seed}|${r.id}|${sys.id}`);
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
      const integ0 = S.integrity;
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
          const m = sys.moons.find((x) => x.id === ev.moon.id), tm = ev.moon.t;
          vOut += ev.moon.gain;
          // la lune vient avant la périapse : son état ne compte que ses propres débris (la chauffe de la périapse vient après)
          const im = Math.max(0.3, integ0 - ev.moon.dmg);
          HP.push({ t: tm, kind: 'moon', sys: sys.id, prio: 4, data: { moon: m ? m.name.split(' · ')[0] : ev.moon.id, gain: ev.moon.gain, dmg: ev.moon.dmg, d: ev.moon.d, integrity: im } });
          if (ev.moon.dmg) { S.integrity = Math.max(0.3, S.integrity - ev.moon.dmg); S.events[S.events.length - 1].integrity = S.integrity; S.events.push({ t: tm, fuel: S.fuel + plan.dv * FUEL_PER_DV, integrity: im }); }
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
          const pure = dur;                                      // durée de vol, avant les temps perdus
          if (L.belt) for (const h of L.belt.hits) marks.push([legT0 + h.f * pure, -h.dmg, { kind: 'beltHit', prio: 4, data: { dmg: h.dmg } }]);
          if (L.failure) marks.push([legT0 + L.failure.f * pure, 0, { kind: 'failure', prio: 4, data: { lost: L.failure.lost } }, L.failure.lost]);
          if (L.repair) marks.push([legT0 + L.repair.f * pure, L.repair.gain, { kind: 'repair', prio: 3, data: { lost: L.repair.lost, gain: L.repair.gain } }, L.repair.lost]);
          if (L.flare) {
            // l'heure de l'éruption : posée par le premier racer parti sur l'étape (pilotes) ; relue dans le plan (rejeu)
            if (!plans) { const F = flares[k]; if (F.t == null) F.t = legT0 + (0.25 + F.u * 0.9) * pure; L.flare.t = Math.round(F.t); L.flare.dur = Math.round(F.dur); }   // fenêtre jusqu'au-delà de l'étape du premier : le peloton aussi
            const tf = L.flare.t, f = (tf - legT0) / pure;
            if (f > 0 && f < 1) {                                // l'éruption tombe pendant son étape
              const lost = L.flare.prudent ? Math.round((12 + L.flare.u * 18) * MIN) : L.flare.u < 0.3 ? Math.round((30 + L.flare.u * 100) * MIN) : 0;
              const dmg = L.flare.prudent ? 0 : +((0.03 + L.flare.u * 0.05) * (r.tough || 1)).toFixed(4);
              marks.push([tf, -dmg, { kind: 'flare', prio: 4, data: { prudent: L.flare.prudent, lost, dmg, dur: L.flare.dur } }, lost, true]);
            }
          }
          // les temps perdus décalent la suite de l'étape (pas l'éruption : même heure pour tous)
          let shift = 0;
          const rel = marks.filter((m) => !m[4]).sort((a, b) => a[0] - b[0]), abs = marks.filter((m) => m[4]), seq = [];
          let prevEnd = legT0;
          while (rel.length || abs.length) {
            const take = !abs.length || (rel.length && rel[0][0] + shift <= abs[0][0]) ? rel.shift() : abs.shift();
            const t = take[4] ? take[0] : take[0] + shift;
            // une éruption pendant un arrêt (panne, réparation) : seul le temps qui dépasse cet arrêt est perdu en plus
            if (take[4] && take[3] && t < prevEnd) { take[3] = Math.max(0, Math.round(t + take[3] - prevEnd)); take[2] = { ...take[2], data: { ...take[2].data, lost: take[3] } }; }
            seq.push([t, take]); shift += take[3] || 0;
            if (take[3]) prevEnd = Math.max(t, prevEnd) + take[3];
          }
          for (const [t, m] of seq) {
            if (m[1]) { S.integrity = clamp(S.integrity + m[1], 0.3, 1); }
            S.events.push({ t, fuel: legFuel, integrity: S.integrity });
            HP.push({ t, sys: systems[k + 1].id, ...m[2], data: { ...m[2].data, integrity: S.integrity } });
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
const planOf = (p) => ({ kind: p.kind, ag: p.ag, vInf: p.vInf, rp: p.rp, dv: p.dv, azOff: p.azOff, inc: p.inc, failed: !!p.failed, ...(p.ev ? { ev: JSON.parse(JSON.stringify(p.ev)) } : {}) });
const plansMap = (revealed) => Object.fromEntries(revealed.map((x) => [planKey(x.racer, x.sys), x.plan]));

// empreinte des temps de passage (ms) de tous les racers : identique partout où le moteur tourne
function digest(res) {
  return Object.keys(res.tracks).sort().map((id) => id + ':' + res.tracks[id].cps.map((c) => Math.round(c.t * 1000)).join(',')).join(';');
}

return { rngOf, rng2, clamp, FUEL_PER_DV, choosePlan, PLAN_LABEL, passSystem, ENGINE_V, V_REF, FLARE_P, hazardsOf, runRace, planOf, plansMap, digest };
})();

export const { runRace, digest, planOf, plansMap, choosePlan, passSystem, rngOf, rng2, hazardsOf, FLARE_P, ENGINE_V, PLAN_LABEL, FUEL_PER_DV, FUEL_PER_LEG, V_REF } = __m.engine;
export const { RACE_SYSTEMS, RACERS, PILOT, gmOfGiant, sphereGM } = __m.raceData;
export const ENGINE_HASH = '1913cfe11b23cc2a';
// empreintes de référence (sha-256 tronqué de digest(runRace)) calculées par tools/fronde/engine_test.mjs
export const ENGINE_REF = {"fronde-222":"6e761f2fe26fc587","test-2":"0e72856e09c27ce4","test-3":"9d717e59d9e4bd4f","test-4":"8656357ca1aa2081","test-5":"5c6893a3d5c9224b"};
