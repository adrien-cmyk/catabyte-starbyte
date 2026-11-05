// RingDebris — fragments et poussière des anneaux, visibles seulement de près.
// Les données (RingDebrisData) suivent l'interface du champ d'astéroïdes : mêmes cellules par niveau d'échelle,
// même rendu instancié (AsteroidField), mais exprimées dans le repère des anneaux (plan XZ local) : la densité vient
// du profil radial des anneaux (une seule vérité avec le disque et la simulation), l'épaisseur est une couche
// gaussienne de quelques centaines de mètres. La poussière est une boîte de particules qui se répète autour de la
// caméra (positions stables dans le monde, aucun coût de génération), dosée par la densité locale.
import { THREE } from '../lib/sb3d-shim.js';
import { AsteroidField } from './AsteroidField.js';

function hash4(x, y, z, s) {
  let h = (s ^ Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841) ^ Math.imul(z | 0, 0xcb1ab31f)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b); h ^= h >>> 16;
  return h >>> 0;
}
const next = (h) => { h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); return (h ^ (h >>> 15)) >>> 0; };
const u01 = (h) => (h >>> 8) / 16777216;

export class RingDebrisData {
  // ring : RingSystem (densityAt, colorAt en rayons planétaires) ; R : rayon de la planète (m)
  constructor(ring, R, { seed = 7, halfThick = 260, quality = 0 } = {}) {
    this.ring = ring; this.R = R; this.H = halfThick; this.seed = seed >>> 0;
    const k = quality >= 2 ? 0.45 : 1;
    this.levels = [12, 4, 1.35].map((r, i) => { const D = r * 1600; return { k: i, r, D, s: D / 2.5, n: Math.round([260, 360, 460][i] * k) }; });
    this.def = { extent: [ring.outer * R, ring.outer * R, ring.outer * R] };
  }
  density(x, y, z) { return this.ring.densityAt(Math.hypot(x, z) / this.R) * Math.exp(-(y / this.H) * (y / this.H)); }
  rocksInCell(level, ix, iy, iz) {
    const L = this.levels[level], s = L.s, H = this.H;
    const y0 = iy * s, y1 = y0 + s;
    if (y1 < -3 * H || y0 > 3 * H) return [];
    const d0 = this.ring.densityAt(Math.hypot((ix + 0.5) * s, (iz + 0.5) * s) / this.R);
    if (d0 < 0.02) return [];
    let h = hash4(ix, iy, iz, this.seed + level * 7919);
    const n = Math.round(L.n * d0);
    const out = [];
    for (let i = 0; i < n; i++) {
      h = next(h); const x = (ix + u01(h)) * s; h = next(h); const z = (iz + u01(h)) * s;
      h = next(h); const g1 = Math.max(u01(h), 1e-6); h = next(h); const g2 = u01(h);
      const y = Math.sqrt(-2 * Math.log(g1)) * Math.cos(6.2832 * g2) * H * 0.7;   // couche gaussienne
      if (y < y0 || y >= y1) continue;                                           // chaque fragment appartient à une cellule
      const dr = this.ring.densityAt(Math.hypot(x, z) / this.R);
      h = next(h); if (u01(h) > dr / Math.max(d0, 1e-3)) continue;               // suit les divisions fines du profil
      h = next(h); const r = L.r * (1 + 1.7 * Math.pow(u01(h), 2.4));
      h = next(h); const shape = (h >>> 8) % 16;
      h = next(h); const az = u01(h) * 2 - 1; h = next(h); const aa = u01(h) * 6.2832, aq = Math.sqrt(1 - az * az);
      h = next(h); const speed = (2 * Math.PI / (600 + 3000 * u01(h)))   // un tour en 10 min à 1 h * (u01(next(h)) < 0.5 ? -1 : 1);
      h = next(h); const phase = u01(h) * 6.2832;
      h = next(h); const ns = [0.9 + 0.2 * u01(h), 0.9 + 0.2 * u01(next(h)), 0.9 + 0.2 * u01(next(next(h)))];
      h = next(h); const tv = 0.8 + 0.35 * u01(h);
      const c = this.ring.colorAt(Math.hypot(x, z) / this.R);
      out.push({ x, y, z, r, shape, axis: [aq * Math.cos(aa), az, aq * Math.sin(aa)], speed, phase, ns, tint: [c[0] * tv, c[1] * tv, c[2] * tv], metal: 0 });
    }
    return out;
  }
  queryNear(p, radius) {           // p en repère des anneaux (m) — pour la simulation
    const res = [];
    this.levels.forEach((L, k) => {
      const s = L.s, a = (v) => Math.floor((v - radius) / s), b = (v) => Math.floor((v + radius) / s);
      for (let i = a(p[0]); i <= b(p[0]); i++) for (let j = a(p[1]); j <= b(p[1]); j++) for (let l = a(p[2]); l <= b(p[2]); l++)
        for (const q of this.rocksInCell(k, i, j, l)) if (Math.hypot(q.x - p[0], q.y - p[1], q.z - p[2]) < radius + q.r) res.push(q);
    });
    return res;
  }
}

