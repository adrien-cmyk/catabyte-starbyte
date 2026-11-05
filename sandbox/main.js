// La Grande Fronde — Race World Visual Sandbox (Phase 1, étapes 1 à 14 du plan technique, puis Phase 2 : vue système de course).
// Assemble : renderer à profondeur logarithmique, origine flottante, ciel cuit, étoile, géante gazeuse + anneaux, trois lunes,
// caméra libre à zoom logarithmique, post-traitement (bloom), panneau de réglages, vues des tests visuels.
import { SB3D, THREE, qualityLevel } from './lib/sb3d-shim.js';
import { WorldFrame, AU, fmtDist } from './core/WorldFrame.js';
import { GasGiant } from './bodies/GasGiant.js';
import { RingSystem } from './bodies/RingSystem.js';
import { Star, STAR_TYPES } from './bodies/Star.js';
import { bakeBackdrop } from './scene/Backdrop.js';
import { FreeCamera } from './camera/FreeCamera.js';
import { CinematicDirector } from './camera/CinematicDirector.js';
import { LodManager } from './core/LodManager.js';
import { GIANTS } from './presets/giants.js';
import { Moon, PatchPool } from './bodies/Moon.js';
import { sandboxMoons } from './presets/moons.js';
import { RACE_SYSTEMS, RACERS, gmOfGiant } from './race/raceData.js';
import { RACER_PROFILES } from './scene/racerProfiles.js';
import { DemoFeed } from './race/DemoFeed.js';
import { RaceLayer } from './race/RaceLayer.js';
import { SpeedLines } from './scene/SpeedLines.js';
import { AsteroidField } from './bodies/AsteroidField.js';
import { RingDebris } from './bodies/RingDebris.js';
import { Racer } from './scene/Racer.js';
import { TrajectoryHolo } from './scene/TrajectoryHolo.js';
import { RacerMarker } from './scene/RacerMarker.js';
import { propagate, sampleAt, hyperbolicApproach, GM_GIANT, gmOfSphere } from './core/Gravity.js';

const Q = qualityLevel();
const lod = new LodManager(Q);   // suit SBPerf.level en jeu ; ?q= ou le panneau dans le labo
const host = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: Q < 2, logarithmicDepthBuffer: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, [2, 1.25, 1, 0.75][Q]));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 1e13);
const frame = new WorldFrame();
let simT = 3 * 3600, timeScale = 240, last = performance.now(), fpsAcc = 0, fpsN = 0, fps = 0;
scene.background = bakeBackdrop(renderer, { quality: Q });

/* ── système de la sandbox : géante au centre, étoile jaune à 5,2 UA ── */
const SUN_DIR = new THREE.Vector3(-0.82, 0.12, -0.56).normalize();
const KERATH_SUN = SUN_DIR.clone();                              // Kerath garde l'éclairage validé en Phase 1
let star = new Star(STAR_TYPES.yellow), curSys = RACE_SYSTEMS[0];
star.pos.set([SUN_DIR.x * 5.2 * AU, SUN_DIR.y * 5.2 * AU, SUN_DIR.z * 5.2 * AU]);
frame.add(star.group, star.pos);
scene.add(star.group);
const sunLight = new THREE.DirectionalLight(star.color, 3.2);   // objets PBR (racer)
const giantShine = new THREE.DirectionalLight(0xffb07a, 0.22);  // lumière renvoyée par la géante (intensité recalculée à chaque image)
scene.add(sunLight, sunLight.target, giantShine, giantShine.target);
// reflets des métaux : environnement cuit (espace noir, soleil, grande lueur de la géante), recuit à chaque système
function bakeEnv(glowCol = [0.5, 0.3, 0.16]) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ color: 0x020305, side: THREE.BackSide })));
  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.95, 0.85).multiplyScalar(40) }));
  sun.position.copy(SUN_DIR).multiplyScalar(9); env.add(sun);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(4, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(...glowCol) }));
  glow.position.set(SUN_DIR.z * 8, -1.5, -SUN_DIR.x * 8); env.add(glow);
  const pm = new THREE.PMREMGenerator(renderer);
  if (scene.environment) scene.environment.dispose();
  scene.environment = pm.fromScene(env, 0.02).texture; pm.dispose();
  env.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
}
bakeEnv();

