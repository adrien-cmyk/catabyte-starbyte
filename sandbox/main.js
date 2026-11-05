// La Grande Fronde — Race World Visual Sandbox (Phase 1, étapes 1 à 7 du plan technique).
// Assemble : renderer à profondeur logarithmique, origine flottante, ciel cuit, étoile, géante gazeuse + anneaux, trois lunes,
// caméra libre à zoom logarithmique, post-traitement (bloom), panneau de réglages, vues des tests visuels.
import { SB3D, THREE, qualityLevel } from './lib/sb3d-shim.js';
import { WorldFrame, AU, fmtDist } from './core/WorldFrame.js';
import { GasGiant } from './bodies/GasGiant.js';
import { RingSystem } from './bodies/RingSystem.js';
import { Star, STAR_TYPES } from './bodies/Star.js';
import { bakeBackdrop } from './scene/Backdrop.js';
import { FreeCamera } from './camera/FreeCamera.js';
import { GIANTS } from './presets/giants.js';
import { Moon, PatchPool } from './bodies/Moon.js';
import { sandboxMoons } from './presets/moons.js';

const Q = qualityLevel();
const host = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: Q < 2, logarithmicDepthBuffer: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, [2, 1.25, 1, 0.75][Q]));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 1e13);
const frame = new WorldFrame();
scene.background = bakeBackdrop(renderer, { quality: Q });

/* ── système de la sandbox : géante au centre, étoile jaune à 5,2 UA ── */
const SUN_DIR = new THREE.Vector3(-0.82, 0.12, -0.56).normalize();
const star = new Star(STAR_TYPES.yellow);
star.pos.set([SUN_DIR.x * 5.2 * AU, SUN_DIR.y * 5.2 * AU, SUN_DIR.z * 5.2 * AU]);
frame.add(star.group, star.pos);
scene.add(star.group);
const sunLight = new THREE.DirectionalLight(star.color, 3.0);   // pour les objets PBR (racer, astéroïdes : étapes suivantes)
scene.add(sunLight, sunLight.target);

