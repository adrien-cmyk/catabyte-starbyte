// Racer — racer témoin : frégate SR-01 du jeu (68 m, sb_sr01_lod.glb), panaches de propulsion et traînée énergétique.
// Panaches : méthode des fiches 3D du jeu (ship3d.js) — couches coniques additives (halo, gaine, corps, cœur),
// turbulence et diamants de choc — portée en profondeur logarithmique, longueur et éclat suivant la poussée.
// Traînée : historique des positions du monde (float64), ruban face caméra recalculé relativement à la caméra.
// Les effets sont des fonctions réutilisables par les autres racers (createPlume, Trail).
import { SB3D, THREE } from '../lib/sb3d-shim.js';

// profil de la SR-01 (repère glTF : proue vers +z à z = 35, tuyères à z = −34,4)
export const SR01 = {
  url: new URL('../assets/sb_sr01_lod.glb', import.meta.url).href,
  length: 68,
  nozzles: [{ x: -2.3, y: 4.4, z: -34.4, r: 1.6 }, { x: 2.3, y: 4.4, z: -34.4, r: 1.6 }],
  plume: [0x2a5cff, 0x3f86ff, 0x86c0ff, 0xe6f3ff, 0x9ccaff],   // halo, gaine, corps, cœur, lueur (couleurs du jeu)
  engine: [0.5, 0.78, 1.0],
};

const PLUME_VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;
const PLUME_FRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime, uAlpha, uFlick, uLayer, uThrottle; uniform vec3 uColor; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
float hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hh(i), hh(i + vec2(1, 0)), f.x), mix(hh(i + vec2(0, 1)), hh(i + vec2(1, 1)), f.x), f.y); }
void main(){
  #include <logdepthbuf_fragment>
  float t = vUv.y;                                            // 1 = sortie de tuyère, 0 = bout du panache
  float along = pow(t, 1.25 + uLayer * 0.9) * smoothstep(0.0, 0.12, t);
  float core = pow(abs(dot(normalize(vN), normalize(vV))), 1.2 + uLayer);
  vec2 q = vec2(vUv.x * 6.0, vUv.y * 9.0 - uTime * 7.0);
  float turb = 0.72 + 0.28 * vn(q) * uFlick + 0.12 * vn(q * 2.7 + 5.0);
  float diamonds = 0.78 + 0.22 * pow(0.5 + 0.5 * sin(t * 46.0 - uTime * 3.0), 3.0) * (1.0 - uLayer * 0.6) * smoothstep(0.35, 0.9, t);
  float a = uAlpha * along * core * turb * diamonds * (0.35 + 0.65 * uThrottle);
  vec3 c = mix(uColor * vec3(0.75, 0.8, 1.15), uColor, t);
  gl_FragColor = vec4(c * a * 2.2, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// panache réutilisable : un groupe à placer à la sortie d'une tuyère (axe −z)
export function createPlume(R, colors) {
  const g = new THREE.Group(), mats = [];
  for (const [len, rIn, rOut, color, alpha, flick, layer] of [
    [R * 40, R * 0.86, R * 0.2, colors[0], 0.16, 1.0, 1.0],
    [R * 28, R * 0.74, R * 0.1, colors[1], 0.3, 1.0, 0.7],
    [R * 16, R * 0.58, R * 0.05, colors[2], 0.42, 0.8, 0.4],
    [R * 7, R * 0.4, R * 0.03, colors[3], 0.55, 0.4, 0.0],
  ]) {
    const geo = new THREE.CylinderGeometry(rIn, rOut, len, 40, 1, true);
    geo.rotateX(Math.PI / 2); geo.translate(0, 0, -len / 2);
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uAlpha: { value: alpha }, uFlick: { value: flick }, uLayer: { value: layer }, uThrottle: { value: 1 } },
      vertexShader: PLUME_VERT, fragmentShader: PLUME_FRAG,
    });
    mats.push(m); const mesh = new THREE.Mesh(geo, m); mesh.renderOrder = 3; g.add(mesh);
  }
  return {
    group: g,
    update(t, throttle) {
      g.scale.set(1, 1, 0.45 + 0.55 * throttle);                // le panache s'allonge avec la poussée
      for (const m of mats) { m.uniforms.uTime.value = t; m.uniforms.uThrottle.value = throttle; }
    },
  };
}

