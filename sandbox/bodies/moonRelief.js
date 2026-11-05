// moonRelief — relief déterministe d'une lune, en JavaScript pur (aucune dépendance à three.js).
// La même fonction sert au rendu (Web Worker qui construit les parcelles) et servira à la simulation
// (altitude au survol, passages rasants, collisions) : une seule vérité, identique côté client et serveur.
//
// Relief = socle fBm + cratères procéduraux par niveaux d'échelle (une grille 3D par niveau, au plus un cratère
// par cellule, cellules de la couche qui traverse la surface : densité uniforme sur la sphère) + éléments propres
// à la famille (fractures des lunes glacées, volcans boucliers et caldeiras des lunes volcaniques).
// Toutes les distances sont en mètres. Les hachages n'utilisent que Math.imul : mêmes résultats sur tout moteur JS.

function hash4(x, y, z, s) {
  let h = (s ^ Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841) ^ Math.imul(z | 0, 0xcb1ab31f)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b); h ^= h >>> 16;
  return h >>> 0;
}
const u01 = (h) => (h >>> 8) / 16777216;
const next = (h) => { h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); return (h ^ (h >>> 15)) >>> 0; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function seedOf(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

// bruit de valeur 3D et fBm (coordonnées sans dimension)
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
  for (let i = 0; i < oct; i++) { sum += a * vnoise(x, y, z, s + i * 101); x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; }
  return sum;
}
function ridged(x, y, z, oct, s) {
  let a = 0.5, sum = 0;
  for (let i = 0; i < oct; i++) { const n = 1 - Math.abs(vnoise(x, y, z, s + i * 131) * 2 - 1); sum += a * n * n; x *= 2.1; y *= 2.1; z *= 2.1; a *= 0.5; }
  return sum;
}

// profil d'un cratère, x = distance / rayon ; renvoie [hauteur relative à la profondeur, fraîcheur des éjectas]
function craterProfile(x, complex) {
  if (x >= 2.2) return 0;
  let h = 0;
  if (x < 1) {
    const bowl = x * x - 1;
    h = complex ? Math.max(bowl, -0.72) + 0.38 * Math.exp(-(x / 0.13) * (x / 0.13)) : bowl;
  }
  h += 0.22 * Math.exp(-((x - 1) / 0.17) * ((x - 1) / 0.17));             // rebord
  if (x > 1) h += 0.11 * Math.pow(1 / x, 3) * (1 - smooth(1.6, 2.2, x));  // éjectas
  return h;
}

export const MOON_FAMILIES = {
  rocky: {
    craterDensity: 0.95, craterLevels: 9, baseAmp: 2600, baseFreq: 2.2, maria: true,
    colors: ['#8d8781', '#625d58', '#b3ada4'], // sol, mers sombres, éjectas frais
  },
  icy: {
    craterDensity: 0.12, craterLevels: 7, baseAmp: 700, baseFreq: 3.0, fractures: 46,
    colors: ['#b4bec2', '#7d5240', '#8fb4c9'], // glace, lignes brun-rouge, glace bleue fraîche
  },
  volcanic: {
    craterDensity: 0.04, craterLevels: 5, baseAmp: 1700, baseFreq: 2.6, volcanoes: true,
    colors: ['#b9a868', '#a8603d', '#2a2119'], // soufre, dépôts orangés, coulées sombres (+ lave émissive)
  },
};