let giant = null, giantKey = null, debris = null;
function setGiant(key) {
  if (giant) { scene.remove(giant.group); frame.remove(giant.group); giant.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
  const p = GIANTS[key]; giantKey = key;
  const ring = p.ring ? new RingSystem({ seed: 'ring-' + key, palette: key }) : null;
  giant = new GasGiant(p, { seed: key, quality: Q, ring });
  frame.add(giant.group, giant.pos);
  scene.add(giant.group);
  if (debris) debris.removeFrom(scene, frame);
  debris = ring ? new RingDebris(giant, { quality: Q }) : null;
  if (debris) debris.addTo(scene, frame);
  if (typeof lod !== 'undefined' && lod.targets.length) { giant.setLod(lod.budget); if (debris) debris.setLod(lod.budget); }
  targets.giant = { pos: giant.pos, minDist: giant.R * 1.0015, label: p.name };
  // point d'observation dans les anneaux, sur la face éclairée, rayon 1,8 R (anneau principal)
  const a = Math.atan2(SUN_DIR.z, SUN_DIR.x) + 0.9, rr = 1.8 * giant.R, m = giant.group.matrixWorld;
  const v = new THREE.Vector3(Math.cos(a) * rr, 0, Math.sin(a) * rr).applyMatrix4(new THREE.Matrix4().extractRotation(m));
  targets.rings = { pos: Float64Array.from([v.x, v.y, v.z]), minDist: 50, label: 'Anneaux' };
  if (cam.target) cam.setTarget(targets[curTarget] || targets.giant);
  if (typeof holo !== 'undefined' && holo) { buildRace(); if (racerOn) racerAt(simT); }
}

/* ── caméra ── */
const cam = new FreeCamera(camera, renderer.domElement);
const targets = { star: { pos: star.pos, minDist: star.R * 1.6, label: star.type.name } };
let curTarget = 'giant';
setGiant('amber');

/* ── lunes : relief construit dans des Web Workers partagés ── */
const pool = new PatchPool();
let moons = sandboxMoons(GIANTS.amber.radius).map((def) => {
  const m = new Moon(def, { quality: Q, pool });
  frame.add(m.group, m.pos); scene.add(m.group);
  targets['moon:' + def.id] = { pos: m.pos, minDist: def.radius * 1.006, label: def.name };
  return m;
});
let moonById = Object.fromEntries(moons.map((m) => [m.def.id, m]));

/* ── racer témoin : frégate SR-01 sur une fronde gravitationnelle calculée (Velocity Verlet, géante + 3 lunes) ── */
const racer = new Racer();
frame.add(racer.group, racer.pos); scene.add(racer.group, racer.trail.mesh);
targets.racer = { pos: racer.pos, minDist: 40, label: 'Racer SR-01' };
const marker = new RacerMarker(); racer.group.add(marker.points);
var holo = new TrajectoryHolo();   // var : setGiant (appelé plus haut) le teste avant sa création
scene.add(holo.group);
let racerOn = false, fovOv = null, race = null, exag = 0;
let fleet = null, fleetOn = false;
var raceLayer = null;                                             // couche de course (vue système), créée plus bas                                // flotte de la course pilote (voir plus bas)
const DENSITY = { rocky: 3300, icy: 1900, volcanic: 3500 };
// astres pour l'intégration : positions exactes au temps t (mêmes formules que Moon.place)
function raceBodies() {
  const q = giant.group.quaternion.clone(), v = new THREE.Vector3(), gp = giant.pos;
  const list = [{ GM: gmOfGiant(giant.R), R: giant.R, pos: (t, o) => { o[0] = gp[0]; o[1] = gp[1]; o[2] = gp[2]; return o; } }];
  for (const m of moons) {
    const od = m.def.orbit;
    list.push({ GM: gmOfSphere(m.R, DENSITY[m.def.family]), R: m.R, pos: (t, o) => {
      const a = od.phase + 2 * Math.PI * t / od.period;
      v.set(Math.cos(a) * od.r, Math.sin(a) * Math.sin(od.inc) * od.r, Math.sin(a) * Math.cos(od.inc) * od.r).applyQuaternion(q);
      o[0] = gp[0] + v.x; o[1] = gp[1] + v.y; o[2] = gp[2] + v.z; return o; } });
  }
  return list;
}
// la course témoin : arrivée hyperbolique à 12 km/s, périapse à 1,12 R (sous l'anneau intérieur), plan incliné de 4°
// dont la ligne des nœuds fait traverser l'anneau principal à l'aller ; périapse placée côté jour, près du terminateur
function buildRace() {
  const R = giant.R, q = giant.group.quaternion, Y = new THREE.Vector3(0, 1, 0);
  const vInf = 1.2e4, rp = 1.12 * R, r0 = 14 * R;
  const s0 = hyperbolicApproach(GM_GIANT, vInf, rp, r0, [0, 0, 1], [1, 0, 0]);
  const single = [{ GM: GM_GIANT, R, pos: (t, o) => { o[0] = o[1] = o[2] = 0; return o; } }];
  const S1 = propagate(single, { t: 0, p: s0.p, v: s0.v }, 2 * 86400, { dtMax: 300 });
  let ip = 0, rmin = Infinity; S1.forEach((x, i) => { const r = Math.hypot(...x.p); if (r < rmin) { rmin = r; ip = i; } });
  const Pp = new THREE.Vector3(...S1[ip].p).normalize();
  const sL = SUN_DIR.clone().applyQuaternion(q.clone().invert());
  const want = Math.atan2(sL.z, sL.x) + 0.9, have = Math.atan2(Pp.z, Pp.x);
  const spin = new THREE.Quaternion().setFromAxisAngle(Y, have - want);          // azimut de la périapse
  const P2 = Pp.clone().applyQuaternion(spin);
  const n = new THREE.Vector3(...s0.p).cross(new THREE.Vector3(...s0.v)).normalize();
  const node = P2.clone().applyAxisAngle(n, -74 * Math.PI / 180);               // nœud ascendant côté aller
  const tilt = new THREE.Quaternion().setFromAxisAngle(node.normalize(), 4 * Math.PI / 180);
  const toW = q.clone().multiply(tilt).multiply(spin);
  const p = new THREE.Vector3(...s0.p).applyQuaternion(toW), v = new THREE.Vector3(...s0.v).applyQuaternion(toW);
  const t0 = 0;
  const S = propagate(raceBodies(), { t: t0, p: [giant.pos[0] + p.x, giant.pos[1] + p.y, giant.pos[2] + p.z], v: [v.x, v.y, v.z] }, 2.2 * 86400, { dtMax: 120 });
  const axis = Y.clone().applyQuaternion(q);
  holo.setPath(S, { tickEvery: 1800, ringPlane: giant.ring ? { center: giant.pos, normal: axis.toArray(), inner: giant.ring.inner * R, outer: giant.ring.outer * R } : null });
  const cross = holo.markData.find((m) => m.k === 2);
  race = { S, t0: S[0].t, t1: S[S.length - 1].t, tp: holo.periapsis.t, rp: holo.periapsis.r, hit: S.hit, tc: cross ? cross.t : holo.periapsis.t - 3600 };
}
buildRace();
const _P = [0, 0, 0], _V = [0, 0, 0];
function racerAt(t) { sampleAt(race.S, t, _P, _V); racer.pos.set(_P); racer.vel.set(_V); }
// le racer est-il au soleil au temps t ? (hors du cylindre d'ombre de la géante)
function racerLit(t) {
  sampleAt(race.S, t, _P, _V);
  const r = new THREE.Vector3(_P[0] - giant.pos[0], _P[1] - giant.pos[1], _P[2] - giant.pos[2]);
  const along = r.dot(SUN_DIR);
  return along > 0 || r.addScaledVector(SUN_DIR, -along).length() > giant.R * 1.02;
}
// direction de caméra : mélange de (géante → racer) et du soleil, en lacet / tangage pour FreeCamera
function aimFromGiant(k) {
  const d = new THREE.Vector3(racer.pos[0] - giant.pos[0], racer.pos[1] - giant.pos[1], racer.pos[2] - giant.pos[2]).normalize();
  d.multiplyScalar(1 - k * 0.5).addScaledVector(SUN_DIR, k).normalize();
  return { yaw: Math.atan2(d.x, d.z), pitch: Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)) };
}
// premier instant éclairé à partir de `before` secondes avant la périapse (pas de 5 min)
function litBefore(before) { for (let b = before; b > -6 * 3600; b -= 300) if (racerLit(race.tp - b)) return b; return before; }
// place l'horloge de course `dt` secondes avant la périapse ; renvoie l'azimut géante → racer
function racerStart(before = 1500) {
  simT = race.tp - before; racerAt(simT); racer.trail.reset(); racerOn = true;
  return Math.atan2(racer.pos[0] - giant.pos[0], racer.pos[2] - giant.pos[2]);
}

