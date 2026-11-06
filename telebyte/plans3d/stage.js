// Plans 3D du Télébyte (GDD_PLANS_3D) : le décor commun. Espace profond (jamais de planète : réservée à l'orbite),
// éclairage d'étoile et contre-jour, reflets de studio (PMREM) pour des coques brillantes, vaisseaux de course
// allégés (telebyte/plans3d/models, tools/fronde/make_shot_models.mjs), panaches, poussière de vitesse.
//   const st = await createStage(canvas)           une seule scène, réutilisée d'un plan à l'autre
//   const ship = await st.ship(racerId)              modèle (mis en cache), proue +z, longueur normalisée
//   st.render(camera) ; st.resize() ; st.dispose()
import { THREE, SB3D } from '../../sandbox/lib/sb3d-shim.js';

const [{ toCreasedNormals }, { RoomEnvironment }] = await Promise.all([
  import('three/addons/utils/BufferGeometryUtils.js'),
  import('three/addons/environments/RoomEnvironment.js'),
]);

// vaisseaux de course : modèle final de chaque racer, longueur réelle (m) → longueur à l'écran (normalisée)
export const SHIPS = {
  sentinelle: { file: 'racer07_shot.glb.gz', name: 'Racer 07' },
  fulgurant: { file: 'fulgur07_shot.glb.gz', name: 'Fulgur 07' },
  mule: { file: 'bidon52_shot.glb.gz', name: 'Bidon 52' },
  cuirasse: { file: 'monoreactor88_shot.glb.gz', name: 'Monoreactor 88' },
};
export const SHIP_LEN = 30;                                   // longueur commune à l'écran (unités de scène)
const BASE = window.FRONDE_PLANS3D_BASE || new URL('./models/', import.meta.url).href;

async function gunzipIf(ab) {
  const raw = new Uint8Array(ab);
  if (raw[0] !== 0x1f || raw[1] !== 0x8b) return ab;
  return new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}
// le .glb.gz d'abord ; à défaut (page qui ne sert pas les .gz, comme une page Claude), le même fichier en base64 dans
// un module JS voisin (nom.glb.gz.js, export default)
async function fetchModel(file) {
  try { const r = await fetch(BASE + file); if (!r.ok) throw new Error(r.status); return await gunzipIf(await r.arrayBuffer()); }
  catch (e) { const { default: b64 } = await import(BASE + file + '.js'); return gunzipIf(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer); }
}

