// TrajectoryHolo — trajectoire holographique : un trait fin de largeur constante à l'écran, tracé sur les échantillons
// float64 de l'intégration (Gravity.propagate), plus des repères discrets : graduations de temps, périapse, traversées
// du plan des anneaux. Direction artistique : interface précise, pas de néon décoratif — partie à venir nette, partie
// parcourue estompée, rien de plus.
import { THREE } from '../lib/sb3d-shim.js';

const LINE_VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aSide, aT; attribute vec3 aNext;
uniform float uNow, uSpan, uPx; uniform vec2 uRes;
varying float vSide, vAhead; varying vec3 vMV;
// ligne écran : on projette le point et son voisin, puis on décale perpendiculairement de uPx pixels
void main(){ vSide = aSide; vAhead = (aT - uNow) / uSpan;
  vec4 mv = modelViewMatrix * vec4(position, 1.0), mn = modelViewMatrix * vec4(aNext, 1.0);
  // découpage au plan proche : un sommet derrière la caméra glisse vers son voisin (sinon la projection s'inverse)
  if (mv.z > -1.0) {
    if (mn.z > -1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    mv = mix(mv, mn, (-1.0 - mv.z) / (mn.z - mv.z));
  }
  if (mn.z > -1.0) mn = mix(mn, mv, (-1.0 - mn.z) / (mv.z - mn.z));
  vMV = mv.xyz;
  vec4 c0 = projectionMatrix * mv, c1 = projectionMatrix * mn;
  vec2 s0 = c0.xy / max(abs(c0.w), 1e-6) * uRes, s1 = c1.xy / max(abs(c1.w), 1e-6) * uRes;
  vec2 d = s1 - s0; d = length(d) > 1e-6 ? normalize(d) : vec2(1.0, 0.0);
  c0.xy += vec2(-d.y, d.x) * aSide * uPx / uRes * c0.w;
  gl_Position = c0;
  #include <logdepthbuf_vertex>
}`;
const LINE_FRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uCol, uPast; uniform float uNear, uOpacity; varying float vSide, vAhead; varying vec3 vMV;
void main(){
  #include <logdepthbuf_fragment>
  float edge = 1.0 - smoothstep(0.55, 1.0, abs(vSide));         // trait net, bords adoucis
  float ahead = step(0.0, vAhead);
  float a = ahead * mix(0.85, 0.25, clamp(vAhead, 0.0, 1.0)) + (1.0 - ahead) * 0.22 * exp(vAhead * 3.0);
  vec3 c = mix(uPast, uCol, ahead);
  a *= smoothstep(0.5 * uNear, uNear, length(vMV)) * uOpacity;                  // de près, la traînée du racer prend le relais
  gl_FragColor = vec4(c * a * edge, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const MARK_VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aKind, aT; uniform float uNow; varying float vKind, vAhead;
void main(){ vKind = aKind; vAhead = aT - uNow;
  gl_PointSize = aKind > 0.5 ? 9.0 : 4.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;
const MARK_FRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uCol, uWarn; varying float vKind, vAhead;
void main(){
  #include <logdepthbuf_fragment>
  vec2 q = abs(gl_PointCoord - 0.5) * 2.0;
  float a;
  if (vKind > 1.5) a = step(max(q.x, q.y), 1.0) * (1.0 - step(max(q.x, q.y), 0.55));     // carré creux : anneaux
  else if (vKind > 0.5) a = step(q.x + q.y, 1.0) * (1.0 - step(q.x + q.y, 0.55));       // losange creux : périapse
  else a = step(length(q), 1.0) * 0.8;                                                  // graduation
  a *= vAhead >= 0.0 ? 1.0 : 0.3;
  vec3 c = vKind > 1.5 ? uWarn : uCol;
  gl_FragColor = vec4(c * a, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class TrajectoryHolo {
  constructor({ maxPoints = 900, color = 0x9fe6ff, past = 0x4f7f9a, warn = 0xffb46a } = {}) {
    this.M = maxPoints;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(maxPoints * 2 * 3); this.side = new Float32Array(maxPoints * 2); this.tt = new Float32Array(maxPoints * 2);
    for (let i = 0; i < maxPoints; i++) { this.side[i * 2] = -1; this.side[i * 2 + 1] = 1; }
    const idx = []; for (let i = 0; i < maxPoints - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSide', new THREE.BufferAttribute(this.side, 1));
    g.setAttribute('aT', new THREE.BufferAttribute(this.tt, 1));
    this.nxt = new Float32Array(maxPoints * 2 * 3);
    g.setAttribute('aNext', new THREE.BufferAttribute(this.nxt, 3).setUsage(THREE.DynamicDrawUsage));
    this.u = { uCol: { value: new THREE.Color(color) }, uPast: { value: new THREE.Color(past) }, uNow: { value: 0 }, uSpan: { value: 3600 }, uWarn: { value: new THREE.Color(warn) }, uNear: { value: 3e4 }, uOpacity: { value: 1 }, uPx: { value: 1.3 }, uRes: { value: new THREE.Vector2(640, 360) } };
    this.line = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.line.frustumCulled = false; this.line.renderOrder = 4;
    this.marks = new THREE.Points(new THREE.BufferGeometry(), new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: MARK_VERT, fragmentShader: MARK_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.marks.frustumCulled = false; this.marks.renderOrder = 4;
    this.group = new THREE.Group(); this.group.add(this.line, this.marks);
    this.pts = []; this.markData = [];
  }
  // samples : sortie de Gravity.propagate ; ringPlane : { center, normal, inner, outer } (m) pour repérer les traversées
  setPath(samples, { tickEvery = 600, ringPlane = null, raw = false } = {}) {
    // sous-échantillonnage : on garde les points là où la direction tourne (périapse dense, croisière clairsemée)
    const S = samples, keep = [S[0]];
    let last = S[0];
    for (let i = 1; i < S.length - 1; i++) {
      const s = S[i], dt = s.t - last.t;
      const dv = Math.hypot(s.v[0] - last.v[0], s.v[1] - last.v[1], s.v[2] - last.v[2]) / Math.max(Math.hypot(...last.v), 1);
      if (dv > 0.012 || dt > 900) { keep.push(s); last = s; }
    }
    keep.push(S[S.length - 1]);
    const src = raw ? S : keep, step = Math.ceil(src.length / this.M);           // raw : points déjà répartis par l'appelant
    this.pts = src.filter((_, i) => i % step === 0 || i === src.length - 1).slice(0, this.M);
    this.u.uSpan.value = Math.max(3600, (S[S.length - 1].t - S[0].t) * 0.25);
    // repères : graduations, périapse, traversées du plan des anneaux (dans l'anneau = carré orange)
    const M = []; let next = Math.ceil(S[0].t / tickEvery) * tickEvery, rmin = Infinity, ip = 0;
    for (let i = 1; i < S.length; i++) {
      const s = S[i];
      if (s.t >= next) { M.push({ p: s.p, t: s.t, k: 0 }); next += tickEvery; }
      if (ringPlane) {
        const d0 = dotRel(S[i - 1].p, ringPlane), d1 = dotRel(s.p, ringPlane);
        if (d0 * d1 < 0) {
          const f = d0 / (d0 - d1), p = [0, 1, 2].map((c) => S[i - 1].p[c] + (s.p[c] - S[i - 1].p[c]) * f);
          const r = Math.hypot(p[0] - ringPlane.center[0], p[1] - ringPlane.center[1], p[2] - ringPlane.center[2]);
          M.push({ p, t: S[i - 1].t + (s.t - S[i - 1].t) * f, k: r > ringPlane.inner && r < ringPlane.outer ? 2 : 0, ring: r });   // instant interpolé
        }
      }
      if (ringPlane) { const r = Math.hypot(s.p[0] - ringPlane.center[0], s.p[1] - ringPlane.center[1], s.p[2] - ringPlane.center[2]); if (r < rmin) { rmin = r; ip = i; } }
    }
    if (ringPlane) M.push({ p: S[ip].p, t: S[ip].t, k: 1 });
    this.markData = M; this.periapsis = { t: S[ip].t, r: rmin };
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(M.length * 3), 3).setUsage(THREE.DynamicDrawUsage));
    mg.setAttribute('aKind', new THREE.BufferAttribute(Float32Array.from(M.map((m) => m.k)), 1));
    mg.setAttribute('aT', new THREE.BufferAttribute(Float32Array.from(M.map((m) => m.t)), 1));
    this.marks.geometry.dispose(); this.marks.geometry = mg;
  }
  // relatif caméra à chaque image (float64 → float32) ; la largeur en pixels est faite dans le vertex shader
  update(cam, now, pixAngle, px = 1.3, res = null) {
    const P = this.pos, X = this.nxt, T = this.tt, pts = this.pts, n = pts.length;
    this.u.uNow.value = now; this.u.uPx.value = px;
    if (res) this.u.uRes.value.set(res[0] / 2, res[1] / 2);
    for (let i = 0; i < Math.min(n, this.M); i++) {
      const s = pts[i], j = i < n - 1 ? i + 1 : i - 1, q = pts[j].p;
      const ax = s.p[0] - cam[0], ay = s.p[1] - cam[1], az = s.p[2] - cam[2];
      // voisin : pour le dernier point, on prolonge à l'opposé de l'avant-dernier (même direction)
      const bx = i < n - 1 ? q[0] - cam[0] : 2 * ax - (q[0] - cam[0]), by = i < n - 1 ? q[1] - cam[1] : 2 * ay - (q[1] - cam[1]), bz = i < n - 1 ? q[2] - cam[2] : 2 * az - (q[2] - cam[2]);
      P.set([ax, ay, az, ax, ay, az], i * 6); X.set([bx, by, bz, bx, by, bz], i * 6);
      T[i * 2] = T[i * 2 + 1] = s.t;
    }
    const g = this.line.geometry; g.attributes.position.needsUpdate = true; g.attributes.aT.needsUpdate = true; g.attributes.aNext.needsUpdate = true;
    g.setDrawRange(0, Math.max(0, (n - 1) * 6));
    const mp = this.marks.geometry.attributes.position;
    this.markData.forEach((m, i) => mp.array.set([m.p[0] - cam[0], m.p[1] - cam[1], m.p[2] - cam[2]], i * 3));
    mp.needsUpdate = true;
  }
}
function dotRel(p, pl) { return (p[0] - pl.center[0]) * pl.normal[0] + (p[1] - pl.center[1]) * pl.normal[1] + (p[2] - pl.center[2]) * pl.normal[2]; }