const DUST_VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
uniform vec3 uOff; uniform float uB, uDens, uSunI; uniform vec3 uSunL, uCol;
attribute float aSize;
varying float vA; varying vec3 vC;
void main(){
  vec3 p = mod(position - uOff, uB) - 0.5 * uB;              // boîte répétée centrée sur la caméra (repère des anneaux)
  float d = length(p);
  vA = uDens * (1.0 - smoothstep(0.3 * uB, 0.5 * uB, d)) * smoothstep(0.5, 3.0, d);
  vec4 w = modelMatrix * vec4(p, 1.0);
  float ph = 0.55 + 0.45 * max(dot(normalize(w.xyz), uSunL), 0.0);   // diffusion vers l'avant : plus clair face au soleil
  vC = uCol * uSunI * ph;
  gl_PointSize = clamp(aSize * 60.0 / max(d, 1.0), 1.0, 3.0);
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}`;
const DUST_FRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
varying float vA; varying vec3 vC;
void main(){
  #include <logdepthbuf_fragment>
  float r = length(gl_PointCoord - 0.5) * 2.0;
  gl_FragColor = vec4(vC * vA * (1.0 - r * r), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class RingDebris {
  constructor(giant, { quality = 0 } = {}) {
    const ring = giant.ring;
    this.giant = giant; this.ring = ring;
    this.data = new RingDebrisData(ring, giant.R, { quality });
    this.field = new AsteroidField({ center: giant.pos }, { quality, data: this.data, frame: giant.group.quaternion, dotGain: 0.55 });
    this.field.center = giant.pos;                      // suit la géante (même tableau float64)
    // poussière
    const N = quality >= 2 ? 1500 : 4000, B = 420, pos = new Float32Array(N * 3), size = new Float32Array(N);
    let h = 12345;
    for (let i = 0; i < N; i++) { for (let c = 0; c < 3; c++) { h = next(h + c); pos[i * 3 + c] = u01(h) * B; } h = next(h); size[i] = 0.4 + 1.6 * Math.pow(u01(h), 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.dustU = { uOff: { value: new THREE.Vector3() }, uB: { value: B }, uDens: { value: 0 }, uSunI: { value: 1.7 }, uSunL: { value: new THREE.Vector3() }, uCol: { value: new THREE.Color() } };
    this.dust = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: this.dustU, vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.dust.frustumCulled = false; this.dustN = N;
    this._q = new THREE.Quaternion(); this._v = new THREE.Vector3();
  }
  addTo(scene, frame) { frame.add(this.field.group, this.field.anchor); scene.add(this.field.group, this.dust); }
  removeFrom(scene, frame) { frame.remove(this.field.group); scene.remove(this.field.group, this.dust); }
  update(frame, camera, sunDirW, sunColor, sunI, pixAngle, timeS) {
    this.field.update(frame, camera, sunDirW, sunColor, sunI, pixAngle, timeS);
    // caméra dans le repère des anneaux
    const g = this.giant, c = frame.cam;
    const q = this._q.copy(g.group.quaternion).invert();
    const v = this._v.set(c[0] - g.pos[0], c[1] - g.pos[1], c[2] - g.pos[2]).applyQuaternion(q);
    const B = this.dustU.uB.value, md = (x) => ((x % B) + B) % B;
    this.dustU.uOff.value.set(md(v.x), md(v.y), md(v.z));
    const rr = Math.hypot(v.x, v.z) / g.R;
    this.dustU.uDens.value = this.data.density(v.x, v.y, v.z) * 0.9;
    this.dustU.uCol.value.setRGB(...this.ring.colorAt(rr));
    this.dustU.uSunI.value = sunI; this.dustU.uSunL.value.copy(sunDirW);
    this.dust.quaternion.copy(g.group.quaternion);
    this.dust.position.set(0, 0, 0);
    // le disque s'efface autour de la caméra quand elle est assez près du plan pour voir les fragments
    this.ring.uniforms.uNear.value = Math.abs(v.y) < this.data.levels[0].D ? this.data.levels[0].D * 0.75 : 0;
  }
  setLod(b) { this.field.setLod(b); this.dust.geometry.setDrawRange(0, Math.round(this.dustN * b.dust)); }
  get stats() { return this.field.stats; }
}