const GLOW = /MOTEUR|GLOW|LUM|FEU|ECRAN|STROBE|NAV/i;
export async function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020308);
  // reflets : un studio (deux bandes lumineuses) vu depuis l'espace, assez sombre pour garder le noir profond
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.03).texture; pm.dispose();
  scene.environmentIntensity = 0.55;
  // étoile (lumière principale chaude) et contre-jour froid
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6); sun.position.set(-0.6, 0.55, 0.45); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x9fb8ff, 1.4); rim.position.set(0.7, 0.2, -0.8); scene.add(rim);
  scene.add(new THREE.AmbientLight(0x1a2030, 0.6));
  // ciel d'espace profond : étoiles lointaines (attachées à la caméra : à l'infini) et une nébuleuse en dégradé
  const sky = new THREE.Group(); scene.add(sky);
  {
    const n = 2600, p = new Float32Array(n * 3), c = new Float32Array(n * 3); let s = 9; const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < n; i++) {
      const u = R() * 2 - 1, a = R() * Math.PI * 2, r = Math.sqrt(1 - u * u), d = 4000;
      p.set([Math.cos(a) * r * d, u * d, Math.sin(a) * r * d], i * 3);
      const w = 0.25 + Math.pow(R(), 6) * 1.6, t = R(); c.set([w * (t < 0.3 ? 1 : 0.85), w * 0.92, w * (t > 0.7 ? 1 : 0.85)], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    sky.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false })));
    const neb = new THREE.Mesh(new THREE.SphereGeometry(4500, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vD;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
        void main(){ vec3 d = normalize(vD); float b = exp(-pow(d.y * 2.4 + 0.3 * d.x, 2.0));
          float k = n3(d * 3.0) * 0.6 + n3(d * 7.0) * 0.3 + n3(d * 15.0) * 0.1;
          vec3 col = mix(vec3(0.010, 0.012, 0.030), vec3(0.09, 0.05, 0.13), b * smoothstep(0.35, 0.9, k)) + vec3(0.05, 0.03, 0.02) * b * k * k;
          gl_FragColor = vec4(col, 1.0); }` }));
    neb.renderOrder = -2; sky.add(neb);
  }
  // poussière de vitesse : segments qui défilent autour de la caméra (donne la vitesse sans référence au sol)
  const DUST = 260, dPos = new Float32Array(DUST * 6), dSeed = new Float32Array(DUST * 3);
  { let s = 3; const R = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let i = 0; i < DUST; i++) dSeed.set([R() - 0.5, R() - 0.5, R()], i * 3); }
  const dGeo = new THREE.BufferGeometry(); dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  const dust = new THREE.LineSegments(dGeo, new THREE.LineBasicMaterial({ color: 0xbfd0e0, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  dust.frustumCulled = false; scene.add(dust);

  const loader = new SB3D.GLTFLoader(), cache = {}, creased = new WeakMap();   // normales recalculées une fois par modèle
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();

  // un vaisseau : modèle allégé, normales à arêtes franches, matériaux vernis, panache sur ses tuyères
  async function ship(id) {
    const def = SHIPS[id]; if (!def) throw new Error('vaisseau inconnu ' + id);
    if (!cache[id]) cache[id] = fetchModel(def.file).then((buf) => new Promise((ok, ko) => loader.parse(buf, '', ok, ko)));
    const gltf = await cache[id];
    const root = gltf.scene.clone(true);
    const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), k = SHIP_LEN / size.z;
    const engines = new THREE.Box3();
    root.traverse((o) => {
      if (!o.isMesh) return;
      let cg = creased.get(o.geometry); if (!cg) { cg = toCreasedNormals(o.geometry, THREE.MathUtils.degToRad(32)); creased.set(o.geometry, cg); } o.geometry = cg;
      const m0 = o.material, glow = GLOW.test(m0.name);
      if (/MOTEUR/i.test(m0.name)) engines.expandByObject(o);
      const m = new THREE.MeshPhysicalMaterial({
        name: m0.name, color: m0.color, map: m0.map || null, emissive: m0.emissive, emissiveMap: m0.emissiveMap || null,
        emissiveIntensity: glow ? Math.max(2, (m0.emissiveIntensity || 1) * 2.2) : (m0.emissiveIntensity || 1),
        metalness: m0.metalness, roughness: glow ? m0.roughness : Math.min(0.35, m0.roughness),
        clearcoat: glow ? 0 : 0.9, clearcoatRoughness: 0.1, envMapIntensity: 1.25, transparent: m0.transparent, opacity: m0.opacity,
      });
      o.material = m;
    });
    const g = new THREE.Group(); root.position.sub(box.getCenter(new THREE.Vector3())); g.add(root); g.scale.setScalar(k);
    // panache : sprites additifs derrière les tuyères (centre des matériaux moteur, ou l'arrière de la coque)
    const ec = engines.isEmpty() ? new THREE.Vector3(0, 0, box.min.z) : engines.getCenter(new THREE.Vector3());
    const plume = new THREE.Group(); plume.position.copy(ec);
    const er = engines.isEmpty() ? size.x * 0.15 : Math.max(engines.getSize(new THREE.Vector3()).x, engines.getSize(new THREE.Vector3()).y) * 0.5;
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: i < 2 ? 0xffffff : 0xffb070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 - i * 0.13 }));
      sp.position.z = -er * (0.2 + i * 0.9); sp.scale.setScalar(er * (2.4 - i * 0.25)); plume.add(sp);
    }
    root.add(plume);
    // halo de proue (approche à pleine vitesse : on voit d'abord une lumière qui grossit), éteint par défaut
    const bow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xcfe0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    bow.position.set((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.max.z); bow.scale.setScalar(size.x * 3); root.add(bow);
    g.userData = { def, plume, bow, k, half: { x: size.x * k / 2, y: size.y * k / 2 } };   // demi-gabarit à l'écran (frôlements)
    return g;
  }

  // effets du frôlement : éclair au point de passage, gerbe d'étincelles entre les coques
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff0d0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  flash.scale.setScalar(40); scene.add(flash);
  const NS = 140, sPos = new Float32Array(NS * 3), sVel = new Float32Array(NS * 3), sAge = new Float32Array(NS).fill(9);
  const sGeo = new THREE.BufferGeometry(); sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  const sparks = new THREE.Points(sGeo, new THREE.PointsMaterial({ color: 0xffc070, size: 2.2, sizeAttenuation: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sparks.frustumCulled = false; scene.add(sparks);
  let sSeed = 7, sNext = 0; const sR = () => (sSeed = (sSeed * 16807) % 2147483647) / 2147483647;
  function updateFx(fx, dt) {
    if (!fx) { flash.material.opacity = 0; sparks.visible = false; return; }
    flash.position.set(...fx.at); flash.material.opacity = fx.flash * 0.35; flash.scale.setScalar(5 + fx.flash * 9);
    sparks.visible = true;
    // émission proportionnelle à fx.sparks ; vie 0,6 s (temps du scénario) ; elles traînent vers l'arrière
    const emit = Math.round(fx.sparks * 900 * dt);
    for (let n = 0; n < emit; n++) { const i = sNext++ % NS; sAge[i] = 0; sPos.set([fx.at[0] + (sR() - 0.5) * 1.2, fx.at[1] + (sR() - 0.5) * 1.2, fx.at[2] + (sR() - 0.5) * 6], i * 3); sVel.set([(sR() - 0.5) * 30, (sR() - 0.3) * 24, -40 - sR() * 120], i * 3); }
    for (let i = 0; i < NS; i++) { sAge[i] += dt; if (sAge[i] > 0.6) { sPos[i * 3 + 1] = 1e6; continue; } for (let k = 0; k < 3; k++) sPos[i * 3 + k] += sVel[i * 3 + k] * dt; }
    sGeo.attributes.position.needsUpdate = true;
  }
  // poussière : en repère caméra, vitesse v (unités/s) le long de dir (monde)
  let dustT = 0;
  function updateDust(cam, dir, v, dt) {
    dustT += dt * v;
    const R = 120, L = Math.min(40, v * 0.05 + 2), b = new THREE.Vector3();
    for (let i = 0; i < DUST; i++) {
      const sx = dSeed[i * 3] * R * 2, sy = dSeed[i * 3 + 1] * R * 2, sz = ((dSeed[i * 3 + 2] * 2 * R - dustT) % (2 * R) + 2 * R) % (2 * R) - R;
      b.set(sx, sy, sz).add(cam.position);
      dPos.set([b.x, b.y, b.z, b.x - dir.x * L, b.y - dir.y * L, b.z - dir.z * L], i * 6);
    }
    dGeo.attributes.position.needsUpdate = true;
  }

  return {
    renderer, scene, ship,
    render(cam, { dir = new THREE.Vector3(0, 0, 1), speed = 0, dt = 0, fx = null, fxDt = 0 } = {}) {
      sky.position.copy(cam.position);                      // le ciel est à l'infini
      updateDust(cam, dir, speed, dt); updateFx(fx, fxDt);
      renderer.render(scene, cam);
    },
    resize(w, h) { renderer.setSize(w, h, false); },
    setPixelRatio(r) { renderer.setPixelRatio(r); },
    clear() { for (const o of [...scene.children]) if (o.userData && o.userData.def) scene.remove(o); },
    dispose() { renderer.dispose(); },
  };
}
