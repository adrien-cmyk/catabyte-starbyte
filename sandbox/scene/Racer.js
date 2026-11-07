// Racer — racer témoin : frégate SR-01 du jeu (68 m, sb_sr01_lod.glb), panaches de propulsion et traînée énergétique.
// Panaches : méthode des fiches 3D du jeu (ship3d.js) — couches coniques additives (halo, gaine, corps, cœur),
// turbulence et diamants de choc — portée en profondeur logarithmique, longueur et éclat suivant la poussée.
// Traînée : historique des positions du monde (float64), ruban face caméra recalculé relativement à la caméra.
// Les effets sont des fonctions réutilisables par les autres racers (createPlume, Trail).
import { SB3D, THREE } from '../lib/sb3d-shim.js';

// profil de la SR-01 (repère glTF : proue vers +z à z = 35, tuyères à z = −34,4)
export const SR01 = {
  url: new URL('../assets/sb_sr01_lod.glb', import.meta.url).href,
  embedded: new URL('../assets/sb_sr01_lod.glb.js', import.meta.url).href,   // repli facultatif (non versionné)
  length: 68,
  nozzles: [{ x: -2.3, y: 4.4, z: -34.4, r: 1.6 }, { x: 2.3, y: 4.4, z: -34.4, r: 1.6 }],
  plume: [0x2a5cff, 0x3f86ff, 0x86c0ff, 0xe6f3ff, 0x9ccaff],   // halo, gaine, corps, cœur, lueur (couleurs du jeu)
  engine: [0.5, 0.78, 1.0],
};

const PLUME_VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vD;
void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vD = length(mv.xyz); gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;
const PLUME_FRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime, uAlpha, uFlick, uLayer, uThrottle, uNear; uniform vec3 uColor; varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vD;
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
  float a = uAlpha * along * core * turb * diamonds * (0.55 + 0.45 * uThrottle);   // en croisière aussi, le panache se voit
  a *= smoothstep(uNear * 0.35, uNear, vD);                  // caméra dans le panache : il s'efface au lieu de remplir l'écran
  vec3 c = mix(uColor * vec3(0.75, 0.8, 1.15), uColor, t);
  gl_FragColor = vec4(c * a * 2.3, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// couleurs d'un panache à la teinte de la livrée (couleur du tracé) : halo profond et saturé, gaine, corps clair,
// cœur presque blanc à peine teinté, lueur de tuyère
export function plumeColors(livery) {
  const c = new THREE.Color(livery), hsl = {}; c.getHSL(hsl);
  const at = (s, l) => new THREE.Color().setHSL(hsl.h, s, l).getHex();
  return [at(1, 0.42), at(1, 0.55), at(0.95, 0.72), new THREE.Color(0xffffff).lerp(new THREE.Color(livery), 0.14).getHex(), at(1, 0.68)];
}
let GLOW_TEX = null;
const glowTex = () => {
  if (GLOW_TEX) return GLOW_TEX;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,.55)'); gr.addColorStop(0.5, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128); GLOW_TEX = new THREE.CanvasTexture(cv); return GLOW_TEX;
};
// panache réutilisable : un groupe à placer à la sortie d'une tuyère (axe −z). Cinq gaines coniques additives (voile
// large, halo, gaine, corps, cœur blanc) et une lueur de tuyère qui palpite avec la poussée.
export function createPlume(R, colors) {
  const g = new THREE.Group(), mats = [];
  for (const [len, rIn, rOut, color, alpha, flick, layer] of [
    [R * 62, R * 1.5, R * 0.5, colors[0], 0.05, 1.0, 1.0],
    [R * 46, R * 0.95, R * 0.22, colors[0], 0.13, 1.0, 1.0],
    [R * 32, R * 0.78, R * 0.1, colors[1], 0.36, 1.0, 0.7],
    [R * 19, R * 0.6, R * 0.05, colors[2], 0.5, 0.8, 0.4],
    [R * 9, R * 0.42, R * 0.03, colors[3], 0.75, 0.4, 0.0],
  ]) {
    const geo = new THREE.CylinderGeometry(rIn, rOut, len, 40, 1, true);
    geo.rotateX(Math.PI / 2); geo.translate(0, 0, -len / 2);
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uAlpha: { value: alpha }, uFlick: { value: flick }, uLayer: { value: layer }, uThrottle: { value: 1 }, uNear: { value: R * 4 } },
      vertexShader: PLUME_VERT, fragmentShader: PLUME_FRAG,
    });
    m.userData.a0 = alpha; mats.push(m); const mesh = new THREE.Mesh(geo, m); mesh.renderOrder = 3; g.add(mesh);
  }
  // lueur de tuyère : un point chaud à la sortie (couleur de la livrée), blanc au centre
  const hot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(colors[4] ?? colors[2]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }));
  const hotC = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }));
  hot.renderOrder = hotC.renderOrder = 4; hot.position.z = hotC.position.z = -R * 0.4; g.add(hot, hotC);
  return {
    group: g,
    // dim : atténuation de l'éclat (vue de poursuite : le panache vu de l'arrière ne doit pas noyer la coque)
    update(t, throttle, boost = 1, dim = 1) {
      g.scale.set(1, 1, (0.6 + 0.4 * throttle) * boost);                  // le panache s'allonge avec la poussée
      for (const m of mats) { m.uniforms.uTime.value = t; m.uniforms.uThrottle.value = throttle; m.uniforms.uAlpha.value = m.userData.a0 * dim; }
      const fl = 1 + Math.sin(t * 37) * 0.05 + Math.sin(t * 59) * 0.04, k = (0.6 + 0.4 * throttle) * fl;   // lueur ronde : pas étirée par l'échelle du groupe
      const sz = 1 / Math.max(1e-3, g.scale.z);
      hot.scale.set(R * 11 * k, R * 11 * k, 1); hotC.scale.set(R * 3.4 * k, R * 3.4 * k, 1); hot.position.z = hotC.position.z = -R * 0.4 * sz;
      hot.material.opacity = 0.75 * dim; hotC.material.opacity = 0.85 * dim;
    },
  };
}

