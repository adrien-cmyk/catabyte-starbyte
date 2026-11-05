// Moon — lune procédurale : cube-sphère dont chaque face est un quadtree de parcelles (33 × 33 sommets + jupe),
// construites dans un Web Worker à partir de moonRelief.js (relief déterministe, réutilisable par la simulation).
// Une parcelle se subdivise quand son arête dépasse une fraction de sa distance à la caméra ; on ne subdivise pas
// au-delà de l'horizon. Les grandes formes sont dans la géométrie ; le détail fin (sous la taille d'un sommet)
// est un relief de bruit appliqué par perturbation de normale, dont les octaves s'ouvrent avec la distance.
import { THREE } from '../lib/sb3d-shim.js';
import { NOISE } from '../core/glsl.js';
import { MoonRelief, MOON_FAMILIES, faceDir, borderLoop } from './moonRelief.js';

/* ── file de construction partagée par toutes les lunes ── */
export class PatchPool {
  constructor(n = Math.min(3, Math.max(1, (navigator.hardwareConcurrency || 2) - 1))) {
    this.workers = Array.from({ length: n }, () => {
      const w = new Worker(new URL('../workers/moonPatch.worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => this._done(w, e.data);
      w.busy = 0; return w;
    });
    this.queue = []; this.cb = new Map(); this.seq = 0; this.inFlight = 0;
  }
  // prio : plus petit = plus urgent ; wanted() : la demande est-elle encore utile au moment de partir ?
  request(msg, prio, wanted, done) { this.queue.push({ msg, prio, wanted, done }); }
  pump() {
    if (!this.queue.length) return;
    this.queue.sort((a, b) => a.prio - b.prio);
    for (const w of this.workers) {
      while (w.busy < 2 && this.queue.length) {
        const job = this.queue.shift();
        if (!job.wanted()) { job.done(null); continue; }
        const id = ++this.seq; this.cb.set(id, job.done); w.busy++; this.inFlight++;
        w.postMessage({ ...job.msg, id });
      }
    }
  }
  _done(w, data) { w.busy--; this.inFlight--; const f = this.cb.get(data.id); this.cb.delete(data.id); if (f) f(data); }
  get pending() { return this.queue.length + this.inFlight; }
}

const indexCache = new Map();
function patchIndex(res) {
  if (indexCache.has(res)) return indexCache.get(res);
  const idx = [];
  for (let j = 0; j < res - 1; j++) for (let i = 0; i < res - 1; i++) {
    const a = j * res + i, b = a + 1, c = a + res, d = c + 1;
    idx.push(a, b, d, a, d, c);
  }
  const loop = borderLoop(res), n = loop.length, base = res * res;
  for (let k = 0; k < n; k++) {                      // jupe : deux faces (on ne se soucie pas de l'orientation)
    const a = loop[k], b = loop[(k + 1) % n], a2 = base + k, b2 = base + (k + 1) % n;
    idx.push(a, a2, b, b, a2, b2, a, b, a2, b, b2, a2);
  }
  const attr = new THREE.BufferAttribute(new Uint32Array(idx), 1);
  indexCache.set(res, attr); return attr;
}

const hex = (h) => new THREE.Color(h);
const VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aDir; attribute vec2 aMask;
varying vec3 vN, vPosW, vDir, vSph; varying vec2 vMask;
void main(){
  mat3 R = mat3(modelMatrix);
  vN = normalize(R * normal); vSph = normalize(R * aDir); vDir = aDir; vMask = aMask;
  vec4 w = modelMatrix * vec4(position, 1.0); vPosW = w.xyz;          // caméra à l'origine : relatif à la caméra
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}`;
const FRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
${NOISE}
uniform vec3 uSun, uSunCol, uColA, uColB, uColC;
uniform float uSunI, uR, uPix, uT, uBumpK;
varying vec3 vN, vPosW, vDir, vSph; varying vec2 vMask;
void main(){
  #include <logdepthbuf_fragment>
  float dist = length(vPosW), foot = max(dist * uPix, 0.05);
  // relief fin par octaves : chaque longueur d'onde n'apparaît que si elle couvre plusieurs pixels
  float hs = 0.0, lam = 24000.0;
  for (int i = 0; i < 11; i++){
    float w = smoothstep(2.0 * foot, 7.0 * foot, lam);
    if (w <= 0.0) break;
    float n = vnoise(vDir * (uR / lam) + float(i) * 7.31);
    #ifdef FAMILY_ROCKY
      n = 1.0 - abs(n * 2.0 - 1.0); n = n * n;                              // creux et bosses façon régolithe cratérisé
    #endif
    hs += (n - 0.5) * lam * uBumpK * w;
    lam *= 0.5;
  }
  vec3 N = normalize(vN);
  vec3 dpx = dFdx(vPosW), dpy = dFdy(vPosW);
  float dhx = dFdx(hs), dhy = dFdy(hs);
  vec3 r1 = cross(dpy, N), r2 = cross(N, dpx);
  float det = dot(dpx, r1);
  if (abs(det) > 1e-12){ N = normalize(abs(det) * N - sign(det) * (dhx * r1 + dhy * r2)); }

  // albédo selon la famille et les masques du relief
  float tint = 0.9 + 0.2 * vnoise(vDir * (uR / 3000.0));
  vec3 alb = uColA;
  alb = mix(alb, uColB, clamp(vMask.x, 0.0, 1.0));
  // masques purement visuels calculés ici : nets à toutes les distances, sans dépendre de la résolution des parcelles
  float lava = vMask.y;
  #ifdef FAMILY_ICY
    float lin = 0.0, la = 0.5; vec3 q = vDir * 14.0;
    for (int i = 0; i < 6; i++){ float n = 1.0 - abs(vnoise(q + float(i) * 3.1) * 2.0 - 1.0); lin += la * n * n * n; q *= 2.1; la *= 0.55; }
    alb = mix(alb, uColB, smoothstep(0.5, 0.72, lin) * 0.75);
    alb = mix(alb, uColC, smoothstep(0.55, 0.7, fbm(vDir * 3.0 + 9.0, 5)) * 0.5);      // plaques de glace bleue
  #endif
  #ifdef FAMILY_VOLCANIC
    float fl = fbm(vDir * 9.0 + 3.0, 7);
    alb = mix(alb, uColC, smoothstep(0.6, 0.66, fl) * 0.85);                          // coulées sombres
    alb = mix(alb, uColB * 1.1, smoothstep(0.44, 0.38, fl) * 0.35);                   // dépôts soufrés orangés
    alb = mix(alb, vec3(0.78, 0.76, 0.66), smoothstep(0.62, 0.7, fbm(vDir * 2.0 + 17.0, 5)) * 0.5); // givre de SO2
    lava = max(lava, smoothstep(0.69, 0.705, fl) * smoothstep(0.55, 0.7, fbm(vDir * 40.0, 4)));
    alb = mix(alb, uColC, smoothstep(0.1, 0.5, lava));                                 // croûte sombre autour de la lave
  #else
    alb = mix(alb, uColC, clamp(vMask.y, 0.0, 1.0));
  #endif
  alb *= tint;

  vec3 L = normalize(uSun), V = normalize(-vPosW);
  float mu0 = max(dot(N, L), 0.0), mu = max(dot(N, V), 0.0);
  float f;
  #ifdef FAMILY_ROCKY
    float ls = mu0 / (mu0 + mu + 1e-4);                                      // Lommel-Seeliger : régolithe
    float ph = acos(clamp(dot(L, V), -1.0, 1.0));
    f = mix(mu0, ls * 1.5, 0.6) * (1.0 + 0.45 * exp(-ph / 0.07));            // effet d'opposition
  #elif defined(FAMILY_ICY)
    vec3 H = normalize(L + V);
    f = mu0 * 0.9 + 0.12 * pow(max(dot(N, H), 0.0), 60.0) * mu0;
  #else
    f = mu0;
  #endif
  f *= smoothstep(-0.06, 0.04, dot(vSph, L));                               // le relief fin n'éclaire pas la nuit
  vec3 col = alb * f * uSunCol * uSunI;
  #ifdef FAMILY_ICY
    col += uColC * 0.035 * smoothstep(-0.25, 0.15, dot(vSph, L)) * uSunI;     // lumière diffusée dans la glace
  #endif
  col += alb * 0.0025;                                                       // lumière renvoyée par la géante (faible)
  #ifdef FAMILY_VOLCANIC
    float flick = 0.75 + 0.25 * vnoise(vDir * (uR / 900.0) + uT * 0.05);
    col += vec3(1.0, 0.32, 0.06) * smoothstep(0.55, 0.95, lava) * 3.0 * flick;      // lave émissive
  #endif
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Moon {
  // def = { name, family, radius, seed, orbit: { r, period, phase, inc }, spinOffset }
  constructor(def, { quality = 0, pool }) {
    this.def = def; this.R = def.radius; this.pool = pool; this.quality = quality;
    this.relief = new MoonRelief({ family: def.family, radius: def.radius, seed: def.seed });
    this.params = { family: def.family, radius: def.radius, seed: def.seed };
    this.key = def.family + ':' + def.seed + ':' + def.radius;
    this.res = quality >= 2 ? 17 : 33;
    this.split = quality >= 2 ? 0.55 : quality >= 1 ? 0.42 : 0.32;     // arête / distance au-delà de laquelle on subdivise
    this.maxDepth = Math.max(4, Math.ceil(Math.log2(this.R * 1.57 / 120)));
    this.pos = new Float64Array(3);
    this.quat = new THREE.Quaternion();
    this.group = new THREE.Group();
    const F = MOON_FAMILIES[def.family];
    this.uniforms = {
      uSun: { value: new THREE.Vector3(1, 0, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uSunI: { value: 1.7 },
      uColA: { value: hex(F.colors[0]) }, uColB: { value: hex(F.colors[1]) }, uColC: { value: hex(F.colors[2]) },
      uR: { value: this.R }, uPix: { value: 0.001 }, uT: { value: 0 },
      uBumpK: { value: def.family === 'icy' ? 0.025 : def.family === 'volcanic' ? 0.04 : 0.07 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      defines: { ['FAMILY_' + def.family.toUpperCase()]: 1 },
    });
    this.roots = [0, 1, 2, 3, 4, 5].map((f) => this._node(f, -1, -1, 1, 1, 0));
    this.shown = []; this.frameNo = 0; this.camL = new THREE.Vector3();
  }
  _node(f, s0, t0, s1, t1, depth) {
    const c = faceDir(f, (s0 + s1) / 2, (t0 + t1) / 2);
    return { f, s0, t0, s1, t1, depth, c, L: this.R * (s1 - s0) * 0.785, state: 0, mesh: null, kids: null, used: 0 };
  }
  _request(n) {
    n.state = 1;
    const prio = n.depth * 0.1 + this._dist(n) / this.R;
    this.pool.request(
      { key: this.key, params: this.params, f: n.f, s0: n.s0, t0: n.t0, s1: n.s1, t1: n.t1, res: this.res, center: n.c },
      prio, () => this.frameNo - n.used < 30,
      (d) => {
        if (!d) { n.state = 0; return; }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(d.nor, 3));
        g.setAttribute('aDir', new THREE.BufferAttribute(d.dir, 3));
        g.setAttribute('aMask', new THREE.BufferAttribute(d.msk, 2));
        g.setIndex(patchIndex(this.res));
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), d.rmax);
        const m = new THREE.Mesh(g, this.material);
        m.position.set(n.c[0] * this.R, n.c[1] * this.R, n.c[2] * this.R);
        m.visible = false; m.matrixAutoUpdate = false; m.updateMatrix();
        this.group.add(m); n.mesh = m; n.state = 2;
      });
  }
  _dist(n) {
    const c = this.camL, R = this.R;
    return Math.max(Math.hypot(n.c[0] * R - c.x, n.c[1] * R - c.y, n.c[2] * R - c.z) - n.L * 0.75, 1);
  }
  _beyondHorizon(n) {
    const c = this.camL, cl = c.length();
    if (cl <= this.R * 1.001) return false;
    const th = Math.acos(Math.min(1, this.R * 0.985 / cl));                 // marge pour les reliefs
    const ang = Math.acos(Math.max(-1, Math.min(1, (n.c[0] * c.x + n.c[1] * c.y + n.c[2] * c.z) / cl)));
    return ang - (n.s1 - n.s0) * 0.785 * 0.75 > th;
  }
  _visit(n) {
    n.used = this.frameNo;
    if (n.state === 0) this._request(n);
    if (this._beyondHorizon(n)) return;
    const want = n.depth < this.maxDepth && n.L / this._dist(n) > this.split;
    if (want) {
      if (!n.kids) {
        const sm = (n.s0 + n.s1) / 2, tm = (n.t0 + n.t1) / 2, d = n.depth + 1;
        n.kids = [this._node(n.f, n.s0, n.t0, sm, tm, d), this._node(n.f, sm, n.t0, n.s1, tm, d),
                  this._node(n.f, n.s0, tm, sm, n.t1, d), this._node(n.f, sm, tm, n.s1, n.t1, d)];
      }
      let ready = true;
      for (const k of n.kids) { k.used = this.frameNo; if (k.state === 0) this._request(k); if (k.state !== 2) ready = false; }
      if (ready) { for (const k of n.kids) this._visit(k); return; }
    }
    if (n.state === 2) { n.mesh.visible = true; this.shown.push(n.mesh); }
  }
  _evict(n) {
    if (!n.kids) return;
    for (const k of n.kids) this._evict(k);
    if (this.frameNo - n.kids[0].used > 240 && n.kids.every((k) => !k.kids)) {
      for (const k of n.kids) if (k.mesh) { this.group.remove(k.mesh); k.mesh.geometry.dispose(); }
      n.kids = null;
    }
  }
  // orbite autour de la géante (dans son plan équatorial) et rotation synchrone : même face vers la géante
  place(giant, timeS) {
    const o = this.def.orbit, a = o.phase + 2 * Math.PI * timeS / o.period;
    const v = new THREE.Vector3(Math.cos(a) * o.r, Math.sin(a) * Math.sin(o.inc) * o.r, Math.sin(a) * Math.cos(o.inc) * o.r);
    v.applyQuaternion(giant.group.quaternion);
    this.pos[0] = giant.pos[0] + v.x; this.pos[1] = giant.pos[1] + v.y; this.pos[2] = giant.pos[2] + v.z;
    this.quat.copy(giant.group.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + (this.def.spinOffset || 0)));
    this.group.quaternion.copy(this.quat);
  }
  update(frame, camera, sunDirW, sunColor, sunI, pixAngle, timeS) {
    this.frameNo++;
    const rel = frame.rel(this.pos);
    this.camL.set(-rel[0], -rel[1], -rel[2]).applyQuaternion(this.quat.clone().invert());
    for (const m of this.shown) m.visible = false;
    this.shown.length = 0;
    for (const r of this.roots) this._visit(r);
    if (this.frameNo % 60 === 0) for (const r of this.roots) this._evict(r);
    const u = this.uniforms;
    u.uSun.value.copy(sunDirW); u.uSunCol.value.copy(sunColor); u.uSunI.value = sunI; u.uPix.value = pixAngle; u.uT.value = timeS % 10000;
  }
  // altitude au-dessus du relief en un point du monde (mètres) : donnée de jeu pour les passages rasants
  altitudeAt(p) {
    const v = new THREE.Vector3(p[0] - this.pos[0], p[1] - this.pos[1], p[2] - this.pos[2]).applyQuaternion(this.quat.clone().invert());
    const r = v.length(); v.divideScalar(r);
    return r - (this.R + this.relief.heightAt(v.x, v.y, v.z));
  }
  // point de surface (monde) dans une direction locale donnée
  surfacePoint(dirL, alt = 0, out = new Float64Array(3)) {
    const d = new THREE.Vector3(...dirL).normalize(), h = this.relief.heightAt(d.x, d.y, d.z);
    d.applyQuaternion(this.quat).multiplyScalar(this.R + h + alt);
    out[0] = this.pos[0] + d.x; out[1] = this.pos[1] + d.y; out[2] = this.pos[2] + d.z; return out;
  }
}
