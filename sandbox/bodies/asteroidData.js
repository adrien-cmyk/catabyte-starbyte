// asteroidData — données déterministes du champ d'astéroïdes, en JavaScript pur (aucune dépendance à three.js).
// Formes de base (16 familles de déformations sur une icosphère) et contenu de chaque cellule du champ (positions,
// tailles, rotations). Le rendu et la future simulation lisent la même fonction : rocksInCell(level, ix, iy, iz).
// Toutes les distances en mètres ; hachages Math.imul uniquement (mêmes résultats sur tout moteur JS).

function hash4(x, y, z, s) {
  let h = (s ^ Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841) ^ Math.imul(z | 0, 0xcb1ab31f)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b); h ^= h >>> 16;
  return h >>> 0;
}
const next = (h) => { h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); return (h ^ (h >>> 15)) >>> 0; };
const u01 = (h) => (h >>> 8) / 16777216;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function rng(seed) { let h = seed >>> 0; return () => (h = next(h + 0x9e3779b9), u01(h)); }
export function seedOf(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function vnoise(x, y, z, s) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let fx = x - xi, fy = y - yi, fz = z - zi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const v = (a, b, c) => u01(hash4(xi + a, yi + b, zi + c, s));
  const x00 = v(0, 0, 0) + (v(1, 0, 0) - v(0, 0, 0)) * fx, x10 = v(0, 1, 0) + (v(1, 1, 0) - v(0, 1, 0)) * fx;
  const x01 = v(0, 0, 1) + (v(1, 0, 1) - v(0, 0, 1)) * fx, x11 = v(0, 1, 1) + (v(1, 1, 1) - v(0, 1, 1)) * fx;
  const y0 = x00 + (x10 - x00) * fy, y1 = x01 + (x11 - x01) * fy;
  return y0 + (y1 - y0) * fz;
}
function fbm(x, y, z, oct, s) {
  let a = 0.5, sum = 0;
  for (let i = 0; i < oct; i++) { sum += a * vnoise(x, y, z, s + i * 101); x *= 2.07; y *= 2.07; z *= 2.07; a *= 0.5; }
  return sum;
}

/* ── formes de base : icosphère subdivisée, rayon déformé r(dir) ── */
function icosphere(sub) {
  const t = (1 + Math.sqrt(5)) / 2;
  let V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    .map((v) => { const l = Math.hypot(...v); return v.map((c) => c / l); });
  let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < sub; s++) {
    const mid = new Map(), F2 = [];
    const m = (a, b) => {
      const k = a < b ? a + '_' + b : b + '_' + a;
      if (mid.has(k)) return mid.get(k);
      const v = [V[a][0] + V[b][0], V[a][1] + V[b][1], V[a][2] + V[b][2]], l = Math.hypot(...v);
      V.push(v.map((c) => c / l)); mid.set(k, V.length - 1); return V.length - 1;
    };
    for (const [a, b, c] of F) { const ab = m(a, b), bc = m(b, c), ca = m(c, a); F2.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    F = F2;
  }
  return { V, F };
}

// 16 formes : ellipsoïde de base + bosses basse fréquence + cratères + (pour certaines) bilobes ou facettes
export function makeShapeFn(k) {
  const r = rng(seedOf('ast-shape:' + k));
  const ax = [1, 0.62 + r() * 0.38, 0.45 + r() * 0.4];                         // allongement
  const lump = 0.12 + r() * 0.18, lf = 1.2 + r() * 1.3, seed = (r() * 1e9) | 0;
  const craters = Array.from({ length: 4 + ((r() * 9) | 0) }, () => {
    const z = r() * 2 - 1, a = r() * 6.283, q = Math.sqrt(1 - z * z);
    return { d: [q * Math.cos(a), z, q * Math.sin(a)], s: 0.12 + Math.pow(r(), 2) * 0.45, depth: 0.05 + r() * 0.1 };
  });
  const bilobe = k % 5 === 3, faceted = k % 4 === 1;
  const lobeOff = 0.55 + r() * 0.2, lobeR = 0.55 + r() * 0.2;
  return (x, y, z) => {
    // rayon de l'ellipsoïde dans la direction (x, y, z)
    let rr = 1 / Math.sqrt((x / ax[0]) ** 2 + (y / ax[1]) ** 2 + (z / ax[2]) ** 2);
    if (bilobe) {                                     // binaire de contact : deuxième lobe le long de x
      const b = x * lobeOff, c = b * b - (lobeOff * lobeOff - lobeR * lobeR);
      if (c > 0) rr = Math.max(rr * 0.85, b + Math.sqrt(c));
    }
    rr *= 1 + (fbm(x * lf + 5, y * lf, z * lf, 4, seed) - 0.5) * 2 * lump;
    if (faceted) {                                    // éclats : quelques plans de cassure
      const f = Math.abs(vnoise(x * 2.3, y * 2.3, z * 2.3, seed + 7) - 0.5);
      rr *= 1 - 0.08 * smooth(0.25, 0.05, f);
    }
    for (const c of craters) {
      const d = Math.hypot(x - c.d[0], y - c.d[1], z - c.d[2]) / c.s;
      if (d < 1.6) rr *= 1 - c.depth * (d < 1 ? 1 - d * d : 0) + c.depth * 0.3 * Math.exp(-(((d - 1) / 0.2) ** 2));
    }
    rr *= 1 + (fbm(x * 9, y * 9, z * 9, 3, seed + 3) - 0.5) * 0.05;          // rugosité
    return rr;
  };
}

