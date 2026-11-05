// CinematicDirector — caméra cinématique automatique : une bibliothèque de plans paramétrés et un séquenceur.
// Préfigure le Telebyte Director : chaque plan choisit sa cible, son mouvement, sa focale et la vitesse du temps
// de course (ralenti sur la traversée des anneaux, accéléré sur les plans d'ensemble). Coupes franches, et fondus
// au noir seulement quand on change de lieu. Produit une position du monde float64 + une visée, appliquées à la
// caméra three.js restée à l'origine (WorldFrame).
//
// ctx (fourni par la scène) : racer, giant, sun (Vector3), sampleAt(t) → {p, v}, race { tp, tc, cross },
//   setTime(t), setTimeScale(s), setRacer(on), view(name) → { target, yaw, pitch, dist } (cadrages de la sandbox),
//   fade(el, on), caption(text)
import { THREE } from '../lib/sb3d-shim.js';

const ease = (t) => t * t * (3 - 2 * t);
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// orbite autour d'une cible : position = cible + direction(lacet, tangage) × distance
function orbit(target, yaw, pitch, dist) {
  const cp = Math.cos(pitch);
  return [target[0] + Math.sin(yaw) * cp * dist, target[1] + Math.sin(pitch) * dist, target[2] + Math.cos(yaw) * cp * dist];
}

export function makeReel(ctx) {
  const R = () => ctx.giant.R;
  // plan d'orbite lente à partir d'un cadrage existant de la sandbox (dyaw : rotation, dolly : rapprochement)
  const orbitShot = (title, view, dur, { dyaw = 0.12, dolly = 0.12, dpitch = 0, fov = null, timeScale = null, fade = false, at = null } = {}) => ({
    title, dur, fade,
    setup() {
      if (at) at();
      const b = ctx.view(view);
      if (timeScale != null) ctx.setTimeScale(timeScale);
      return { ...b, fov: fov || b.fov };
    },
    frame(s, u) {
      const e = ease(u);
      return { pos: orbit(s.target, s.yaw + dyaw * e, s.pitch + dpitch * e, s.dist * (1 - dolly * e)), look: [...s.target], fov: s.fov };
    },
  });
  // poursuite : derrière le racer, dans son repère de vitesse, rappel amorti (la caméra « traîne » dans les virages)
  const chase = (title, dur, { t, timeScale = 1, back = 150, up = 28, side = 18, fov = 46, closeIn = 0 }) => ({
    title, dur,
    setup() { ctx.setRacer(true); ctx.setTime(t()); ctx.setTimeScale(timeScale); return { off: null }; },
    frame(s, u, dt) {
      const r = ctx.racer, v = V(r.vel).normalize();
      const n = V(ctx.giant.axis);
      const sd = new THREE.Vector3().crossVectors(v, n).normalize(), upv = new THREE.Vector3().crossVectors(sd, v).normalize();
      const d = back * (1 - closeIn * ease(u));
      const want = v.clone().multiplyScalar(-d).addScaledVector(upv, up).addScaledVector(sd, side);
      if (!s.off) s.off = want.clone();
      s.off.lerp(want, 1 - Math.exp(-dt * 2.5));
      const p = r.pos;
      return { pos: [p[0] + s.off.x, p[1] + s.off.y, p[2] + s.off.z], look: [p[0] + v.x * 60, p[1] + v.y * 60, p[2] + v.z * 60], up: upv, fov };
    },
  });
  // caméra fixe sur la trajectoire : le racer la frôle (traversée des anneaux : sous le plan, en contre-plongée)
  const flyby = (title, dur, { t, lead, timeScale, offset, fov = 38 }) => ({
    title, dur, fade: true,
    setup() {
      ctx.setRacer(true);
      const at = ctx.sampleAt(t() + lead);                       // point de passage
      const v = V(at.v).normalize(), n = V(ctx.giant.axis);
      const sd = new THREE.Vector3().crossVectors(v, n).normalize();
      const o = sd.multiplyScalar(offset[0]).addScaledVector(n, offset[1]).addScaledVector(v, offset[2]);
      ctx.setTime(t()); ctx.setTimeScale(timeScale);
      return { pos: [at.p[0] + o.x, at.p[1] + o.y, at.p[2] + o.z], n };
    },
    frame(s) { const p = ctx.racer.pos; return { pos: s.pos, look: [p[0], p[1], p[2]], up: s.n, fov }; },
  });
  const tp = () => ctx.race.tp, tc = () => ctx.race.tc;
  return [
    orbitShot('Vue générale du système', 'trajectory', 8, { dyaw: 0.25, dolly: 0.15, timeScale: 400 }),
    chase('Approche des anneaux', 7, { t: () => tc() - 160, timeScale: 6, back: 2200, up: 260, side: 300, closeIn: 0.8 }),
    flyby('Traversée des anneaux', 7, { t: () => tc() - 0.08, lead: 0.087, timeScale: 0.02, offset: [90, -35, 0], fov: 50 }),   // ralenti ×0,02 : 46 km/s à l'écran deviennent 0,9 km/s
    orbitShot('Devant la géante', 'racer', 8, { dyaw: -0.35, dolly: 0.25, dpitch: -0.05 }),
    orbitShot('Échelle planétaire', 'racer-pass', 7, { dyaw: 0.04, dolly: 0.1, timeScale: 2 }),
    chase('Périapse', 7, { t: () => tp() - 8, timeScale: 2, back: 120, up: 22, side: -26, fov: 52 }),
    orbitShot('Côté nuit', 'night', 8, { dyaw: -0.18, dolly: 0.1, fade: true, timeScale: 60 }),
    orbitShot('Passage rasant · Kesh', 'graze-kesh', 6, { dyaw: 0.22, dolly: 0.35, fade: true, timeScale: 1 }),
    orbitShot("Champ d'astéroïdes", 'field-in', 6, { dyaw: 0.3, dolly: 0.3, fade: true, timeScale: 1 }),
  ];
}

