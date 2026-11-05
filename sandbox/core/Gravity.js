// Gravity — gravitation newtonienne et intégrateur Velocity Verlet à pas adaptatif, en JavaScript pur (float64,
// aucune dépendance à three.js) : le même code tournera sur le serveur de course (Phase 3).
//   a = −Σ G·M · r / |r|³          (r = position du vaisseau − position de l'astre)
// Le pas suit le temps dynamique local : dt = η · min √(r³ / GM) sur les astres, borné ; près d'un astre le pas
// se resserre automatiquement (passages rasants), loin il s'allonge (croisière).
// bodies : [{ GM, R, pos(t, out) }] — pos renvoie la position de l'astre au temps t (m, s).

export const G = 6.674e-11;
export const GM_GIANT = 1.267e17;                     // masse de Jupiter (cohérent avec les orbites des lunes)
export const gmOfSphere = (radius, density) => G * (4 / 3) * Math.PI * radius ** 3 * density;

export function accel(bodies, p, t, out, tmp = [0, 0, 0]) {
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
export function propagate(bodies, state, duration, { eta = 0.004, dtMin = 0.05, dtMax = 60, thrust = null } = {}) {
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
export function sampleAt(samples, t, outP, outV) {
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
export function hyperbolicApproach(GM, vInf, rp, r0, u, w) {
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
