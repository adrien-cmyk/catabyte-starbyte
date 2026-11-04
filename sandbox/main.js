// La Grande Fronde — Race World Visual Sandbox (Phase 1, étapes 1 à 6 du plan technique).
// Assemble : renderer à profondeur logarithmique, origine flottante, ciel cuit, étoile, géante gazeuse + anneaux,
// caméra libre à zoom logarithmique, post-traitement (bloom), panneau de réglages, vues des tests visuels.
import { SB3D, THREE, qualityLevel } from './lib/sb3d-shim.js';
import { WorldFrame, AU, fmtDist } from './core/WorldFrame.js';
import { GasGiant } from './bodies/GasGiant.js';
import { RingSystem } from './bodies/RingSystem.js';
import { Star, STAR_TYPES } from './bodies/Star.js';
import { bakeBackdrop } from './scene/Backdrop.js';
import { FreeCamera } from './camera/FreeCamera.js';
import { GIANTS } from './presets/giants.js';

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
};
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
  cam.update(dt);
  frame.cam.set(cam.pos);
  frame.update();
  sunDirAtGiant.set(star.pos[0] - giant.pos[0], star.pos[1] - giant.pos[1], star.pos[2] - giant.pos[2]).normalize();
  giant.update(frame, simT, sunDirAtGiant, star.color, 1.7 * star.type.intensity);
  star.update(frame, simT, camera);
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
  const alt = t === targets.giant ? ' · altitude ' + fmtDist(d - giant.R) : '';
  $('readout').textContent = `${fps.toFixed(0)} i/s · ${t ? t.label : ''} · distance ${fmtDist(d)}${alt} · ×${timeScale}`;
}
$('giant').onchange = (e) => { setGiant(e.target.value); };
$('view-sel').onchange = (e) => { const v = e.target.value; curTarget = v.startsWith('ring') ? 'rings' : v === 'star' ? 'star' : 'giant'; VIEWS[v](); };
$('target').onchange = (e) => { curTarget = e.target.value; cam.setTarget(targets[curTarget], { dur: 3.2, dist: curTarget === 'star' ? star.R * 8 : curTarget === 'rings' ? 2e7 : giant.R * 3 }); };
$('speed').oninput = (e) => { timeScale = Math.round(Math.pow(10, +e.target.value)); hud(); };
$('shot').onclick = () => { render(); const a = document.createElement('a'); a.download = `fronde_${giantKey}_${Date.now()}.png`; a.href = renderer.domElement.toDataURL('image/png'); a.click(); };

// accès de test (tools/fronde/shots.js) : rendu image par image, sans boucle
window.RW = {
  views: Object.keys(VIEWS), setView: (v) => { VIEWS[v](); }, setGiant, setTime: (t) => { simT = t; }, setTimeScale: (s) => { timeScale = s; },
  stop: () => renderer.setAnimationLoop(null),
  frames: (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) step(dt); render(); },
  info: () => ({ ...renderer.info.render, q: Q, dist: cam.distance }),
  ready: true,
};