let giant = null, giantKey = null;
function setGiant(key) {
  if (giant) { scene.remove(giant.group); frame.remove(giant.group); giant.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
  const p = GIANTS[key]; giantKey = key;
  const ring = p.ring ? new RingSystem({ seed: 'ring-' + key, palette: key }) : null;
  giant = new GasGiant(p, { seed: key, quality: Q, ring });
  frame.add(giant.group, giant.pos);
  scene.add(giant.group);
  targets.giant = { pos: giant.pos, minDist: giant.R * 1.0015, label: p.name };
  // point d'observation dans les anneaux, sur la face éclairée, rayon 1,8 R (anneau principal)
  const a = Math.atan2(SUN_DIR.z, SUN_DIR.x) + 0.9, rr = 1.8 * giant.R, m = giant.group.matrixWorld;
  const v = new THREE.Vector3(Math.cos(a) * rr, 0, Math.sin(a) * rr).applyMatrix4(new THREE.Matrix4().extractRotation(m));
  targets.rings = { pos: Float64Array.from([v.x, v.y, v.z]), minDist: 50, label: 'Anneaux' };
  if (cam.target) cam.setTarget(targets[curTarget] || targets.giant);
}

/* ── caméra ── */
const cam = new FreeCamera(camera, renderer.domElement);
const targets = { star: { pos: star.pos, minDist: star.R * 1.6, label: star.type.name } };
let curTarget = 'giant';
setGiant('amber');

/* ── lunes : relief construit dans des Web Workers partagés ── */
const pool = new PatchPool();
const moons = sandboxMoons(GIANTS.amber.radius).map((def) => {
  const m = new Moon(def, { quality: Q, pool });
  frame.add(m.group, m.pos); scene.add(m.group);
  targets['moon:' + def.id] = { pos: m.pos, minDist: def.radius * 1.006, label: def.name };
  return m;
});
const moonById = Object.fromEntries(moons.map((m) => [m.def.id, m]));
// passage rasant : point de surface fixe dans le repère de la lune, choisi avec le soleil à ~10° sur l'horizon
let graze = null;
function setGraze(id, sunElev = 0.17) {
  const m = moonById[id];
  m.place(giant, simT);
  const sun = new THREE.Vector3(star.pos[0] - m.pos[0], star.pos[1] - m.pos[1], star.pos[2] - m.pos[2]).normalize();
  const perp = new THREE.Vector3(0, 1, 0).addScaledVector(sun, -sun.y).normalize();
  const w = perp.multiplyScalar(Math.cos(sunElev)).addScaledVector(sun, Math.sin(sunElev)).normalize();
  const dirL = w.applyQuaternion(m.quat.clone().invert()).toArray();
  graze = { moon: m, dirL, target: { pos: new Float64Array(3), minDist: 150, label: m.def.name + ' · rasant' } };
  m.surfacePoint(dirL, 0, graze.target.pos);
  return { target: graze.target, sunYawM: Math.atan2(sun.x, sun.z) };
}

// vues des tests visuels du brief (§4) — les tests avec racer / lunes / astéroïdes arrivent aux étapes 7 à 13
const sunYaw = Math.atan2(SUN_DIR.x, SUN_DIR.z);
const VIEWS = {
  system: () => cam.setTarget(targets.giant, { dist: 2.2e9, yaw: sunYaw + 0.9, pitch: 0.32 }),
  giant: () => cam.setTarget(targets.giant, { dist: giant.R * 3.4, yaw: sunYaw + 1.05, pitch: 0.14 }),
  limb: () => { // point du limbe supérieur vu de côté : horizon courbe en bas de l'image, espace au-dessus
    const yaw = sunYaw + 1.2, d = [Math.sin(yaw), 0, Math.cos(yaw)];
    targets.limb = { pos: Float64Array.from([giant.pos[0], giant.pos[1] + giant.R * 1.004, giant.pos[2]]), minDist: 1e3, label: 'Limbe' };
    cam.setTarget(targets.limb, { dist: giant.R * 0.32, yaw, pitch: 0.06 }); },
  night: () => cam.setTarget(targets.giant, { dist: giant.R * 2.2, yaw: sunYaw + 2.6, pitch: 0.22 }),
  backlit: () => cam.setTarget(targets.giant, { dist: giant.R * 4.5, yaw: sunYaw + Math.PI - 0.12, pitch: 0.08 }),
  rings: () => cam.setTarget(targets.rings, { dist: giant.R * 0.6, yaw: sunYaw + 0.4, pitch: 0.35 }),
  ringskim: () => cam.setTarget(targets.rings, { dist: 3e6, yaw: sunYaw + 1.2, pitch: 0.06 }),
  star: () => cam.setTarget(targets.star, { dist: star.R * 6, yaw: sunYaw + Math.PI + 0.6, pitch: 0.1 }),
  // une lune devant la géante, toutes deux éclairées de trois quarts : on avance le temps jusqu'à ce que Kesh passe
  // côté soleil (décalée de 0,5 rad), puis la caméra se place au-delà de la lune, le soleil dans le dos
  moons: () => { graze = null; const m = moonById.kesh, o = m.def.orbit;
    const sL = SUN_DIR.clone().applyQuaternion(giant.group.quaternion.clone().invert());
    const aStar = Math.atan2(sL.z, sL.x) + 0.5;
    simT = (((aStar - o.phase) / (2 * Math.PI)) % 1 + 1) % 1 * o.period;
    m.place(giant, simT);
    const yaw = Math.atan2(m.pos[0] - giant.pos[0], m.pos[2] - giant.pos[2]);
    cam.setTarget(targets['moon:kesh'], { dist: m.R * 7, yaw: yaw + 0.22, pitch: 0.05 }); },
};
for (const m of sandboxMoons(GIANTS.amber.radius)) {
  VIEWS[m.id] = () => { graze = null; cam.setTarget(targets['moon:' + m.id], { dist: m.radius * 2.6, yaw: sunYaw + 1.3, pitch: 0.18 }); };
  // test n° 3 : survol à ~2,5 km, regard le long de l'horizon, lumière rasante de trois quarts
  VIEWS['graze-' + m.id] = () => { const g = setGraze(m.id); cam.setTarget(g.target, { dist: 24000, yaw: g.sunYawM + 2.3, pitch: 0.1 }); };
}
VIEWS.giant();

/* ── post-traitement : bloom réservé aux sources très lumineuses (étoile, moteurs) ── */
const composer = new SB3D.EffectComposer(renderer);
composer.addPass(new SB3D.RenderPass(scene, camera));
const bloom = new SB3D.UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.6, 0.92);
bloom.enabled = Q < 2;
composer.addPass(bloom);
composer.addPass(new SB3D.OutputPass());