/* ── champ d'astéroïdes : un amas allongé le long de l'orbite, à 4,4 R de la géante, éclairé de côté ── */
const field = (() => {
  const Rg = GIANTS.amber.radius, q = giant.group.quaternion;
  const sL = SUN_DIR.clone().applyQuaternion(q.clone().invert());
  const a = Math.atan2(sL.z, sL.x) + 1.9;
  const radial = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).applyQuaternion(q);
  const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const tangent = new THREE.Vector3().crossVectors(normal, radial);
  const c = radial.clone().multiplyScalar(4.4 * Rg);
  const f = new AsteroidField({ seed: 'fronde-1', center: [c.x, c.y, c.z], axes: [tangent.toArray(), radial.toArray(), normal.toArray()],
    extent: [3.0e7, 9e6, 2.5e6] }, { quality: Q });
  f.radial = radial; f.normal = normal;
  frame.add(f.group, f.anchor); scene.add(f.group);
  return f;
})();
targets.field = { pos: field.center, minDist: 100, label: 'Champ d\'astéroïdes' };
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
let sunYaw = Math.atan2(SUN_DIR.x, SUN_DIR.z);
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
  // test n° 4 : traversée des anneaux — au-dessus de la couche de fragments, puis dedans
  'ring-cross': () => cam.setTarget(targets.rings, { dist: 2600, yaw: sunYaw + 0.7, pitch: 0.32 }),
  'ring-inside': () => cam.setTarget(targets.rings, { dist: 700, yaw: sunYaw + 1.5, pitch: 0.06 }),
  ringskim: () => cam.setTarget(targets.rings, { dist: 3e6, yaw: sunYaw + 1.2, pitch: 0.06 }),
  star: () => cam.setTarget(targets.star, { dist: star.R * 6, yaw: sunYaw + Math.PI + 0.6, pitch: 0.1 }),
  // une lune devant la géante, toutes deux éclairées de trois quarts : on avance le temps jusqu'à ce que Kesh passe
  // côté soleil (décalée de 0,5 rad), puis la caméra se place au-delà de la lune, le soleil dans le dos
  // test n° 5 : entrée dans le champ (depuis l'extérieur, la géante derrière) et cœur du champ
  'field-entry': () => { graze = null; const r = field.radial, E = field.data.def.extent;
    targets.fieldEdge = { pos: Float64Array.from([field.center[0] + r.x * E[1] * 0.8, field.center[1] + r.y * E[1] * 0.8, field.center[2] + r.z * E[1] * 0.8]), minDist: 100, label: 'Lisière du champ' };
    cam.setTarget(targets.fieldEdge, { dist: 2.5e5, yaw: Math.atan2(r.x, r.z) + 0.12, pitch: 0.05 }); },
  'field-in': () => { graze = null; const r = field.radial;
    // point le plus dense du champ (échantillonnage déterministe), pour être au milieu d'un amas
    const D = field.data, A = D.def.axes, E = D.def.extent; let best = [0, 0, 0], bd = -1;
    for (let i = 0; i < 600; i++) {
      const u = ((i * 0.618034) % 1 - 0.5) * 1.2, v = ((i * 0.754878) % 1 - 0.5) * 0.6, w = ((i * 0.569840) % 1 - 0.5) * 0.4;
      const p = [0, 1, 2].map((c) => A[0][c] * u * E[0] + A[1][c] * v * E[1] + A[2][c] * w * E[2]);
      const d = D.density(...p); if (d > bd) { bd = d; best = p; }
    }
    // un rocher de taille moyenne (niveau 2) près de ce point : premier plan du test
    const L2 = D.levels[2], ci = best.map((c) => Math.floor(c / L2.s));
    let rock = null;
    for (let i = -1; i <= 1 && !rock; i++) for (let j = -1; j <= 1; j++) for (let l = -1; l <= 1; l++)
      for (const q of D.rocksInCell(2, ci[0] + i, ci[1] + j, ci[2] + l)) if (!rock || q.r > rock.r) rock = q;
    const p = rock ? [rock.x, rock.y, rock.z] : best;
    targets.fieldIn = { pos: Float64Array.from([field.center[0] + p[0], field.center[1] + p[1], field.center[2] + p[2]]), minDist: 100, label: 'Cœur du champ' };
    cam.setTarget(targets.fieldIn, { dist: rock ? rock.r * 5 : 4000, yaw: Math.atan2(r.x, r.z) + 0.9, pitch: 0.12 }); },
  // test n° 2 : le racer devant la géante — plan rapproché, puis longue focale où il redevient minuscule
  // la fronde vue de haut : trajectoire holographique complète, racer en accéléré
  trajectory: () => { racerStart(3 * 3600); timeScale = 90; cam.setTarget(targets.giant, { dist: giant.R * 9, yaw: sunYaw + 0.4, pitch: 1.05 }); },
  // caméra dans l'axe géante → racer (la géante est derrière lui), inclinée vers le soleil (éclairage de face) ;
  // en longue focale, plus inclinée : le regard rase le limbe
  racer: () => { racerStart(litBefore(420)); timeScale = 1; cam.setTarget(targets.racer, { dist: 190, ...aimFromGiant(0.4) }); },
  'racer-pass': () => { racerStart(litBefore(420)); timeScale = 1; fovOv = 9; cam.setTarget(targets.racer, { dist: 5200, ...aimFromGiant(0.95) }); },
  moons: () => { graze = null; const m = moonById.kesh || moons[1] || moons[0], o = m.def.orbit;
    const sL = SUN_DIR.clone().applyQuaternion(giant.group.quaternion.clone().invert());
    const aStar = Math.atan2(sL.z, sL.x) + 0.5;
    simT = (((aStar - o.phase) / (2 * Math.PI)) % 1 + 1) % 1 * o.period;
    m.place(giant, simT);
    const yaw = Math.atan2(m.pos[0] - giant.pos[0], m.pos[2] - giant.pos[2]);
    cam.setTarget(targets['moon:' + m.def.id], { dist: m.R * 7, yaw: yaw + 0.22, pitch: 0.05 }); },
};
function moonViews(defs) {
  for (const m of defs) {
    VIEWS[m.id] = () => { graze = null; cam.setTarget(targets['moon:' + m.id], { dist: m.radius * 2.6, yaw: sunYaw + 1.3, pitch: 0.18 }); };
    // test n° 3 : survol à ~2,5 km, regard le long de l'horizon, lumière rasante de trois quarts
    VIEWS['graze-' + m.id] = () => { const g = setGraze(m.id); cam.setTarget(g.target, { dist: 24000, yaw: g.sunYawM + 2.3, pitch: 0.1 }); };
  }
}
moonViews(sandboxMoons(GIANTS.amber.radius));
const wrapView = (k) => { const f = VIEWS[k]; if (f._w) return; VIEWS[k] = () => { fovOv = null; fleetOn = false; if (raceLayer && raceLayer.on) raceLayer.exit(); if (!['racer', 'racer-pass', 'trajectory'].includes(k)) { timeScale = 240; racerOn = false; } f(); }; VIEWS[k]._w = true; };
for (const k of Object.keys(VIEWS)) wrapView(k);
VIEWS.giant();