export class MoonRelief {
  // p = { family, radius, seed }
  constructor(p) {
    this.R = p.radius; this.family = p.family; this.F = MOON_FAMILIES[p.family];
    this.seed = seedOf('moon:' + p.seed);
    const F = this.F;
    // niveaux de cratères : cellules de R/2 jusqu'à ~250 m
    this.levels = [];
    let s = this.R * 0.5;
    for (let k = 0; k < 14 && s > 250; k++, s /= 2) this.levels.push({ s, p: F.craterDensity * (k < 2 ? 0.55 : 1), seed: hash4(k, 7, 3, this.seed) });
    // fractures : arcs de petits cercles (plan, décalage, axe et ouverture qui limitent l'arc)
    this.fr = [];
    let h = hash4(1, 2, 3, this.seed);
    const rnd = () => (h = next(h), u01(h));
    const rdir = () => { const z = rnd() * 2 - 1, a = rnd() * 6.2831853, r = Math.sqrt(1 - z * z); return [r * Math.cos(a), z, r * Math.sin(a)]; };
    for (let i = 0; i < (F.fractures || 0); i++) {
      this.fr.push({ n: rdir(), o: (rnd() - 0.5) * 1.1, ax: rdir(), cosLim: Math.cos(0.4 + rnd() * 1.4),
        w: 1500 + rnd() * 5500, d: 250 + rnd() * 650 });
    }
  }
  // échantillon complet : [hauteur (m), masque A, masque B]. minScale (m) : on ignore les détails plus fins
  // (pour la géométrie d'une parcelle grossière) ; 0 = tout le détail (simulation).
  sample(dx, dy, dz, minScale = 0) {
    const R = this.R, F = this.F, S = this.seed;
    const f = F.baseFreq;
    let h = (fbm(dx * f + 11, dy * f + 3, dz * f + 7, 6, S) - 0.5) * 2 * F.baseAmp;
    let mA = 0, mB = 0;
    if (F.maria) {                                   // mers : grandes plaines basses et sombres
      const m = smooth(0.52, 0.6, fbm(dx * 1.3 + 40, dy * 1.3, dz * 1.3, 4, S + 9));
      h -= m * 1400; mA = m;
    }
    if (F.volcanoes) {                               // volcans boucliers et caldeiras sur une grille grossière
      const s = R * 0.55, px = dx * R / s, py = dy * R / s, pz = dz * R / s;
      const bx = Math.floor(px - 0.5), by = Math.floor(py - 0.5), bz = Math.floor(pz - 0.5);
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
        let hh = hash4(bx + a, by + b, bz + c, S + 77);
        if (u01(hh) > 0.8) continue;
        hh = next(hh); const cx = bx + a + u01(hh); hh = next(hh); const cy = by + b + u01(hh); hh = next(hh); const cz = bz + c + u01(hh);
        const L = Math.hypot(cx, cy, cz); if (Math.abs(L * s - R) > s * 0.5) continue;
        const ex = cx / L, ey = cy / L, ez = cz / L;
        const d = Math.hypot(dx - ex, dy - ey, dz - ez) * R;
        hh = next(hh); const rr = s * (0.12 + 0.13 * u01(hh)); hh = next(hh); const H = 2500 + 4500 * u01(hh);
        const x = d / rr;
        if (x < 2.5) {
          h += H * Math.exp(-x * x * 1.6);
          const cal = Math.max(0, 1 - (x / 0.22) * (x / 0.22));
          h -= cal * H * 0.45;
          mB = Math.max(mB, smooth(0.35, 0.18, x) * 0.6 + smooth(0.24, 0.2, x) * 0.4);           // lave dans la caldeira
          mA = Math.max(mA, smooth(1.8, 0.4, x) * 0.85);                                           // dépôts autour
        }
      }
    }
    if (this.fr.length) {                            // fractures : tranchées bordées de crêtes, couleur brun-rouge
      for (const q of this.fr) {
        if (dx * q.ax[0] + dy * q.ax[1] + dz * q.ax[2] < q.cosLim) continue;
        const w = Math.max(q.w, minScale * 0.75), kd = q.w / w;
        const d = Math.abs(dx * q.n[0] + dy * q.n[1] + dz * q.n[2] - q.o) * R;
        if (d > w * 3) continue;
        const x = d / w;
        h += q.d * kd * (0.55 * Math.exp(-((x - 1.1) * (x - 1.1)) * 4) - Math.exp(-x * x * 3));
        mA = Math.max(mA, Math.exp(-x * x * 0.7) * (0.5 + 0.5 * kd));
      }
      const lin = ridged(dx * 14, dy * 14, dz * 14, 4, S + 31);                                 // réseau fin (relief seul)
      h += smooth(0.6, 0.85, lin) * 120;
    }
    // cratères : au plus un par cellule, dans les cellules de la couche qui traverse la surface
    const px0 = dx * R, py0 = dy * R, pz0 = dz * R;
    for (const L of this.levels) {
      const s = L.s;
      if (s * 0.25 < minScale) break;
      const gx = px0 / s, gy = py0 / s, gz = pz0 / s;
      const bx = Math.floor(gx - 0.5), by = Math.floor(gy - 0.5), bz = Math.floor(gz - 0.5);
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
        let hh = hash4(bx + a, by + b, bz + c, L.seed);
        if (u01(hh) > L.p) continue;
        hh = next(hh); const cx = (bx + a + u01(hh)) * s; hh = next(hh); const cy = (by + b + u01(hh)) * s; hh = next(hh); const cz = (bz + c + u01(hh)) * s;
        const len = Math.hypot(cx, cy, cz);
        if (Math.abs(len - R) > s * 0.5) continue;
        const k = R / len, ex = cx * k - px0, ey = cy * k - py0, ez = cz * k - pz0;
        hh = next(hh); const r = s * (0.08 + 0.17 * u01(hh));
        const d2 = ex * ex + ey * ey + ez * ez;
        if (d2 > r * r * 4.84) continue;
        const x = Math.sqrt(d2) / r, D = 2 * r;
        hh = next(hh); const age = 0.35 + 0.65 * u01(hh);
        const depth = (D < 15000 ? 0.2 * D : 3000 * Math.pow(D / 15000, 0.3)) * age;
        h += craterProfile(x, D > 18000) * depth;
        if (age > 0.9 && D < 30000) mB = Math.max(mB, (1 - smooth(0.9, 2.8, x)) * (age - 0.9) * 5);   // éjectas frais
      }
    }
    return [h, mA, Math.min(1, mB)];
  }
  heightAt(dx, dy, dz) { return this.sample(dx, dy, dz, 0)[0]; }
}