// traînée énergétique : ruban face caméra le long des dernières positions du monde (float64)
export class Trail {
  constructor({ points = 160, width = 6, color = 0x6fa8ff, life = 40 } = {}) {
    this.N = points; this.life = life; this.width = width;
    this.hist = [];                                     // { p: [x,y,z] float64, t }
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(points * 2 * 3); this.age = new Float32Array(points * 2); this.side = new Float32Array(points * 2); this.face = new Float32Array(points * 2).fill(1);
    for (let i = 0; i < points; i++) { this.side[i * 2] = -1; this.side[i * 2 + 1] = 1; }
    const idx = []; for (let i = 0; i < points - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAge', new THREE.BufferAttribute(this.age, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSide', new THREE.BufferAttribute(this.side, 1));
    g.setAttribute('aFace', new THREE.BufferAttribute(this.face, 1).setUsage(THREE.DynamicDrawUsage));   // ruban vu de face (1) ou en enfilade (0)
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(color) }, uGain: { value: 0.9 }, uNear: { value: 0 } },
      vertexShader: /* glsl */`
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute float aAge, aSide, aFace; varying float vAge, vSide, vD, vFace;
        void main(){ vAge = aAge; vSide = aSide; vFace = aFace; vD = length((modelViewMatrix * vec4(position, 1.0)).xyz); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */`
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform vec3 uColor; uniform float uGain, uNear; varying float vAge, vSide, vD, vFace;
        void main(){
          #include <logdepthbuf_fragment>
          float a = pow(1.0 - clamp(vAge, 0.0, 1.0), 2.2) * (1.0 - vSide * vSide) * smoothstep(0.0, 0.03, vAge);
          a *= smoothstep(uNear * 0.3, uNear, vD);                  // la caméra traverse la piste : le ruban s'efface près d'elle
          a *= smoothstep(0.12, 0.45, vFace);                        // vu en enfilade, le ruban se déploierait dans tout l'écran : il s'efface
          gl_FragColor = vec4(uColor * a * uGain, 1.0);
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
    const h = this.hist, n = h.length, P = this.pos, A = this.age, F = this.face;
    const rel = (q) => [q[0] - cam[0], q[1] - cam[1], q[2] - cam[2]];
    for (let i = 0; i < this.N; i++) {
      const k = Math.max(0, n - 1 - i), e = h[k];
      if (!e) { P.fill(0); A.fill(2); break; }
      const a = rel(e.p), b = rel(h[Math.max(0, k - 1)].p), c = rel(h[Math.min(n - 1, k + 1)].p);
      // direction du ruban : tangente × direction de vue, largeur qui s'évase avec l'âge
      const tx = c[0] - b[0], ty = c[1] - b[1], tz = c[2] - b[2];
      let sx = ty * a[2] - tz * a[1], sy = tz * a[0] - tx * a[2], sz = tx * a[1] - ty * a[0];
      const sl = Math.hypot(sx, sy, sz) || 1, age = (now - e.t) / this.life;
      F[i * 2] = F[i * 2 + 1] = sl / ((Math.hypot(tx, ty, tz) * Math.hypot(a[0], a[1], a[2])) || 1);   // sinus de l'angle tangente / regard
      const w = this.width * (1 + age * 5) / sl;
      sx *= w; sy *= w; sz *= w;
      P.set([a[0] - sx, a[1] - sy, a[2] - sz, a[0] + sx, a[1] + sy, a[2] + sz], i * 6);
      A[i * 2] = A[i * 2 + 1] = i >= n ? 2 : age;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.attributes.aAge.needsUpdate = true; this.mesh.geometry.attributes.aFace.needsUpdate = true;
    this.mesh.position.set(0, 0, 0);
  }
}