/* ── flotte de la course pilote : quatre racers en livrée, chargés à la première vue de flotte ── */
const lineup = { center: new Float64Array(3) };
function ensureFleet() {
  if (fleet) return fleet;
  fleet = RACERS.map((r) => {
    const P = RACER_PROFILES[r.ship], rc = new Racer(P, { livery: r.livery }); rc.def = r;
    frame.add(rc.group, rc.pos); scene.add(rc.group, rc.trail.mesh);
    targets['racer:' + r.id] = { pos: rc.pos, minDist: P.length * 0.4, label: r.name };
    return rc;
  });
  return fleet;
}
// côte à côte sur la face de jour, à 1,6 R, cap prograde ; les gabarits vont de 29 m à 1,3 km (vraie échelle)
function placeLineup() {
  ensureFleet(); fleetOn = true; racerOn = false;
  const q = giant.group.quaternion, sL = SUN_DIR.clone().applyQuaternion(q.clone().invert());
  const a = Math.atan2(sL.z, sL.x) + 0.7, R = giant.R;
  const radial = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).applyQuaternion(q);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const fwd = new THREE.Vector3().crossVectors(up, radial).normalize();            // sens de l'orbite
  const base = radial.clone().multiplyScalar(1.6 * R).addScaledVector(up, 0.12 * R);
  const lateral = [0, 1250, 1850, 2050];                                            // KV-01, Fulgurant, SR-01, TK-07
  const order = ['cuirasse', 'fulgurant', 'sentinelle', 'mule'];
  for (const rc of fleet) {
    const k = order.indexOf(rc.def.id), o = radial.clone().multiplyScalar(lateral[k] - 1000);
    rc.pos.set([giant.pos[0] + base.x + o.x, giant.pos[1] + base.y + o.y, giant.pos[2] + base.z + o.z]);
    rc.vel.set([fwd.x, fwd.y, fwd.z]); rc.throttle = 1; rc.trail.reset();
  }
  lineup.center.set([giant.pos[0] + base.x, giant.pos[1] + base.y, giant.pos[2] + base.z]);
  // caméra de trois quarts avant, soleil dans le dos
  const d = fwd.clone().multiplyScalar(0.7).addScaledVector(SUN_DIR, 0.55).addScaledVector(up, 0.2).normalize();
  return { yaw: Math.atan2(d.x, d.z), pitch: Math.asin(d.y) };
}
VIEWS.fleet = () => { const aim = placeLineup(); targets.lineup = { pos: lineup.center, minDist: 100, label: 'La flotte' }; cam.setTarget(targets.lineup, { dist: 3600, ...aim }); };
for (const r of RACERS) VIEWS['fleet-' + r.id] = () => { const aim = placeLineup(); cam.setTarget(targets['racer:' + r.id], { dist: RACER_PROFILES[r.ship].length * 1.9, ...aim }); };
for (const k of ['fleet', ...RACERS.map((r) => 'fleet-' + r.id)]) { const f = VIEWS[k]; VIEWS[k] = () => { fovOv = null; timeScale = 1; f(); }; VIEWS[k]._w = true; }

