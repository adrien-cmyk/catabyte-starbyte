// Plans 3D du Télébyte (GDD_PLANS_3D) : le décor commun.
//   · vaisseaux de course à leurs VRAIES dimensions (1 unité = 1 m), modèles allégés (telebyte/plans3d/models), coques
//     vernies à arêtes franches, reflets de studio ;
//   · moteurs : flamme bleue à cœur blanc qui s'allonge avec la poussée, lumière bleue qui éclaire la coque ;
//   · propulseurs de manœuvre : brèves bouffées blanches sur les flancs, le dessus, le dessous ;
//   · environnement identifiable : la géante du système et ses anneaux à l'horizon (ciel à l'infini, calculé dans un
//     shader : aucune profondeur à gérer), débris d'anneau qui défilent (parallaxe, sensation de vitesse) ;
//   · volumes : boîtes des vaisseaux à chaque image (contrôle des distances, caméra jamais dans une coque).
//   const st = await createStage(canvas, { giant: 'amber' | 'blue' | 'black' })
//   const ship = await st.ship(racerId)      ship.userData : { len, half, thrust(v, t), puff(dir, k), clearPuffs() }
//   st.render(cam, { speed, dt }) ; st.resize(w, h) ; st.setPixelRatio(r) ; st.boxOf(ship) ; st.setGiant(type)
import { THREE, SB3D } from '../../sandbox/lib/sb3d-shim.js';
import { GIANTS } from '../../sandbox/presets/giants.js';

const [{ toCreasedNormals }, { RoomEnvironment }] = await Promise.all([
  import('three/addons/utils/BufferGeometryUtils.js'),
  import('three/addons/environments/RoomEnvironment.js'),
]);

// vaisseaux de course : modèle final de chaque racer
export const SHIPS = {
  sentinelle: { file: 'racer07_shot.glb.gz', name: 'Racer 07' },
  fulgurant: { file: 'fulgur07_shot.glb.gz', name: 'Fulgur 07' },
  mule: { file: 'bidon52_shot.glb.gz', name: 'Bidon 52' },
  cuirasse: { file: 'monoreactor88_shot.glb.gz', name: 'Monoreactor 88' },
};
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
const glowTexture = (inner = 0.25) => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(inner, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
};

const GLOW = /MOTEUR|GLOW|LUM|FEU|ECRAN|STROBE|NAV/i;
export const SUN_DIR = new THREE.Vector3(-0.55, 0.42, 0.72).normalize();   // étoile : rasante, de trois quarts avant