export class CinematicDirector {
  constructor(camera, ctx) {
    this.camera = camera; this.ctx = ctx; this.reel = makeReel(ctx);
    this.pos = new Float64Array(3); this.active = false; this.i = -1; this.t = 0; this.state = null;
    this._v = new THREE.Vector3();
  }
  start(i = 0) { this.active = true; this._cut(i); }
  stop() { this.active = false; this.ctx.caption(''); this.ctx.fade(false); }
  _cut(i) {
    this.i = i % this.reel.length; this.t = 0;
    const shot = this.reel[this.i];
    this.state = shot.setup();
    this.ctx.caption(shot.title);
    if (shot.fade) { this.ctx.fade(true); setTimeout(() => this.ctx.fade(false), 30); }
  }
  // place le séquenceur sur un plan à une fraction donnée (captures)
  seek(i, u) { this.active = true; this._cut(i); this.t = u * this.reel[this.i].dur; if (this.ctx.advance) this.ctx.advance(this.t); }
  // 1) avant de placer le racer : avance l'horloge du plan, coupe au plan suivant (qui règle le temps de course)
  tick(dt) {
    if (!this.active) return;
    this._dt = dt;
    if (this.hold) return;                                     // figé (captures : le temps de construire le relief)
    this.t += dt;
    if (this.t >= this.reel[this.i].dur) this._cut(this.i + 1);
  }
  // 2) après : cadre la caméra
  apply() {
    if (!this.active) return false;
    const shot = this.reel[this.i];
    const f = shot.frame(this.state, Math.min(1, this.t / shot.dur), Math.max(this._dt || 0, 1 / 120));
    this.pos.set(f.pos);
    const c = this.camera;
    c.position.set(0, 0, 0);
    c.up.copy(f.up || new THREE.Vector3(0, 1, 0));
    c.lookAt(this._v.set(f.look[0] - f.pos[0], f.look[1] - f.pos[1], f.look[2] - f.pos[2]));
    this.fov = f.fov || null;
    return true;
  }
  get title() { return this.i >= 0 ? this.reel[this.i].title : ''; }
}