/* ── vue système de course : le flux de course dans le système affiché (Phase 2, étape 5) ── */
raceLayer = new RaceLayer({
  scene, frame, feed: new DemoFeed(),
  giant: () => giant, sys: () => curSys, fleet: () => ensureFleet(),
  hud: document.getElementById('race'), labels: document.getElementById('race-labels'),
  setTime: (t) => { simT = t; }, getTime: () => simT, setSpeed: (x) => { timeScale = x; },
  follow: (id) => { const P = RACER_PROFILES[RACERS.find((r) => r.id === id).ship]; cam.setTarget(targets['racer:' + id], { dur: 2.2, dist: Math.max(P.length * 3, 400) }); },
  views: { overview: () => trackPack(2), gates: () => VIEWS['course-portes']() },
  back: () => {
    try { sessionStorage.setItem('fronde.t', String(simT)); sessionStorage.setItem('fronde.sel', raceLayer.sel || ''); } catch (e) {}
    let url = '../telebyte/index.html'; try { url = sessionStorage.getItem('fronde.back') || url; } catch (e) {}
    location.href = url;
  },
});
// vue Ensemble : la caméra suit le peloton présent dans le système et s'ajuste à son écartement
targets.pack = { pos: null, minDist: 2000, label: 'Le peloton' };
const speedLines = new SpeedLines(); scene.add(speedLines.mesh);
let sportFov = false;
// caméra de course (vue Suivre) : basse, derrière le racer, qui traîne un peu ; focale qui s'ouvre avec la vitesse,
// légère vibration pendant la poussée de périapse ; stries de poussière à la vitesse perçue
function sportCam(dt) {
  const on = raceLayer.on && raceLayer._view === 'follow';
  const rc = on && fleet && fleet.find((r) => r.def.id === raceLayer.sel && r.inSys);
  if (!rc) { if (sportFov) { fovOv = null; sportFov = false; } speedLines.update(false); return null; }
  const P = RACER_PROFILES[rc.def.ship], L = P.length;
  const v = new THREE.Vector3(...rc.vel), sp = v.length(); v.normalize();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(giant.group.quaternion);
  const side = new THREE.Vector3().crossVectors(v, up).normalize();
  const dir = v.clone().multiplyScalar(-Math.cos(0.2)).addScaledVector(up, Math.sin(0.2)).addScaledVector(side, 0.1).normalize();
  let yaw = Math.atan2(dir.x, dir.z); const pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
  while (yaw - cam.goal.yaw > Math.PI) yaw -= 2 * Math.PI; while (yaw - cam.goal.yaw < -Math.PI) yaw += 2 * Math.PI;
  if (!cam.tr) { cam.goal.yaw = yaw; cam.goal.pitch = pitch; cam.goal.logD += (Math.log(L * 2.2 + 25) - cam.goal.logD) * Math.min(1, dt * 1.5); }
  const k = THREE.MathUtils.clamp((sp - 20000) / 40000, 0, 1);
  fovOv = 50 + 12 * k + 6 * rc.throttle; sportFov = true;
  speedLines.update(true, rc.vel, L, rc.throttle > 0.5 ? 1 : 0, dt);
  return rc;
}
const packDist = () => Math.max(raceLayer.packSpread * 3.2, giant.R * 0.35);
function trackPack(dur = 0) {
  targets.pack.pos = raceLayer.pack; raceLayer.position(simT);
  cam.setTarget(targets.pack, { dur, dist: packDist(), yaw: sunYaw + 0.6, pitch: 0.5 });
  raceLayer._view = 'overview';
}
// vue d'ensemble du système en course ; la sélection d'un racer passe en poursuite
function courseView(opts = {}) {
  ensureFleet(); fleetOn = true; racerOn = false; graze = null;
  raceLayer.enter(opts);
  raceLayer.position(simT);
  const s = raceLayer.sel && fleet.find((r) => r.def.id === raceLayer.sel);
  if (s && s.inSys) { raceLayer.c.follow(raceLayer.sel); raceLayer._view = 'follow'; }        // le racer suivi est ici : poursuite
  else trackPack();                                                                 // sinon : vue Ensemble (le peloton)
  raceLayer._hud(true);
}
VIEWS.course = () => { fovOv = null; courseView(); };
VIEWS.course._w = true;
// les fenêtres orbitales vues de près, en surplomb côté soleil
VIEWS['course-portes'] = () => {
  fovOv = null; if (!raceLayer.on) courseView();                       // déjà en course : on ne fait que recadrer
  const f = raceLayer.windows.frameWorld(); if (!f) return; raceLayer._view = 'gates';
  targets.gates = { pos: Float64Array.from(f.c), minDist: 1000, label: 'Fenêtres orbitales' };
  cam.setTarget(targets.gates, { dist: Math.max(f.spread * 1.6, giant.R * 0.6), yaw: sunYaw + 0.9, pitch: 0.75 });
};
VIEWS['course-portes']._w = true;