// modèles du Blackmarket : .glb.gz (le serveur peut l'avoir déjà décompressé : on teste la signature gzip)
async function gunzipIf(ab) {
  const raw = new Uint8Array(ab);
  if (raw[0] !== 0x1f || raw[1] !== 0x8b) return ab;
  return new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

export class Racer {
  // opts : livery (couleur de course : traînée, balise)
  constructor(profile = SR01, { livery = null } = {}) {
    this.P = profile; this.pos = new Float64Array(3); this.vel = new Float64Array(3); this.throttle = 1;
    this.group = new THREE.Group();                     // placé par WorldFrame ; orienté selon la vitesse
    this.ready = false;
    const plume = livery ? plumeColors(livery) : profile.plume;      // panaches à la teinte du tracé du racer
    this.plumes = profile.nozzles.map((nz) => { const p = createPlume(nz.r, plume); p.group.position.set(nz.x, nz.y, nz.z); this.group.add(p.group); return p; });
    const rMax = Math.max(...profile.nozzles.map((n) => n.r));
    this.livery = livery;
    this.trail = new Trail({ color: livery || profile.plume[1], width: Math.max(6, rMax * 3.5) });   // à l'échelle du vaisseau
    this._q = new THREE.Quaternion(); this._m = new THREE.Matrix4();
    const onModel = (gltf) => {
      const m = gltf.scene;
      m.traverse((o) => {
        if (!o.isMesh) return;
        const mat = o.material;
        if (profile.tint && profile.tint[mat.name]) { mat.color = new THREE.Color(profile.tint[mat.name]); }   // livrée de course
        if (/GLOW_MOTEUR/.test(mat.name)) { if (livery) mat.emissive.set(plume[4]); else mat.emissive.setRGB(...profile.engine); mat.emissiveIntensity = 6; }
        else if (/NAV/.test(mat.name)) { mat.emissiveIntensity = 1.2; }                  // feux de navigation discrets
        else if (/GLOW/.test(mat.name)) { mat.emissiveIntensity = 1.8; }
        else { mat.envMapIntensity = 0.6; }
      });
      let meshes = 0, tris = 0; m.traverse((o) => { if (o.isMesh) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
      this.stats = { meshes, tris: Math.round(tris) };
      this.group.add(m); this.model = m; this.ready = true;
    };
    // le .glb d'abord (labo, jeu) ; à défaut, la même donnée embarquée en base64 dans un module JS (pages qui ne
    // servent pas les .glb, comme une page Claude) : profile.embedded = chemin de ce module
    const loader = new SB3D.GLTFLoader();
    const fallback = (e) => {
      if (!profile.embedded) return console.warn('[racer] modèle', e);
      import(profile.embedded).then(({ default: b64 }) => gunzipIf(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer))
        .then((buf) => loader.parse(buf, '', onModel, (e2) => console.warn('[racer] modèle embarqué', e2)))
        .catch((e2) => console.warn('[racer] modèle', e, e2));
    };
    fetch(profile.url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status))).then(gunzipIf)
      .then((buf) => loader.parse(buf, '', onModel, fallback)).catch(fallback);
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
  // mode piste (course) : la traînée vit en temps d'écran (quelques secondes, quelle que soit l'accélération du temps),
  // plus large et plus vive, et le panache s'allonge ; hors course, traînée en temps simulé comme avant
  setPiste(on, { life = 7, width = null, gain = 1.6, boost = 2.2 } = {}) {
    if (!!on === !!this.piste) return;
    this.piste = on ? { life, boost } : null;
    const T = this.trail;
    if (!this._trail0) this._trail0 = { life: T.life, width: T.width };
    T.life = on ? life : this._trail0.life; T.width = on ? (width || Math.max(this._trail0.width * 2, this.P.length * 0.12)) : this._trail0.width;
    T.mesh.material.uniforms.uGain.value = on ? gain : 0.9; T.reset();
    T.mesh.material.uniforms.uNear.value = on ? Math.max(40, this.P.length * 3, T.width * 6) : 0;   // près de la caméra (poursuite), le ruban s'efface
  }
  // détail selon la taille à l'écran (px de longueur) : en dessous de quelques pixels, la coque et les panaches ne se
  // voient plus — le point, l'étiquette et la piste lumineuse portent le racer. Économise appels et triangles.
  setScreenSize(px) {
    const hull = px > 2.5, plume = px > 1.2;
    if (this.model && this.model.visible !== hull) this.model.visible = hull;
    for (const p of this.plumes) if (p.group.visible !== plume) p.group.visible = plume;
  }
  update(frame, timeS, realT) {
    this.orient();
    const boost = this.piste ? this.piste.boost : 1;
    for (const p of this.plumes) p.update(realT, this.throttle, boost, this.dim ?? 1);
    const clock = this.piste ? realT : timeS;
    this.trail.push(this.pos, clock);
    this.trail.update(frame.cam, clock);
  }
}