function resize() {
  const w = host.clientWidth, h = host.clientHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h);
  camera.aspect = w / h; camera.fov = w / h < 0.8 ? 58 : 45; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

/* ── boucle ── */
let simT = 3 * 3600, timeScale = 240, last = performance.now(), fpsAcc = 0, fpsN = 0, fps = 0;
const sunDirAtGiant = new THREE.Vector3();
function step(dt) {
  simT += dt * timeScale;
  for (const m of moons) m.place(giant, simT);
  if (graze) graze.moon.surfacePoint(graze.dirL, 0, graze.target.pos);
  cam.update(dt);
  frame.cam.set(cam.pos);
  frame.update();
  sunDirAtGiant.set(star.pos[0] - giant.pos[0], star.pos[1] - giant.pos[1], star.pos[2] - giant.pos[2]).normalize();
  giant.update(frame, simT, sunDirAtGiant, star.color, 1.7 * star.type.intensity);
  star.update(frame, simT, camera);
  const pix = THREE.MathUtils.degToRad(camera.fov) / renderer.domElement.height;
  for (const m of moons) {
    const sd = new THREE.Vector3(star.pos[0] - m.pos[0], star.pos[1] - m.pos[1], star.pos[2] - m.pos[2]).normalize();
    m.update(frame, camera, sd, star.color, 1.7 * star.type.intensity, pix, simT);
  }
  pool.pump();
  sunLight.position.copy(sunDirAtGiant).multiplyScalar(1000); sunLight.target.position.set(0, 0, 0);
}
function render() { composer.render(); }
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  step(dt); render();
  fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; hud(); }
}
renderer.setAnimationLoop(loop);

/* ── panneau ── */
const $ = (id) => document.getElementById(id);
function hud() {
  const d = cam.distance, t = cam.target;
  let alt = t === targets.giant ? ' · altitude ' + fmtDist(d - giant.R) : '';
  if (graze && t === graze.target) alt = ' · altitude ' + fmtDist(graze.moon.altitudeAt(cam.pos));
  $('readout').textContent = `${fps.toFixed(0)} i/s · ${t ? t.label : ''} · distance ${fmtDist(d)}${alt} · ×${timeScale}`;
}
$('giant').onchange = (e) => { setGiant(e.target.value); };
$('view-sel').onchange = (e) => { const v = e.target.value; curTarget = v.startsWith('ring') ? 'rings' : v === 'star' ? 'star' : moonById[v] ? 'moon:' + v : 'giant'; if (!v.startsWith('graze')) graze = null; VIEWS[v](); };
$('target').onchange = (e) => { curTarget = e.target.value; graze = null;
  const m = curTarget.startsWith('moon:') ? moonById[curTarget.slice(5)] : null;
  cam.setTarget(targets[curTarget], { dur: 3.2, dist: m ? m.R * 3 : curTarget === 'star' ? star.R * 8 : curTarget === 'rings' ? 2e7 : giant.R * 3 }); };
$('speed').oninput = (e) => { timeScale = Math.round(Math.pow(10, +e.target.value)); hud(); };
$('shot').onclick = () => { render(); const a = document.createElement('a'); a.download = `fronde_${giantKey}_${Date.now()}.png`; a.href = renderer.domElement.toDataURL('image/png'); a.click(); };

// accès de test (tools/fronde/shots.js) : rendu image par image, sans boucle
window.RW = {
  views: Object.keys(VIEWS), setView: (v) => { VIEWS[v](); }, setGiant, setTime: (t) => { simT = t; }, setTimeScale: (s) => { timeScale = s; },
  stop: () => renderer.setAnimationLoop(null),
  frames: (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) step(dt); render(); },
  info: () => ({ ...renderer.info.render, q: Q, dist: cam.distance, pending: pool.pending }),
  // attend que toutes les parcelles de relief demandées soient construites (captures)
  settle: async (maxMs = 60000) => {
    const t0 = performance.now(); let calm = 0;
    while (performance.now() - t0 < maxMs) {
      step(1 / 30);
      calm = pool.pending === 0 ? calm + 1 : 0;
      if (calm >= 3) break;
      await new Promise((r) => setTimeout(r, 40));
    }
    render();
  },
  altitude: () => (graze ? graze.moon.altitudeAt(cam.pos) : null),
  ready: true,
};