/* ── systèmes de la course : bascule (étoile, soleil, reflets, géante, lunes, cibles, vues) ── */
const STAR_GLOW = { amber: [0.5, 0.3, 0.16], blue: [0.12, 0.3, 0.42], black: [0.08, 0.07, 0.06] };
function setSystem(id) {
  const sys = RACE_SYSTEMS.find((x) => x.id === id); if (!sys || sys === curSys) return;
  curSys = sys;
  // soleil : Kerath garde sa direction validée ; ailleurs, azimut et élévation du repère de la géante
  const tiltQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, GIANTS[sys.giant].tilt));
  if (sys.id === 'kerath') SUN_DIR.copy(KERATH_SUN);
  else SUN_DIR.set(Math.cos(sys.sunAz) * Math.cos(sys.sunEl), Math.sin(sys.sunEl), Math.sin(sys.sunAz) * Math.cos(sys.sunEl)).applyQuaternion(tiltQ).normalize();
  sunYaw = Math.atan2(SUN_DIR.x, SUN_DIR.z);
  // étoile
  scene.remove(star.group); frame.remove(star.group); star.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  star = new Star(STAR_TYPES[sys.star]);
  const D = sys.starDist * AU; star.pos.set([SUN_DIR.x * D, SUN_DIR.y * D, SUN_DIR.z * D]);
  frame.add(star.group, star.pos); scene.add(star.group);
  sunLight.color.copy(star.color);
  targets.star = { pos: star.pos, minDist: star.R * 1.6, label: star.type.name };
  bakeEnv(STAR_GLOW[sys.giant]);
  // lunes (avant la géante : setGiant recalcule la fronde avec les lunes)
  for (const m of moons) { scene.remove(m.group); frame.remove(m.group); for (const c of m.group.children) c.geometry.dispose(); delete targets['moon:' + m.def.id]; }
  const GM = gmOfGiant(sys.R);
  const defs = sys.moons.map((d) => {
    const a = d.a * sys.R;
    return { id: d.id, name: d.name, family: d.family, radius: d.r, seed: d.id, rho: d.rho, orbit: { r: a, period: 2 * Math.PI * Math.sqrt(a ** 3 / GM), phase: d.phase, inc: d.inc } };
  });
  moons = defs.map((def) => {
    const m = new Moon(def, { quality: Q, pool }); m.setLod(lod.budget);
    frame.add(m.group, m.pos); scene.add(m.group);
    targets['moon:' + def.id] = { pos: m.pos, minDist: def.radius * 1.006, label: def.name };
    return m;
  });
  moonById = Object.fromEntries(moons.map((m) => [m.def.id, m]));
  moonViews(defs); for (const d of defs) { wrapView(d.id); wrapView('graze-' + d.id); }
  // menus : lunes du système
  const sel = $('view-sel'), tsel = $('target');
  for (const o of [...sel.querySelectorAll('[data-moon]'), ...tsel.querySelectorAll('[data-moon]')]) o.remove();
  for (const d of defs) {
    for (const [v, t] of [[d.id, d.name], ['graze-' + d.id, d.name.split(' · ')[0] + ' · passage rasant']]) { const o = new Option(t, v); o.dataset.moon = 1; sel.add(o); }
    const o = new Option('Cible : ' + d.name.split(' · ')[0], 'moon:' + d.id); o.dataset.moon = 1; tsel.add(o);
  }
  // champ d'astéroïdes : seulement à Kerath (course pilote)
  field.group.visible = sys.id === 'kerath';
  setGiant(sys.giant);
  if (raceLayer && raceLayer.on) { raceLayer.rebuild(); courseView({ sel: raceLayer.sel }); } else VIEWS.giant();
}

/* ── caméra cinématique : bobine en boucle (plans, temps de course, coupes et fondus) ── */
const director = new CinematicDirector(camera, {
  get racer() { return racer; }, get race() { return race; }, sun: SUN_DIR,
  get giant() { return { R: giant.R, pos: giant.pos, axis: new THREE.Vector3(0, 1, 0).applyQuaternion(giant.group.quaternion).toArray() }; },
  sampleAt: (t) => { const p = [0, 0, 0], v = [0, 0, 0]; sampleAt(race.S, t, p, v); return { p, v }; },
  setTime: (t) => { simT = t; racerAt(simT); racer.trail.reset(); },
  setTimeScale: (x) => { timeScale = x; },
  setClock: (t) => { simT = t; if (racerOn) racerAt(simT); },
  advance: (dtReal) => { simT += dtReal * timeScale; if (racerOn) racerAt(simT); },
  setRacer: (on) => { racerOn = on; },
  view: (name) => { VIEWS[name](); cam.update(0); return { target: cam.target.pos, yaw: cam.goal.yaw, pitch: cam.goal.pitch, dist: Math.exp(cam.goal.logD), fov: fovOv || baseFov }; },
  fade: (on) => { document.getElementById('fade').classList.toggle('on', on); },
  caption: (t) => { document.getElementById('caption').textContent = t; },
});

/* ── post-traitement : bloom réservé aux sources très lumineuses (étoile, moteurs) ── */
const composer = new SB3D.EffectComposer(renderer);
composer.addPass(new SB3D.RenderPass(scene, camera));
const bloom = new SB3D.UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.6, 0.92);
composer.addPass(bloom);
composer.addPass(new SB3D.OutputPass());

let baseFov = 45;
// réglages à chaud : tout ce qui existe déjà (la géante est reconstruite à chaque changement : elle se réenregistre)
lod.register((b) => {
  bloom.enabled = b.bloom;
  if (!window.SBPerf) { renderer.setPixelRatio(Math.min(devicePixelRatio, b.dpr)); if (typeof resize === 'function') resize(); }   // en jeu, perf.js s'en charge
  giant.setLod(b); if (debris) debris.setLod(b); field.setLod(b);
  for (const m of moons) m.setLod(b);
});
function resize() {
  const w = host.clientWidth, h = host.clientHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h);
  camera.aspect = w / h; baseFov = w / h < 0.8 ? 58 : 45; camera.fov = fovOv || baseFov; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