// traînée énergétique : ruban face caméra le long des dernières positions du monde (float64)
export class Trail {
  constructor({ points = 160, width = 6, color = 0x6fa8ff, life = 40 } = {}) {
    this.N = points; this.life = life; this.width = width;
    this.hist = [];                                     // { p: [x,y,z] float64, t }
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(points * 2 * 3); this.age = new Float32Array(points * 2); this.side = new Float32Array(points * 2);
    for (let i = 0; i < points; i++) { this.side[i * 2] = -1; this.side[i * 2 + 1] = 1; }
    const idx = []; for (let i = 0; i < points - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAge', new THREE.BufferAttribute(this.age, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSide', new THREE.BufferAttribute(this.side, 1));
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(color) } },
      vertexShader: /* glsl */`
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute float aAge, aSide; varying float vAge, vSide;
        void main(){ vAge = aAge; vSide = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */`
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform vec3 uColor; varying float vAge, vSide;
        void main(){
          #include <logdepthbuf_fragment>
          float a = pow(1.0 - clamp(vAge, 0.0, 1.0), 2.2) * (1.0 - vSide * vSide) * smoothstep(0.0, 0.03, vAge);
          gl_FragColor = vec4(uColor * a * 0.9, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 2;
  }
  reset() { this.hist.length = 0; }
  push(p, t) {
    const h = this.hist, last = h[h.length - 1];
    if (last && t - last.t < this.life / this.N) { last.p = [p[0], p[1], p[2]]; last.t2 = t; return; }
    h.push({ p: [p[0], p[1], p[2]], t });
    while (h.length > this.N) h.shift();
  }
  // cam : position float64 de la caméra ; head : position actuelle (la traînée part des tuyères)
  update(cam, now) {
    const h = this.hist, n = h.length, P = this.pos, A = this.age;
    const rel = (q) => [q[0] - cam[0], q[1] - cam[1], q[2] - cam[2]];
    for (let i = 0; i < this.N; i++) {
      const k = Math.max(0, n - 1 - i), e = h[k];
      if (!e) { P.fill(0); A.fill(2); break; }
      const a = rel(e.p), b = rel(h[Math.max(0, k - 1)].p), c = rel(h[Math.min(n - 1, k + 1)].p);
      // direction du ruban : tangente × direction de vue, largeur qui s'évase avec l'âge
      const tx = c[0] - b[0], ty = c[1] - b[1], tz = c[2] - b[2];
      let sx = ty * a[2] - tz * a[1], sy = tz * a[0] - tx * a[2], sz = tx * a[1] - ty * a[0];
      const sl = Math.hypot(sx, sy, sz) || 1, age = (now - e.t) / this.life;
      const w = this.width * (1 + age * 5) / sl;
      sx *= w; sy *= w; sz *= w;
      P.set([a[0] - sx, a[1] - sy, a[2] - sz, a[0] + sx, a[1] + sy, a[2] + sz], i * 6);
      A[i * 2] = A[i * 2 + 1] = i >= n ? 2 : age;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.attributes.aAge.needsUpdate = true;
    this.mesh.position.set(0, 0, 0);
  }
}

export class Racer {
  constructor(profile = SR01) {
    this.P = profile; this.pos = new Float64Array(3); this.vel = new Float64Array(3); this.throttle = 1;
    this.group = new THREE.Group();                     // placé par WorldFrame ; orienté selon la vitesse
    this.ready = false;
    this.plumes = profile.nozzles.map((nz) => { const p = createPlume(nz.r, profile.plume); p.group.position.set(nz.x, nz.y, nz.z); this.group.add(p.group); return p; });
    this.trail = new Trail({ color: profile.plume[1] });
    this._q = new THREE.Quaternion(); this._m = new THREE.Matrix4();
    new SB3D.GLTFLoader().load(profile.url, (gltf) => {
      const m = gltf.scene;
      m.traverse((o) => {
        if (!o.isMesh) return;
        const mat = o.material;
        if (/GLOW_MOTEUR/.test(mat.name)) { mat.emissive.setRGB(...profile.engine); mat.emissiveIntensity = 6; }
        else if (/GLOW|NAV/.test(mat.name)) { mat.emissiveIntensity = Math.max(mat.emissiveIntensity || 1, 2.5); }
        else { mat.envMapIntensity = 0.35; }
      });
      this.group.add(m); this.model = m; this.ready = true;
    }, undefined, (e) => console.warn('[racer] modèle', e));
  }
  // orientation : proue (+z) le long de la vitesse, ventre vers le bas du plan (up = y monde)
  orient() {
    const v = this.vel, l = Math.hypot(v[0], v[1], v[2]);
    if (l < 1e-6) return;
    const f = new THREE.Vector3(v[0] / l, v[1] / l, v[2] / l);
    this._m.lookAt(new THREE.Vector3(), f.clone().negate(), new THREE.Vector3(0, 1, 0));   // lookAt vise −z : on inverse
    this._q.setFromRotationMatrix(this._m);
    this.group.quaternion.copy(this._q);
  }
  update(frame, timeS, realT) {
    this.orient();
    for (const p of this.plumes) p.update(realT, this.throttle);
    this.trail.push(this.pos, timeS);
    this.trail.update(frame.cam, timeS);
  }
}
