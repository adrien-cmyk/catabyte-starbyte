// AsteroidField — rendu du champ d'astéroïdes par instanciation GPU.
// 16 formes de base × 3 niveaux de détail (≈ 1 280 / 320 / 80 triangles) générées par asteroidData.js ; chaque rocher
// est une instance (position, taille, échelle non uniforme, axe et vitesse de rotation, teinte). La rotation est
// calculée dans le vertex shader : aucun coût CPU par image et par rocher.
// Le champ est découpé en cellules par niveau d'échelle (gros rochers visibles de loin, petits seulement de près).
// Chaque cellule choisit son niveau de détail selon la taille à l'écran de ses rochers ; au-delà, les rochers
// deviennent des points éclairés (imposteurs), puis disparaissent. Seules les cellules proches de la caméra existent.
// Origine flottante : les instances sont écrites relativement à une ancre (float64) recalée quand la caméra s'éloigne.
import { THREE } from '../lib/sb3d-shim.js';
import { NOISE } from '../core/glsl.js';
import { AsteroidFieldData, buildShape } from './asteroidData.js';

const ROT = /* glsl */`vec3 rotK(vec3 v, vec3 k, float a){ float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }`;
const ROCK_VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec4 iPos, iRot, iShape, iLook;
uniform float uTime;
varying vec3 vN, vPosW, vObj; varying vec4 vLook; varying float vR;
${ROT}
void main(){
  float a = iShape.w + iRot.w * uTime;
  vec3 p = rotK(position * iShape.xyz, iRot.xyz, a);
  vec3 n = rotK(normalize(normal / iShape.xyz), iRot.xyz, a);
  vec4 w = modelMatrix * vec4(iPos.xyz + p * iPos.w, 1.0);
  vPosW = w.xyz; vN = n; vObj = position * 2.5 + iShape.w; vLook = iLook; vR = iPos.w;
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}`;
const ROCK_FRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
${NOISE}
uniform vec3 uSun, uSunCol; uniform float uSunI;
varying vec3 vN, vPosW, vObj; varying vec4 vLook; varying float vR;
void main(){
  #include <logdepthbuf_fragment>
  // rugosité et petits cratères par perturbation de normale (relief en fraction du rayon)
  float hs = (fbm(vObj * 3.0, 5) - 0.5) * vR * 0.06 + (1.0 - abs(vnoise(vObj * 9.0) * 2.0 - 1.0)) * vR * 0.012;
  vec3 N = normalize(vN);
  vec3 dpx = dFdx(vPosW), dpy = dFdy(vPosW);
  vec3 r1 = cross(dpy, N), r2 = cross(N, dpx); float det = dot(dpx, r1);
  if (abs(det) > 1e-14) N = normalize(abs(det) * N - sign(det) * (dFdx(hs) * r1 + dFdy(hs) * r2));
  vec3 L = normalize(uSun), V = normalize(-vPosW);
  float mu0 = max(dot(N, L), 0.0), mu = max(dot(N, V), 0.0);
  float ls = mu0 / (mu0 + mu + 1e-4);
  float f = mix(mu0, ls * 1.5, 0.5);
  vec3 alb = vLook.rgb * (0.82 + 0.36 * fbm(vObj * 1.7 + 4.0, 3));
  vec3 col = alb * f * uSunCol * uSunI;
  if (vLook.w > 0.5){ vec3 H = normalize(L + V); col += uSunCol * uSunI * 0.25 * pow(max(dot(N, H), 0.0), 40.0) * mu0; }
  col += alb * 0.003;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const DOT_VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec4 iPos; attribute vec3 iCol;
uniform vec3 uSun; uniform float uProj, uSunI, uDotK;
varying vec3 vC; varying float vA;
void main(){
  vec4 w = modelMatrix * vec4(iPos.xyz, 1.0);
  float d = length(w.xyz), px = 2.0 * iPos.w / d * uProj;
  gl_PointSize = clamp(px, 1.0, 5.0);
  float ph = 0.5 + 0.5 * dot(normalize(-w.xyz), normalize(uSun));     // fraction éclairée vue d'ici
  vC = iCol * ph * uSunI * uDotK; vA = clamp(px * 1.6, 0.3, 1.0);
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}`;
const DOT_FRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vC; varying float vA;
void main(){
  #include <logdepthbuf_fragment>
  float r = length(gl_PointCoord - 0.5) * 2.0; if (r > 1.0) discard;
  gl_FragColor = vec4(vC * vA, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const LOD_SUB = [3, 2, 0];                  // 1 280 / 320 / 20 triangles (le dernier : rochers de quelques pixels)
const PX = [42, 11, 2.6, 0.45];             // seuils de taille à l'écran (px) : LOD0, LOD1, LOD2, imposteur

class Bucket {
  constructor(base, material, cap = 2048) {
    this.base = base; this.cap = 0; this.n = 0;
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = base.index; this.geo.setAttribute('position', base.attributes.position); this.geo.setAttribute('normal', base.attributes.normal);
    this.mesh = new THREE.Mesh(this.geo, material); this.mesh.frustumCulled = false;
    this._alloc(cap);
  }
  _alloc(cap) {
    this.cap = cap;
    for (const k of ['iPos', 'iRot', 'iShape', 'iLook']) {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); a.setUsage(THREE.DynamicDrawUsage);
      this.geo.setAttribute(k, a);
    }
  }
  begin() { this.n = 0; }
  push(px, py, pz, q) {
    if (this.n >= this.cap) { const old = ['iPos', 'iRot', 'iShape', 'iLook'].map((k) => this.geo.attributes[k].array); this._alloc(this.cap * 2); ['iPos', 'iRot', 'iShape', 'iLook'].forEach((k, i) => this.geo.attributes[k].array.set(old[i])); }
    const i = this.n++ * 4, A = this.geo.attributes;
    A.iPos.array.set([px, py, pz, q.r], i);
    A.iRot.array.set([q.axis[0], q.axis[1], q.axis[2], q.speed], i);
    A.iShape.array.set([q.ns[0], q.ns[1], q.ns[2], q.phase], i);
    A.iLook.array.set([q.tint[0], q.tint[1], q.tint[2], q.metal], i);
  }
  end() {
    this.geo.instanceCount = this.n; this.mesh.visible = this.n > 0;
    for (const k of ['iPos', 'iRot', 'iShape', 'iLook']) { const a = this.geo.attributes[k]; a.clearUpdateRanges(); a.addUpdateRange(0, this.n * 4); a.needsUpdate = true; }
  }
}

export class AsteroidField {
  // def : voir AsteroidFieldData ; center en Float64Array (monde)
  // options : data = autre source de rochers (même interface, ex. fragments d'anneaux) ; frame = quaternion
  // repère local → monde (les cellules et les rochers sont alors exprimés dans ce repère, ex. plan des anneaux)
  constructor(def, { quality = 0, data = null, frame = null, dotGain = 2.2 } = {}) {
    this.data = data || new AsteroidFieldData(def);
    this.frame = frame; this._q = new THREE.Quaternion(); this._v = new THREE.Vector3();
    this.center = Float64Array.from(def.center);
    this.anchor = Float64Array.from(def.center);
    this.group = new THREE.Group();
    this.quality = quality;
    this.nShapes = quality >= 2 ? 8 : 16;
    this.PX = PX.slice(); this.keep = 1;          // réglables à chaud (LodManager)
    this.triCap = Infinity; this.pxScale = 1; this.keepK = 1;      // plafond de triangles : les seuils de détail se relèvent au-delà
    this.uniforms = { uSun: { value: new THREE.Vector3(1, 0, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uSunI: { value: 1.7 }, uTime: { value: 0 } };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: ROCK_VERT, fragmentShader: ROCK_FRAG });
    this.buckets = LOD_SUB.map((sub) => Array.from({ length: this.nShapes }, (_, k) => {
      const s = buildShape(k, sub), g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(s.pos, 3)); g.setIndex(new THREE.BufferAttribute(s.idx, 1)); g.computeVertexNormals();
      const b = new Bucket(g, mat, sub === 3 ? 512 : 2048); this.group.add(b.mesh); return b;
    }));
    // imposteurs
    this.dotU = { uSun: this.uniforms.uSun, uSunI: this.uniforms.uSunI, uProj: { value: 800 }, uDotK: { value: dotGain } };   // gain des imposteurs : compense le manque de taille apparente
    this.dotGeo = new THREE.BufferGeometry(); this.dotCap = 0; this._dotAlloc(32768);
    this.dots = new THREE.Points(this.dotGeo, new THREE.ShaderMaterial({ uniforms: this.dotU, vertexShader: DOT_VERT, fragmentShader: DOT_FRAG }));
    this.dots.frustumCulled = false; this.group.add(this.dots);
    this.cells = new Map(); this.dirty = true; this.sinceBuild = 99; this.frameNo = 0;
    this.stats = { cells: 0, rocks: 0, dots: 0 };
  }
  // niveau de détail (LodManager) : seuils de taille à l'écran et fraction de rochers gardés
  setLod(b) { this.PX = b.rockPx.slice(); this.keep = b.rockKeep; this.triCap = b.tris * (b.rockShare || 0.5); this.pxScale = 1; this.keepK = 1; for (const c of this.cells.values()) c.lod = -2; this.dirty = true; }
  _regrade() { for (const c of this.cells.values()) c.lod = -2; this.dirty = true; }
  _dotAlloc(cap) {
    this.dotCap = cap;
    this.dotGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * 3), 3));   // inutilisé (three l'exige)
    this.dotGeo.setAttribute('iPos', new THREE.BufferAttribute(new Float32Array(cap * 4), 4));
    this.dotGeo.setAttribute('iCol', new THREE.BufferAttribute(new Float32Array(cap * 3), 3));
  }
  update(frame, camera, sunDirW, sunColor, sunI, pixAngle, timeS) {
    this.frameNo++; this.sinceBuild++;
    const u = this.uniforms;
    u.uSun.value.copy(sunDirW); u.uSunCol.value.copy(sunColor); u.uSunI.value = sunI; u.uTime.value = timeS % 1e6;
    this.dotU.uProj.value = 1 / pixAngle;
    const cam = frame.cam, C = this.center;
    let pc = [cam[0] - C[0], cam[1] - C[1], cam[2] - C[2]];
    if (this.frame) { this._v.set(...pc).applyQuaternion(this._q.copy(this.frame).invert()); pc = [this._v.x, this._v.y, this._v.z]; }
    // ancre : on la recale quand la caméra s'en éloigne (précision float32 des instances)
    if (Math.hypot(cam[0] - this.anchor[0], cam[1] - this.anchor[1], cam[2] - this.anchor[2]) > 2e5) { this.anchor.set(cam); this.dirty = true; }
    // cellules actives et niveau de détail de chacune
    const E = this.data.def.extent, ext = Math.max(...E) * 1.2, rc = Math.hypot(...pc);
    const seen = new Set();
    this.data.levels.forEach((L, k) => {
      if (rc > ext + L.D) return;
      const s = L.s, n = Math.ceil(L.D / s);
      const bx = Math.floor(pc[0] / s), by = Math.floor(pc[1] / s), bz = Math.floor(pc[2] / s);
      for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) for (let l = -n; l <= n; l++) {
        const ix = bx + i, iy = by + j, iz = bz + l;
        const dx = (ix + 0.5) * s - pc[0], dy = (iy + 0.5) * s - pc[1], dz = (iz + 0.5) * s - pc[2];
        const d = Math.max(Math.hypot(dx, dy, dz) - s * 0.87, L.r);
        if (d > L.D) continue;
        const px = (L.r * 1.6 / d) / pixAngle;
        const T = this.PX, ks = this.pxScale, lod = px > T[0] * ks ? 0 : px > T[1] * ks ? 1 : px > T[2] * ks ? 2 : px > T[3] ? 3 : 4;
        if (lod === 4) continue;
        const key = k + ':' + ix + ':' + iy + ':' + iz;
        let c = this.cells.get(key);
        if (!c) { c = { rocks: this.data.rocksInCell(k, ix, iy, iz), lod: -1 }; this.cells.set(key, c); this.dirty = true; }
        if (c.lod !== lod) { c.lod = lod; this.dirty = true; }
        c.used = this.frameNo; seen.add(key);
      }
    });
    for (const [key, c] of this.cells) if (!seen.has(key)) { if (c.lod !== -1) { c.lod = -1; this.dirty = true; } if (this.frameNo - c.used > 300) this.cells.delete(key); }
    // le détail est choisi rocher par rocher dans les cellules proches : on reconstruit quand la caméra a bougé
    this._pc = pc; this._pix = pixAngle;
    const lp = this._lastPc, minR = this.data.levels[this.data.levels.length - 1].r;
    if (!lp || Math.hypot(pc[0] - lp[0], pc[1] - lp[1], pc[2] - lp[2]) > minR * 25) this.dirty = true;
    if (this.dirty && this.sinceBuild >= 4) { this._lastPc = pc.slice(); this._rebuild(); }
  }
  _rebuild() {
    this.dirty = false; this.sinceBuild = 0;
    const A = this.anchor, C = this.center, ox = C[0] - A[0], oy = C[1] - A[1], oz = C[2] - A[2];
    const F = this.frame, v = this._v;
    const W = F ? (q) => { v.set(q.x, q.y, q.z).applyQuaternion(F); return v; } : (q) => v.set(q.x, q.y, q.z);
    for (const lv of this.buckets) for (const b of lv) b.begin();
    let nd = 0, nr = 0, ncell = 0;
    const P = this.dotGeo.attributes.iPos, K = this.dotGeo.attributes.iCol;
    for (const c of this.cells.values()) {
      if (c.lod < 0 || !c.rocks.length) continue;
      ncell++;
      if (c.lod === 3) {
        for (let qi = 0; qi < c.rocks.length; qi++) {
          const q = c.rocks[qi]; if ((qi * 0.618034) % 1 >= this.keep * this.keepK) continue;
          if (nd >= this.dotCap) break;
          const w = W(q); P.array.set([w.x + ox, w.y + oy, w.z + oz, q.r], nd * 4); K.array.set(q.tint, nd * 3); nd++;
        }
      } else {
        // détail propre à chaque rocher (jamais plus fin que celui de sa cellule), d'après sa vraie distance
        const pc = this._pc, T = this.PX, ks = this.pxScale, pix = this._pix;
        for (let qi = 0; qi < c.rocks.length; qi++) {
          const q = c.rocks[qi]; if ((qi * 0.618034) % 1 >= this.keep * this.keepK) continue;
          const px = q.r * 1.6 / Math.max(Math.hypot(q.x - pc[0], q.y - pc[1], q.z - pc[2]), q.r) / pix;
          const l = Math.max(c.lod, px > T[0] * ks ? 0 : px > T[1] * ks ? 1 : px > T[2] * ks ? 2 : 3);
          const w = W(q);
          if (l === 3) { if (nd < this.dotCap) { P.array.set([w.x + ox, w.y + oy, w.z + oz, q.r], nd * 4); K.array.set(q.tint, nd * 3); nd++; } continue; }
          this.buckets[l][q.shape % this.nShapes].push(w.x + ox, w.y + oy, w.z + oz, q); nr++;
        }
      }
    }
    for (const lv of this.buckets) for (const b of lv) b.end();
    this.dotGeo.setDrawRange(0, nd); P.needsUpdate = true; K.needsUpdate = true;
    if (nd >= this.dotCap && this.dotCap < 262144) { this._dotAlloc(this.dotCap * 2); this.dirty = true; }   // réserve de points saturée : on l'agrandit
    // budget de triangles (≈ 1 280 / 320 / 20 par rocher selon le niveau) : si on dépasse, les seuils de taille à
    // l'écran montent (moins de rochers au détail fin) ; si on est très en dessous, ils redescendent (hystérésis)
    const tris = this.buckets.reduce((a, lv, l) => a + lv.reduce((x, bk) => x + bk.n, 0) * [1280, 320, 20][l], 0);
    // seuils au maximum et toujours trop : on éclaircit les rochers (jusqu'à 25 %), puis on rend la densité en premier
    if (tris > this.triCap) {
      if (this.pxScale < 12) this.pxScale *= 1.3; else if (this.keepK > 0.25) this.keepK = Math.max(0.25, this.keepK * 0.8);
      this._regrade();
    } else if (tris < this.triCap * 0.4) {
      if (this.keepK < 1) { this.keepK = Math.min(1, this.keepK * 1.1); this._regrade(); }
      else if (this.pxScale > 1) { this.pxScale = Math.max(1, this.pxScale / 1.12); this._regrade(); }
    }
    this.stats = { cells: ncell, rocks: nr, dots: nd, tris, pxScale: +this.pxScale.toFixed(2), keep: +(this.keep * this.keepK).toFixed(2) };
  }
}