/* ── boucle ── */
const sunDirAtGiant = new THREE.Vector3();
function step(dt) {
  simT += dt * timeScale;
  director.tick(dt);
  for (const m of moons) m.place(giant, simT);
  if (racerOn && race) {
    if (simT > race.t1) { simT = race.tp - 3 * 3600; racer.trail.reset(); }    // la course témoin repart en boucle
    racerAt(simT);
    racer.throttle = Math.abs(simT - race.tp) < 1200 ? 1 : 0.3;                // poussée maximale autour de la périapse (effet Oberth)
  }
  if (graze) graze.moon.surfacePoint(graze.dirL, 0, graze.target.pos);
  if (raceLayer && raceLayer.on) raceLayer.position(simT);
  const sportRc = raceLayer ? sportCam(dt) : null;
  cam.update(dt);
  if (sportRc && sportRc.throttle > 0.5) { const tt = performance.now() / 1000; camera.rotateX(Math.sin(tt * 37) * 0.0012); camera.rotateY(Math.sin(tt * 29 + 1) * 0.0012); }   // vibration de poussée
  if (director.apply()) frame.cam.set(director.pos); else frame.cam.set(cam.pos);
  { const f = (director.active ? director.fov : fovOv) || baseFov; if (camera.fov !== f) { camera.fov = f; camera.updateProjectionMatrix(); } }
  frame.update();
  sunDirAtGiant.set(star.pos[0] - giant.pos[0], star.pos[1] - giant.pos[1], star.pos[2] - giant.pos[2]).normalize();
  giant.update(frame, simT, sunDirAtGiant, star.color, 1.7 * star.type.intensity);
  star.update(frame, simT, camera);
  const pix = THREE.MathUtils.degToRad(camera.fov) / renderer.domElement.height;
  giant.uniforms.uPix.value = pix;
  for (const m of moons) {
    const sd = new THREE.Vector3(star.pos[0] - m.pos[0], star.pos[1] - m.pos[1], star.pos[2] - m.pos[2]).normalize();
    m.update(frame, camera, sd, star.color, 1.7 * star.type.intensity, pix, simT);
  }
  pool.pump();
  if (debris) debris.update(frame, camera, sunDirAtGiant, star.color, 1.7 * star.type.intensity, pix, simT);
  if (field.group.visible) {
    const c = field.center, sd = new THREE.Vector3(star.pos[0] - c[0], star.pos[1] - c[1], star.pos[2] - c[2]).normalize();
    field.update(frame, camera, sd, star.color, 1.7 * star.type.intensity, pix, simT);
  }
  sunLight.position.copy(sunDirAtGiant).multiplyScalar(1000); sunLight.target.position.set(0, 0, 0);
  {
    // lumière renvoyée par la géante : proportionnelle à sa taille apparente et à la part éclairée vue du racer
    // depuis le sujet de la vue (la flotte, sinon le racer témoin) ; garde : jamais à l'intérieur de la géante
    const sp = raceLayer && raceLayer.on ? raceLayer.focusPos() : fleetOn ? lineup.center : racer.pos;
    const gx = giant.pos[0] - sp[0], gy = giant.pos[1] - sp[1], gz = giant.pos[2] - sp[2];
    const d = Math.max(Math.hypot(gx, gy, gz), giant.R * 1.001), solid = Math.min(1, (giant.R / d) ** 2);
    const lit = 0.5 - 0.5 * (gx * SUN_DIR.x + gy * SUN_DIR.y + gz * SUN_DIR.z) / d;      // 1 = on voit sa face de jour
    giantShine.intensity = 0.05 + 3.2 * 0.55 * solid * lit;
    giantShine.position.set(gx, gy, gz).multiplyScalar(1000 / d);
  }
  racer.update(frame, simT, performance.now() / 1000);
  const raceOn = raceLayer && raceLayer.on;
  if (fleet) for (const rc of fleet) { const vis = fleetOn && (!raceOn || rc.inSys); rc.group.visible = rc.trail.mesh.visible = vis; if (vis) rc.update(frame, simT, performance.now() / 1000); }
  // vue Ensemble : le cadrage suit l'écartement du peloton (en douceur : l'utilisateur peut encore zoomer)
  if (raceOn && raceLayer._view === 'overview' && !cam.tr) cam.goal.logD += (Math.log(packDist()) - cam.goal.logD) * Math.min(1, dt * 0.8);
  if (raceOn) raceLayer.update(simT, camera, pix, [renderer.domElement.width, renderer.domElement.height, renderer.getPixelRatio()]);
  holo.group.visible = racerOn;
  // lisibilité en vue système : balise du racer, lunes agrandies (jamais en vue rapprochée : échelle réelle)
  {
    const dpr = renderer.getPixelRatio(), c = frame.cam;
    const dR = Math.hypot(racer.pos[0] - c[0], racer.pos[1] - c[1], racer.pos[2] - c[2]);
    marker.update(racer.P.length / dR / pix / dpr, racerOn, dpr);
    const dg = Math.hypot(giant.pos[0] - c[0], giant.pos[1] - c[1], giant.pos[2] - c[2]);
    exag = THREE.MathUtils.clamp((Math.log10(dg) - 8.7) / 1.0, 0, 1);
    for (const m of moons) {
      const dm = Math.hypot(m.pos[0] - c[0], m.pos[1] - c[1], m.pos[2] - c[2]), rpx = m.R / dm / pix / dpr;
      m.group.scale.setScalar(Math.min(80, 1 + exag * (Math.max(1, 4 / rpx) - 1)));
    }
  }
  if (racerOn) holo.update(frame.cam, simT, pix, 1.3 * renderer.getPixelRatio(), [renderer.domElement.width, renderer.domElement.height]);
}
renderer.info.autoReset = false;                 // compte toutes les passes (rendu + bloom + sortie)
let frameStats = { calls: 0, tris: 0, points: 0, ms: 0 };
function render() {
  renderer.info.reset();
  composer.render();
  frameStats = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, points: renderer.info.render.points };
}
let pollT = 0;
function loop(now) {
  if (now - pollT > 1000) { pollT = now; lod.poll(); }
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
  $('readout').textContent = `${fps.toFixed(0)} i/s · ${lod.budget.name} · ${frameStats.calls} appels · ${(frameStats.tris / 1e3).toFixed(0)} k tri · ${t ? t.label : ''} · distance ${fmtDist(d)}${alt} · ×${timeScale}`;
}
$('giant').onchange = (e) => { setSystem(e.target.value); };
$('view-sel').onchange = (e) => { if (e.target.value === 'zoom') { cam.enabled = false; director.start(1); $('cine').textContent = 'Caméra libre'; return; } if (director.active) { director.stop(); cam.enabled = true; $('cine').textContent = 'Cinématique'; } const v = e.target.value; curTarget = v.startsWith('ring') ? 'rings' : v === 'star' ? 'star' : moonById[v] ? 'moon:' + v : 'giant'; if (!v.startsWith('graze')) graze = null; VIEWS[v](); };
$('target').onchange = (e) => { curTarget = e.target.value; graze = null;
  const m = curTarget.startsWith('moon:') ? moonById[curTarget.slice(5)] : null;
  cam.setTarget(targets[curTarget], { dur: 3.2, dist: m ? m.R * 3 : curTarget === 'racer' ? 300 : curTarget === 'field' ? 2e6 : curTarget === 'star' ? star.R * 8 : curTarget === 'rings' ? 2e7 : giant.R * 3 }); };