// géométrie brute d'une forme à un niveau de détail : { pos: Float32Array, idx: Uint32Array }
export function buildShape(k, sub) {
  const { V, F } = icosphere(sub), fn = makeShapeFn(k);
  const pos = new Float32Array(V.length * 3);
  let maxR = 0;
  V.forEach((v, i) => { const r = fn(v[0], v[1], v[2]); pos[i * 3] = v[0] * r; pos[i * 3 + 1] = v[1] * r; pos[i * 3 + 2] = v[2] * r; maxR = Math.max(maxR, r); });
  for (let i = 0; i < pos.length; i++) pos[i] /= maxR;                      // rayon englobant = 1
  return { pos, idx: new Uint32Array(F.flat()) };
}

/* ── le champ ── */
// niveaux d'échelle : rayon de base des rochers, distance de visibilité, taille de cellule, rochers par cellule
export function fieldLevels(maxRock = 1500) {
  const L = [];
  for (let k = 0, r = maxRock; k < 5; k++, r /= 3) {
    const D = r * 1600;
    L.push({ k, r, D, s: D / 2.5, n: [36, 60, 90, 130, 170][k] });   // amas de course : bien plus dense qu'une ceinture réelle
  }
  return L;
}

export class AsteroidFieldData {
  // def = { seed, center: [x,y,z] monde, axes: 3 vecteurs unitaires (repère du champ), extent: [a,b,c] demi-axes (m) }
  constructor(def) {
    this.def = def; this.seed = seedOf('field:' + def.seed);
    this.levels = fieldLevels(def.maxRock || 1500);
  }
  // densité 0..1 au point p (relatif au centre du champ) : ellipsoïde aux bords dissous + amas
  density(x, y, z) {
    const A = this.def.axes, E = this.def.extent;
    const u = (x * A[0][0] + y * A[0][1] + z * A[0][2]) / E[0], v = (x * A[1][0] + y * A[1][1] + z * A[1][2]) / E[1], w = (x * A[2][0] + y * A[2][1] + z * A[2][2]) / E[2];
    const q = Math.sqrt(u * u + v * v + w * w);
    if (q > 1.15) return 0;
    const clump = fbm(u * 3 + 11, v * 6, w * 6, 4, this.seed);
    return smooth(1.15, 0.55, q) * smooth(0.32, 0.62, clump);
  }
  // rochers d'une cellule (positions relatives au centre du champ). Déterministe.
  rocksInCell(level, ix, iy, iz) {
    const L = this.levels[level], s = L.s;
    const cx = (ix + 0.5) * s, cy = (iy + 0.5) * s, cz = (iz + 0.5) * s;
    const dens = this.density(cx, cy, cz);
    if (dens <= 0.01) return [];
    let h = hash4(ix, iy, iz, this.seed + level * 7919);
    const n = Math.round(L.n * dens * (0.6 + 0.8 * u01(h)));
    const out = [];
    for (let i = 0; i < n; i++) {
      h = next(h); const x = (ix + u01(h)) * s; h = next(h); const y = (iy + u01(h)) * s; h = next(h); const z = (iz + u01(h)) * s;
      if (this.density(x, y, z) < u01(next(h + 17)) * 0.6) continue;
      h = next(h); const r = L.r * (1 + 1.6 * Math.pow(u01(h), 2.2));           // loi de puissance : peu de gros
      h = next(h); const shape = (h >>> 8) % 16;
      h = next(h); const az = u01(h) * 2 - 1; h = next(h); const aa = u01(h) * 6.2832, aq = Math.sqrt(1 - az * az);
      h = next(h); const speed = (2 * Math.PI / (3600 * (2 + 18 * u01(h)))) * (u01(next(h)) < 0.5 ? -1 : 1);
      h = next(h); const phase = u01(h) * 6.2832;
      h = next(h); const ns = [0.85 + 0.3 * u01(h), 0.85 + 0.3 * u01(next(h)), 0.85 + 0.3 * u01(next(next(h)))];
      h = next(h); const kind = u01(h);                                           // carboné sombre / silicaté / métallique
      h = next(h); const tv = u01(h);
      // albédos linéaires réalistes : carbonés très sombres, silicatés gris-brun, métalliques gris neutre
      const tint = kind < 0.55 ? [0.055 + 0.02 * tv, 0.05 + 0.018 * tv, 0.045 + 0.015 * tv]
        : kind < 0.9 ? [0.2 + 0.06 * tv, 0.165 + 0.05 * tv, 0.13 + 0.04 * tv] : [0.2 + 0.04 * tv, 0.2 + 0.04 * tv, 0.19 + 0.04 * tv];
      out.push({ x, y, z, r, shape, axis: [aq * Math.cos(aa), az, aq * Math.sin(aa)], speed, phase, ns, tint, metal: kind >= 0.9 ? 1 : 0 });
    }
    return out;
  }
  // rochers proches d'un point (simulation : collisions, passages) — tous niveaux
  queryNear(p, radius) {
    const res = [];
    for (let k = 0; k < this.levels.length; k++) {
      const s = this.levels[k].s, a = Math.floor((p[0] - radius) / s), b = Math.floor((p[0] + radius) / s);
      const c = Math.floor((p[1] - radius) / s), d = Math.floor((p[1] + radius) / s);
      const e = Math.floor((p[2] - radius) / s), f = Math.floor((p[2] + radius) / s);
      for (let i = a; i <= b; i++) for (let j = c; j <= d; j++) for (let l = e; l <= f; l++)
        for (const q of this.rocksInCell(k, i, j, l)) if (Math.hypot(q.x - p[0], q.y - p[1], q.z - p[2]) < radius + q.r) res.push(q);
    }
    return res;
  }
}