const SKY_FS = `varying vec3 vD; uniform vec3 uSun; uniform vec3 uPal[8]; uniform float uBands, uRing, uStorm, uGiant;
  vec3 pal(float t){ t = fract(t) * 8.0; float f = fract(t); vec3 a = uPal[0], b = uPal[1];
    for (int k = 0; k < 8; k++) { if (float(k) == floor(t)) { a = uPal[k]; b = uPal[k == 7 ? 0 : k + 1]; } } return mix(a, b, smoothstep(0.2, 0.8, f)); }
  void main(){
    vec3 d = normalize(vD);
    // la géante : sous l'horizon, devant à gauche (distances en rayons de la géante)
    vec3 P = normalize(vec3(-0.42, -0.5, 0.76)) * 2.05; float Rp = 1.0;   // grande : sa courbure occupe le bas du ciel
    vec3 axis = normalize(vec3(0.12, 1.0, 0.18));
    vec3 col = vec3(0.004, 0.005, 0.012) + vec3(0.02, 0.012, 0.03) * exp(-pow(d.y * 3.0 + 0.4, 2.0));
    float b = dot(d, P), c = dot(P, P) - Rp * Rp, disc = uGiant > 0.5 ? b * b - c : -1.0;
    float tPlanet = disc > 0.0 ? b - sqrt(disc) : 1e9;
    if (disc > 0.0) {
      vec3 n = normalize(d * tPlanet - P); float lat = dot(n, axis);
      float wav = sin(lat * 23.0 + 3.0 * sin(dot(n, vec3(1.0, 0.0, 0.3)) * 4.0)) * 0.03;
      vec3 base = pal(lat * uBands * 0.125 + 0.5 + wav);
      float ndl = dot(n, uSun), lit = smoothstep(-0.18, 0.55, ndl);
      float limb = pow(1.0 - max(0.0, dot(n, -d)), 3.0);
      col = base * (0.04 + 1.25 * lit) + vec3(0.45, 0.55, 0.8) * limb * 0.25 * smoothstep(-0.2, 0.3, ndl);
      float tr2 = dot(d * tPlanet - P, axis); col *= 1.0 - 0.35 * smoothstep(0.08, 0.0, abs(tr2 - 0.02));   // ombre des anneaux
    }
    // anneaux : plan équatorial de la géante, cachés par elle quand ils passent derrière
    float dn = dot(d, axis), tRing = abs(dn) > 1e-4 ? dot(P, axis) / dn : -1.0;
    if (uGiant > 0.5 && tRing > 0.0 && tRing < tPlanet) { vec3 q = d * tRing - P; float r = length(q) / Rp;
      if (r > 1.25 && r < 2.35) { float band = 0.55 + 0.45 * sin(r * 41.0) * sin(r * 13.0 + 1.3); float gap = smoothstep(1.62, 1.66, r) * (1.0 - smoothstep(1.72, 1.76, r));
        float a = (0.6 * band * (1.0 - gap * 0.85)) * uRing * smoothstep(1.25, 1.35, r) * (1.0 - smoothstep(2.2, 2.35, r));
        float lit = 0.4 + 0.6 * max(0.0, dot(normalize(q + axis * 0.2), uSun) * 0.5 + 0.5);
        col = mix(col, vec3(0.78, 0.70, 0.58) * lit, a); } }
    float edge = sqrt(max(0.0, dot(P, P) - b * b)); col += vec3(0.35, 0.45, 0.75) * 0.18 * exp(-pow((edge - Rp) * 18.0, 2.0)) * step(0.0, b);
    // tempête solaire : le ciel s'embrase du côté de l'étoile, voile orangé partout
    float sd = max(0.0, dot(d, uSun));
    col = mix(col, vec3(1.0, 0.5, 0.18) * (0.10 + 0.55 * pow(sd, 3.0)) + vec3(1.0, 0.85, 0.6) * pow(sd, 40.0), uStorm * 0.85);
    gl_FragColor = vec4(col, 1.0);
  }`;