$('speed').oninput = (e) => { timeScale = Math.round(Math.pow(10, +e.target.value)); hud(); };
$('quality').value = String(lod.level);
$('quality').onchange = (e) => lod.set(+e.target.value);
$('cine').onclick = () => { if (director.active) { director.stop(); cam.enabled = true; $('cine').textContent = 'Cinématique'; } else { cam.enabled = false; director.start(0); $('cine').textContent = 'Caméra libre'; } };
$('shot').onclick = () => { render(); const a = document.createElement('a'); a.download = `fronde_${giantKey}_${Date.now()}.png`; a.href = renderer.domElement.toDataURL('image/png'); a.click(); };

// entrée depuis Télébyte : …/sandbox/index.html#course (système, instant et racer suivis dans sessionStorage)
if (location.hash.startsWith('#course')) {
  let sys = 'kerath', t = null, sel = null;
  try { sys = sessionStorage.getItem('fronde.sys') || sys; const ts = sessionStorage.getItem('fronde.t'); t = ts ? +ts : null; sel = sessionStorage.getItem('fronde.sel') || null; } catch (e) {}
  if (sys !== curSys.id) setSystem(sys);
  $('giant').value = sys;
  courseView({ t, sel });
}

// accès de test (tools/fronde/shots.js) : rendu image par image, sans boucle
window.RW = {
  coursePortes: () => VIEWS['course-portes'](), course: (o) => courseView(o || {}), advanceRace: (dt) => { simT += dt; }, raceSelect: (id) => raceLayer.select(id),
  setSystem: (id) => setSystem(id), views: Object.keys(VIEWS), setView: (v) => { if (director.active) { director.stop(); cam.enabled = true; } VIEWS[v](); }, setGiant, setTime: (t) => { simT = t; }, setTimeScale: (s) => { timeScale = s; },
  stop: () => renderer.setAnimationLoop(null),
  shots: () => director.reel.map((s) => s.title),
  cine: (i, u, hold = true) => { cam.enabled = false; director.seek(i, u); director.hold = hold; },
  setQuality: (q) => lod.set(q),
  bench: (n = 20) => {
    const t0 = performance.now(); let s = 0;
    for (let i = 0; i < n; i++) { const a = performance.now(); step(1 / 60); const b = performance.now(); render(); s += b - a; }
    const tot = (performance.now() - t0) / n;
    return { level: lod.budget.name, stepMs: +(s / n).toFixed(2), frameMs: +tot.toFixed(1), ...frameStats,
      geo: renderer.info.memory.geometries, tex: renderer.info.memory.textures, budget: { calls: lod.budget.calls, tris: lod.budget.tris } };
  },
  exag: () => ({ exag, moons: moons.map((m) => +m.group.scale.x.toFixed(1)) }),
  cineDiag: () => ({ racer: { d: Math.hypot(racer.pos[0] - frame.cam[0], racer.pos[1] - frame.cam[1], racer.pos[2] - frame.cam[2]), model: !!racer.model, gp: racer.group.position.toArray().map((x) => +x.toFixed(1)), v: Math.hypot(...racer.vel) }, title: director.title, t: director.t, simT, tc: race.tc, ring: debris && debris.stats, alt: debris && (() => { const g = giant, c = frame.cam, q = g.group.quaternion.clone().invert(); const v = new THREE.Vector3(c[0] - g.pos[0], c[1] - g.pos[1], c[2] - g.pos[2]).applyQuaternion(q); return { y: v.y, r: Math.hypot(v.x, v.z) / g.R, dens: debris.data.density(v.x, v.y, v.z) }; })() }),
  frames: (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) step(dt); render(); },
  fleetReady: () => !!fleet && fleet.every((r) => r.ready),
  info: () => ({ ...renderer.info.render, race: race && { n: race.S.length, rp: race.rp / giant.R, hit: !!race.hit, alt: (race.rp - giant.R) / 1e3, vmax: Math.max(...race.S.map((x) => Math.hypot(...x.v))) / 1e3, marks: holo.markData.map((m) => m.k + ':' + (m.ring ? (m.ring / giant.R).toFixed(2) : '')).filter((x) => !x.startsWith('0:')) }, q: Q, dist: cam.distance, pending: pool.pending, field: field.stats, ring: debris ? debris.stats : null }),
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