/* ── cube-sphère : face → direction ── */
export const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] }, { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] }, { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }, { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];
// (s, t) ∈ [−1, 1] : déformation en tangente pour des cellules de taille presque uniforme
export function faceDir(f, s, t, out = [0, 0, 0]) {
  const F = FACES[f], a = Math.tan(s * 0.7853981634), b = Math.tan(t * 0.7853981634);
  const x = F.n[0] + F.u[0] * a + F.v[0] * b, y = F.n[1] + F.u[1] * a + F.v[1] * b, z = F.n[2] + F.u[2] * a + F.v[2] * b;
  const l = Math.hypot(x, y, z); out[0] = x / l; out[1] = y / l; out[2] = z / l; return out;
}

// construit une parcelle : grille res × res (+ bordure pour les normales, + jupe contre les fissures)
export function buildPatch(relief, f, s0, t0, s1, t1, res, centerDir) {
  const R = relief.R, N = res + 2, step = (s1 - s0) / (res - 1);
  const spacing = R * (s1 - s0) * 0.785 / (res - 1);
  const P = new Float64Array(N * N * 3), D = new Float32Array(res * res * 3), M = new Float32Array(res * res * 2);
  const d = [0, 0, 0];
  const cx = centerDir[0] * R, cy = centerDir[1] * R, cz = centerDir[2] * R;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    faceDir(f, s0 + (i - 1) * step, t0 + (j - 1) * step, d);
    const smp = relief.sample(d[0], d[1], d[2], spacing * 2);
    const r = R + smp[0], k = (j * N + i) * 3;
    P[k] = d[0] * r - cx; P[k + 1] = d[1] * r - cy; P[k + 2] = d[2] * r - cz;
    if (i > 0 && j > 0 && i <= res && j <= res) {
      const q = (j - 1) * res + (i - 1);
      D[q * 3] = d[0]; D[q * 3 + 1] = d[1]; D[q * 3 + 2] = d[2];
      M[q * 2] = smp[1]; M[q * 2 + 1] = smp[2];
    }
  }
  const nb = 4 * (res - 1), total = res * res + nb;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), dir = new Float32Array(total * 3), msk = new Float32Array(total * 2);
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const q = j * res + i, k = ((j + 1) * N + (i + 1)) * 3;
    const kx0 = k - 3, kx1 = k + 3, ky0 = k - N * 3, ky1 = k + N * 3;
    const ax = P[kx1] - P[kx0], ay = P[kx1 + 1] - P[kx0 + 1], az = P[kx1 + 2] - P[kx0 + 2];
    const bx = P[ky1] - P[ky0], by = P[ky1 + 1] - P[ky0 + 1], bz = P[ky1 + 2] - P[ky0 + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    pos[q * 3] = P[k]; pos[q * 3 + 1] = P[k + 1]; pos[q * 3 + 2] = P[k + 2];
    nor[q * 3] = nx; nor[q * 3 + 1] = ny; nor[q * 3 + 2] = nz;
    dir.set(D.subarray(q * 3, q * 3 + 3), q * 3); msk.set(M.subarray(q * 2, q * 2 + 2), q * 2);
  }
  // jupe : copie du pourtour abaissée radialement
  const skirt = spacing * 1.5 + 50, loop = borderLoop(res);
  loop.forEach((q, n) => {
    const o = res * res + n;
    pos[o * 3] = pos[q * 3] - D[q * 3] * skirt; pos[o * 3 + 1] = pos[q * 3 + 1] - D[q * 3 + 1] * skirt; pos[o * 3 + 2] = pos[q * 3 + 2] - D[q * 3 + 2] * skirt;
    nor.set(nor.subarray(q * 3, q * 3 + 3), o * 3); dir.set(D.subarray(q * 3, q * 3 + 3), o * 3); msk.set(M.subarray(q * 2, q * 2 + 2), o * 2);
  });
  let rmax = 0; for (let q = 0; q < total; q++) rmax = Math.max(rmax, Math.hypot(pos[q * 3], pos[q * 3 + 1], pos[q * 3 + 2]));
  return { pos, nor, dir, msk, rmax };
}
export function borderLoop(res) {
  const L = [];
  for (let i = 0; i < res - 1; i++) L.push(i);                               // bas
  for (let j = 0; j < res - 1; j++) L.push(j * res + res - 1);               // droite
  for (let i = res - 1; i > 0; i--) L.push((res - 1) * res + i);             // haut
  for (let j = res - 1; j > 0; j--) L.push(j * res);                         // gauche
  return L;
}