export async function createStage(canvas, { giant = 'amber' } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010206);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.03).texture; pm.dispose();
  scene.environmentIntensity = 0.32;                            // reflets présents mais sombres : l'espace reste noir
  // lumière rasante de l'étoile, contre-jour froid ténu, et la géante qui renvoie un peu de sa couleur par en dessous
  const sun = new THREE.DirectionalLight(0xfff0dc, 3.2); sun.position.copy(SUN_DIR); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x9fb8ff, 0.9); rim.position.set(0.6, 0.1, -0.8); scene.add(rim);
  const bounce = new THREE.HemisphereLight(0x0b1020, 0x221810, 0.7); scene.add(bounce);

  // ciel à l'infini : étoiles, la géante du système (courbure, terminateur, limbe) et ses anneaux
  const sky = new THREE.Group(); scene.add(sky);
  const skyU = { uSun: { value: SUN_DIR }, uPal: { value: [] }, uBands: { value: 10 }, uRing: { value: 1 }, uStorm: { value: 0 }, uGiant: { value: 1 } };
  {
    const n = 2400, p = new Float32Array(n * 3), c = new Float32Array(n * 3); let s = 9; const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < n; i++) {
      const u = R() * 2 - 1, a = R() * Math.PI * 2, r = Math.sqrt(1 - u * u), d = 9000;
      p.set([Math.cos(a) * r * d, u * d, Math.sin(a) * r * d], i * 3);
      const w = 0.22 + Math.pow(R(), 6) * 1.5; c.set([w, w * 0.95, w * 0.9], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(9500, 48, 24), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false, uniforms: skyU,
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: SKY_FS }));
    dome.renderOrder = -3; sky.add(dome);
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.5, sizeAttenuation: false, vertexColors: true, depthWrite: false, depthTest: false })); stars.renderOrder = -2; sky.add(stars);
  }
  function setGiant(type) {
    const G = GIANTS[type] || GIANTS.amber, pal = G.palette.map((h) => new THREE.Color(h));
    while (pal.length < 8) pal.push(pal[pal.length - 1]);
    skyU.uPal.value = pal.slice(0, 8); skyU.uBands.value = G.bands || 10; skyU.uRing.value = G.ring ? 1 : 0.6;
    bounce.groundColor = new THREE.Color(G.palette[2]).multiplyScalar(0.3);
  }
  setGiant(giant);

  // débris d'anneau : roches basses en polygones, en instances, qui défilent autour de la caméra (parallaxe)
  const ROCKS = 200, rockGeo = new THREE.IcosahedronGeometry(1, 0), rockMat = new THREE.MeshStandardMaterial({ color: 0x8c8478, roughness: 0.9, metalness: 0.05, flatShading: true });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCKS); rocks.frustumCulled = false; scene.add(rocks);
  const rSeed = new Float32Array(ROCKS * 6); { let s = 5; const R = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let i = 0; i < ROCKS; i++) rSeed.set([R(), R(), R(), R(), R(), R()], i * 6); }
  const rM = new THREE.Matrix4(), rQ = new THREE.Quaternion(), rE = new THREE.Euler(), rP = new THREE.Vector3(), rS = new THREE.Vector3();
  let travel = 0, keep = [];
  function updateRocks(cam, dt, speed) {
    travel += speed * dt;
    const SPAN = 1800;                                            // profondeur de la boîte de débris (m), autour de la caméra
    for (let i = 0; i < ROCKS; i++) {
      const s = rSeed.subarray(i * 6, i * 6 + 6), ang = s[0] * 6.283, rad = 60 + Math.pow(s[1], 0.7) * 800;
      const z = ((s[2] * SPAN - travel) % SPAN + SPAN) % SPAN - SPAN * 0.4;
      rP.set(cam.position.x + Math.cos(ang) * rad, cam.position.y - 40 + Math.sin(ang) * rad * 0.3, cam.position.z + z);
      // aucun débris dans le volume des vaisseaux (ni près de la caméra)
      let ok = rP.distanceTo(cam.position) > 25; for (const b of keep) if (b.distanceToPoint(rP) < 20) ok = false;
      rE.set(s[3] * 6.28 + travel * 0.002 * s[4], s[4] * 6.28, s[5] * 6.28); rQ.setFromEuler(rE);
      const sc = ok ? 0.6 + Math.pow(s[5], 3) * 9 : 0; rS.set(sc, sc * (0.6 + s[3] * 0.6), sc * (0.7 + s[4] * 0.5));
      rM.compose(rP, rQ, rS); rocks.setMatrixAt(i, rM);
    }
    rocks.instanceMatrix.needsUpdate = true;
  }

  const loader = new SB3D.GLTFLoader(), cache = {}, creased = new WeakMap();
  const tGlow = glowTexture(0.25), tCore = glowTexture(0.55);

  // un vaisseau à ses vraies dimensions, proue +z ; ses moteurs et ses propulseurs de manœuvre
  async function ship(id) {
    const def = SHIPS[id]; if (!def) throw new Error('vaisseau inconnu ' + id);
    if (!cache[id]) cache[id] = fetchModel(def.file).then((buf) => new Promise((ok, ko) => loader.parse(buf, '', ok, ko)));
    const gltf = await cache[id];
    const root = gltf.scene.clone(true);
    const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    const engMeshes = [], hullMats = [], glowMats = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      let cg = creased.get(o.geometry); if (!cg) { cg = toCreasedNormals(o.geometry, THREE.MathUtils.degToRad(32)); cg.computeBoundingBox(); creased.set(o.geometry, cg); } o.geometry = cg;
      const m0 = o.material, glow = GLOW.test(m0.name);
      if (/MOTEUR/i.test(m0.name)) engMeshes.push(o);
      o.material = new THREE.MeshPhysicalMaterial({
        name: m0.name, color: m0.color, map: m0.map || null, emissive: m0.emissive, emissiveMap: m0.emissiveMap || null,
        emissiveIntensity: glow ? Math.max(2, (m0.emissiveIntensity || 1) * 2.2) : (m0.emissiveIntensity || 1),
        metalness: m0.metalness, roughness: glow ? m0.roughness : Math.min(0.34, m0.roughness),
        clearcoat: glow ? 0 : 0.9, clearcoatRoughness: 0.12, envMapIntensity: 1.4, transparent: m0.transparent, opacity: m0.opacity,
      });
      (glow ? glowMats : hullMats).push(o.material);
    });
    for (const m of glowMats) m.userData.base = m.emissiveIntensity;
    const g = new THREE.Group(); root.position.copy(ctr).negate(); g.add(root);
    // tuyères : centre et rayon des maillages « moteur » (une flamme par tuyère, au plus 4)
    const nozzles = [];
    for (const o of engMeshes) {
      const b = new THREE.Box3().setFromObject(o).translate(ctr.clone().negate());
      const c = b.getCenter(new THREE.Vector3()), r = Math.max(0.4, Math.max(b.max.x - b.min.x, b.max.y - b.min.y) * 0.5);
      nozzles.push({ c, r });
    }
    if (!nozzles.length) nozzles.push({ c: new THREE.Vector3(0, 0, -size.z / 2), r: Math.max(0.6, size.x * 0.12) });
    // une « tuyère » trop large (plusieurs moteurs dans un seul maillage) : deux flammes, à gauche et à droite
    const noz = nozzles.slice(0, 4).flatMap((n) => (n.r > size.x * 0.3 ? [-1, 1].map((sx) => ({ c: n.c.clone().add(new THREE.Vector3(sx * n.r * 0.5, 0, 0)), r: n.r * 0.45 })) : [n]));
    const engines = noz.map((n) => {
      const grp = new THREE.Group(); grp.position.copy(n.c); grp.position.z = Math.min(n.c.z, -size.z * 0.42); g.add(grp);
      const outer = [], core = [];
      for (let i = 0; i < 7; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tGlow, color: new THREE.Color().setHSL(0.6, 1, 0.55 + i * 0.02), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 - i * 0.09 }));
        grp.add(sp); outer.push(sp);
      }
      for (let i = 0; i < 3; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tCore, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.95 })); grp.add(sp); core.push(sp); }
      return { grp, outer, core, r: n.r };
    });
    // lumière bleue des moteurs : la coque (et l'autre vaisseau, s'il est proche) en reçoit les reflets
    const eLight = new THREE.PointLight(0x5c8cff, 0, size.z * 2.4, 1.6); eLight.position.set(0, 0, -size.z * 0.62); g.add(eLight);
    // propulseurs de manœuvre : flancs, dessus, dessous (avant et arrière), bouffées brèves
    const H = { x: size.x / 2, y: size.y / 2, z: size.z / 2 }, puffs = [];
    const anchor = { left: [-1, 0, 0], right: [1, 0, 0], up: [0, 1, 0], down: [0, -1, 0], front: [0, 0, 1] };
    for (const [k, v] of Object.entries(anchor)) for (const zf of (k === 'front' ? [0.5] : [-0.32, 0.36])) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tGlow, color: 0xeaf2ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      sp.position.set(v[0] * H.x * 0.98, v[1] * H.y * 0.95, k === 'front' ? H.z * 0.98 : zf * size.z); sp.userData = { dir: k }; g.add(sp); puffs.push(sp);
    }
    g.userData = {
      def, len: size.z, half: H,
      // poussée 0..1,4 : flamme plus longue, cœur blanc, lumière plus forte (légère pulsation)
      thrust(v, time = 0) {
        const fl = 1 + Math.sin(time * 41) * 0.04 + Math.sin(time * 67) * 0.03;
        for (const e of engines) {
          e.outer.forEach((sp, i) => { const L = e.r * (1.2 + v * 4.6) * fl; sp.position.z = -L * (0.12 + i * 0.16); sp.scale.setScalar(e.r * (2.6 - i * 0.24) * (0.8 + v * 0.35)); sp.material.opacity = (0.75 - i * 0.08) * Math.min(1, 0.35 + v * 0.7); });
          e.core.forEach((sp, i) => { sp.position.z = -e.r * (0.2 + i * 0.45) * (0.8 + v); sp.scale.setScalar(e.r * (1.5 - i * 0.3) * (0.7 + v * 0.5)); sp.material.opacity = Math.min(1, 0.2 + v * 0.75) * (1 - i * 0.2); });
        }
        eLight.intensity = v * v * Math.max(size.z, 40) * 26; eLight.distance = Math.max(size.z * 2.4, 60 + v * 90);   // à pleine poussée, la lueur porte loin
      },
      // bouffée d'un propulseur (dir : left | right | up | down) ; k : 0..1 (enveloppe donnée par le scénario)
      puff(dir, k) { for (const sp of puffs) if (sp.userData.dir === dir) { sp.material.opacity = k * 0.9; sp.scale.setScalar(Math.max(0.6, H.x * 0.35) * (0.6 + k * 1.6)); } },
      clearPuffs() { for (const sp of puffs) sp.material.opacity = 0; },
      // chaleur de coque 0..1 : la coque rougeoie (surchauffe, rentrée dans l'éruption)
      heat(k) { for (const m of hullMats) { m.emissive.setRGB(1.0, 0.18 + 0.22 * k, 0.04 * k); m.emissiveIntensity = k * k * 0.75; } },   // rouge sombre → orange : la coque reste lisible
      // feux de bord 0..1 : éclairages, écrans, moteurs « allumés » (panne, électronique grillée)
      lights(k) { for (const m of glowMats) m.emissiveIntensity = m.userData.base * k; },
      // points remarquables (repère du vaisseau) : tuyères, nez, flanc
      nozzles: engines.map((e) => e.grp.position.clone()), H,
    };
    g.userData.thrust(0.4);
    return g;
  }

  // ── effets des plans (tous éteints par défaut ; chaque scénario règle ce qu'il utilise, à chaque image) ──
  const fxs = {};
  // brouillard solaire : voile orangé (brouillard de la scène) et vent de particules venu de l'étoile
  scene.fog = new THREE.FogExp2(0xff8a3a, 0);
  {
    const N = 700, pos = new Float32Array(N * 3), seed = new Float32Array(N * 3); let q = 3; const R = () => (q = (q * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < N; i++) seed.set([R(), R(), R()], i * 3);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: tGlow, color: 0xffa050, size: 2.4, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false; scene.add(pts); let tr = 0;
    fxs.wind = { set(k, cam, dt) { pts.material.opacity = 0.7 * k; scene.fog.density = 0.0065 * k; skyU.uStorm.value = k; if (!k) return; tr += dt * 160;
      const w = SUN_DIR, B = 260; for (let i = 0; i < N; i++) { const a = seed[i * 3], b = seed[i * 3 + 1], c = seed[i * 3 + 2];
        const along = ((c * 2 * B + tr) % (2 * B)) - B; pos.set([cam.position.x + (a - 0.5) * 2 * B - w.x * along, cam.position.y + (b - 0.5) * B - w.y * along, cam.position.z + (a * b - 0.25) * 2 * B - w.z * along], i * 3); }
      geo.attributes.position.needsUpdate = true; } };
  }
  // étincelles : gerbes ponctuelles (contact, tuyère qui crachote, soudure)
  {
    const N = 260, pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), age = new Float32Array(N).fill(9); let nx = 0, q = 11; const R = () => (q = (q * 16807) % 2147483647) / 2147483647;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: tGlow, color: 0xffc070, size: 0.35, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false; scene.add(pts);
    fxs.sparks = {
      emit(p, n, speed = 20, dir = null, color = null) { if (color) pts.material.color.set(color); for (let k = 0; k < n; k++) { const i = nx++ % N; age[i] = 0; pos.set([p.x, p.y, p.z], i * 3);
        const v = [(R() - 0.5) * 2, (R() - 0.5) * 2, (R() - 0.5) * 2]; if (dir) { v[0] += dir.x * 2; v[1] += dir.y * 2; v[2] += dir.z * 2; } vel.set(v.map((c) => c * speed), i * 3); } },
      tick(dt) { for (let i = 0; i < N; i++) { age[i] += dt; if (age[i] > 0.7) { pos[i * 3 + 1] = 1e7; continue; } for (let k = 0; k < 3; k++) pos[i * 3 + k] += vel[i * 3 + k] * dt; } geo.attributes.position.needsUpdate = true; },
      size(s2) { pts.material.size = s2; },
    };
  }
  // éclair (contact, impact, ligne d'arrivée)
  { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tGlow, color: 0xfff2d8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); scene.add(sp);
    fxs.flash = { set(p, k, size = 20, color = 0xfff2d8) { sp.material.opacity = k; if (k > 0) { sp.position.copy(p); sp.scale.setScalar(size); sp.material.color.set(color); } } }; }
  // une roche (choc dans la ceinture) et des éclats
  { const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x8a8174, roughness: 0.92, flatShading: true })); rock.visible = false; scene.add(rock);
    const N = 40, chunks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x5a554e, roughness: 0.95, flatShading: true }), N); chunks.frustumCulled = false; scene.add(chunks);
    const cp = new Float32Array(N * 3), cv = new Float32Array(N * 3), ca = new Float32Array(N).fill(9); let q = 21; const R = () => (q = (q * 16807) % 2147483647) / 2147483647; const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E2 = new THREE.Euler();
    fxs.rock = { set(p, r, rot = 0) { rock.visible = !!p; if (p) { rock.position.copy(p); rock.scale.set(r, r * 0.8, r * 0.9); rock.rotation.set(rot, rot * 0.7, rot * 0.3); } },
      burst(p, n, speed, size) { for (let k = 0; k < n; k++) { const i = k % N; ca[i] = 0; cp.set([p.x, p.y, p.z], i * 3); cv.set([(R() - 0.5) * speed, (R() - 0.3) * speed, (R() - 0.5) * speed], i * 3); } this._s = size; },
      tick(dt) { for (let i = 0; i < N; i++) { ca[i] += dt; const live = ca[i] < 2.5; for (let k = 0; k < 3; k++) cp[i * 3 + k] += cv[i * 3 + k] * dt; E2.set(ca[i] * 3 + i, ca[i] * 2, i); Q.setFromEuler(E2); const sc = live ? (this._s || 0.5) * (0.4 + (i % 5) * 0.25) : 0;
        M.compose(new THREE.Vector3(cp[i * 3], cp[i * 3 + 1], cp[i * 3 + 2]), Q, new THREE.Vector3(sc, sc, sc)); chunks.setMatrixAt(i, M); } chunks.instanceMatrix.needsUpdate = true; } };
    fxs.rock.burst(new THREE.Vector3(0, 1e7, 0), 0, 0, 0); for (let i = 0; i < N; i++) ca[i] = 9; }
  // une lune proche (passage rasant) : sphère cratérisée, éclairée par l'étoile
  { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.ShaderMaterial({ uniforms: { uSun: { value: SUN_DIR }, uTint: { value: new THREE.Color(0x9a948a) } },
      vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vN; varying vec3 vP; uniform vec3 uSun; uniform vec3 uTint;
        vec3 h3(vec3 p){ p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6))); return fract(sin(p) * 43758.5453); }
        float crater(vec3 p, float sc){ vec3 g = floor(p * sc), f = fract(p * sc); float c = 0.0; for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) { vec3 o = vec3(x, y, z), r = h3(g + o); float d = length(o + r * 0.8 - f); float rad = 0.25 + r.x * 0.3; c += smoothstep(rad, rad * 0.6, d) * 0.6 - smoothstep(rad * 1.15, rad, d) * smoothstep(rad * 0.95, rad * 1.05, d) * 0.5; } return c; }
        void main(){ vec3 n = normalize(vN); float k = crater(vP, 6.0) * 0.6 + crater(vP, 17.0) * 0.4 + crater(vP, 41.0) * 0.25 + crater(vP, 420.0) * 0.35 + crater(vP, 1600.0) * 0.3;   // petits cratères visibles au ras du sol
          float lit = max(0.0, dot(n, uSun)); vec3 col = uTint * (0.75 - k * 0.35) * (0.03 + 1.1 * lit); gl_FragColor = vec4(col, 1.0); }` }));
    m.visible = false; scene.add(m);
    fxs.moon = { set(c, r) { m.visible = !!c; if (c) { m.position.copy(c); m.scale.setScalar(r); } } }; }
  // porte d'arrivée : deux balises et un anneau de lumière
  { const grp = new THREE.Group(); grp.visible = false; scene.add(grp);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 8, 96), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.85 })); grp.add(ring);
    const beacons = [-1, 1].map((sx) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tGlow, color: 0xffd27a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sp.position.set(sx, 0, 0); sp.scale.setScalar(0.25); grp.add(sp); return sp; });
    fxs.gate = { set(c, r, k = 1) { grp.visible = !!c; if (c) { grp.position.copy(c); grp.scale.setScalar(r); ring.material.opacity = 0.5 + 0.4 * k; for (const b of beacons) b.material.opacity = 0.6 + 0.4 * k; } } }; }
  fxs.rocks = (on) => { rocks.visible = on; };
  fxs.giant = (on) => { skyU.uGiant.value = on ? 1 : 0; };
  fxs.reset = () => { fxs.wind.set(0); fxs.flash.set(null, 0); fxs.rock.set(null); fxs.moon.set(null); fxs.gate.set(null); fxs.rocks(true); fxs.giant(true); };

  return {
    renderer, scene, ship, setGiant, fx: fxs,
    // boîte d'un vaisseau dans le monde (contrôle des distances) ; prudente : englobe les rotations
    boxOf(s) { s.updateMatrixWorld(true); const h = s.userData.half, b = new THREE.Box3(new THREE.Vector3(-h.x, -h.y, -h.z), new THREE.Vector3(h.x, h.y, h.z)); return b.applyMatrix4(s.matrixWorld); },
    render(cam, { speed = 0, dt = 0, avoid = [] } = {}) {
      sky.position.copy(cam.position);                      // le ciel est à l'infini
      keep = avoid; if (rocks.visible) updateRocks(cam, dt, speed); fxs.sparks.tick(dt); fxs.rock.tick(dt);
      renderer.render(scene, cam);
    },
    resize(w, h) { renderer.setSize(w, h, false); },
    setPixelRatio(r) { renderer.setPixelRatio(r); },
    dispose() { renderer.dispose(); },
  };
}
