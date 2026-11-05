// FreeCamera — caméra libre en orbite autour d'une cible, zoom logarithmique (molette / pincement multiplient la
// distance) de quelques mètres à plusieurs UA. Glisser = tourner. Changement de cible : glissement en douceur de la
// cible (float64) et de la distance (interpolée en log), façon « plans d'existence » de labo/carte-v6.
// Produit une position du monde float64 et une orientation ; la caméra three.js reste à l'origine (WorldFrame).
import { THREE } from '../lib/sb3d-shim.js';

const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);

export class FreeCamera {
  constructor(camera, dom) {
    this.camera = camera; this.dom = dom;
    this.yaw = 0.6; this.pitch = 0.18; this.logD = Math.log(3e9);
    this.target = null;                                  // { pos: Float64Array, minDist }
    this.tgt = new Float64Array(3); this.pos = new Float64Array(3);
    this.goal = { yaw: this.yaw, pitch: this.pitch, logD: this.logD };
    this.tr = null; this.enabled = true;
    this.off = new Float64Array(3); this.offS = new Float64Array(3);                      // décalage de la visée (zoom vers le doigt), remis à zéro au changement de cible
    this.chase = false; this.u = { yaw: 0, pitch: 0, logD: 0 };   // caméra pilotée (poursuite) : les gestes s'ajoutent en décalage
    this.onZoom = null;                                  // (f, x, y) → true si le geste est pris (plongée vers un autre plan)
    this.userAt = 0;                                     // instant du dernier geste de zoom (les cadrages automatiques s'effacent)
    this._ray = new THREE.Vector3();
    this._bind();
  }
  _bind() {
    const d = this.dom, pts = new Map(); let pinch0 = 0, logD0 = 0;
    // les gestes commencés sur une étiquette de la scène comptent aussi (sinon pincer sur un vaisseau ne zoome pas)
    const ok = (e) => e.target === d || !!(e.target.closest && e.target.closest('.rl-racer, .rl-gate'));
    let movedPx = 0;                                       // un glissé ou un pincement commencé sur une étiquette n'est pas un tap
    addEventListener('click', (e) => { if (movedPx > 8 && e.target !== d && ok(e)) { e.stopPropagation(); e.preventDefault(); } }, true);
    addEventListener('pointerdown', (e) => { if (!pts.size) movedPx = 0; if (!this.enabled || !ok(e)) return; if (e.target === d) d.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); logD0 = this.goal.logD; } });
    addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return; { const q = pts.get(e.pointerId); movedPx += Math.abs(e.clientX - q[0]) + Math.abs(e.clientY - q[1]) + (pts.size > 1 ? 99 : 0); }
      const p = pts.get(e.pointerId), dx = e.clientX - p[0], dy = e.clientY - p[1];
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) {
        if (this.chase) { this.u.yaw -= dx * 0.005; this.u.pitch = THREE.MathUtils.clamp(this.u.pitch + dy * 0.004, -1.2, 1.2); }
        else { this.goal.yaw -= dx * 0.005; this.goal.pitch = THREE.MathUtils.clamp(this.goal.pitch + dy * 0.004, -1.5, 1.5); }
      } else if (pts.size === 2) {
        // pincement incrémental (comme la carte du jeu) : chaque mouvement multiplie la distance, vers le milieu des doigts
        const [a, b] = [...pts.values()], dd = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch0) this.zoomBy(Math.pow(pinch0 / dd, 1.6), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        pinch0 = dd;
      }
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0; };
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
    addEventListener('wheel', (e) => { if (!this.enabled || !ok(e)) return; e.preventDefault(); this.zoomBy(Math.exp(e.deltaY * 0.0022), e.clientX, e.clientY); }, { passive: false });
  }
  // zoom d'un facteur f (< 1 : on avance) vers le point d'écran (x, y) : le point visé glisse vers le centre
  zoomBy(f, x, y) {
    if (!this.enabled || !this.target || !(f > 0)) return;
    this.userAt = performance.now();
    if (this.onZoom && this.onZoom(f, x, y)) return;
    if (this.chase) { this.u.logD = THREE.MathUtils.clamp(this.u.logD + Math.log(f), -0.6, 12); return; }
    const before = this.goal.logD; this.goal.logD = this._clampLog(before + Math.log(f));
    const q = Math.exp(this.goal.logD - before);           // facteur réellement appliqué (butées)
    if (q < 1 && x != null) {
      const r = this.dom.getBoundingClientRect(), c = this.camera;
      this._ray.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1, 0.5).unproject(c).normalize();
      const D = Math.exp(this.goal.logD) / q, P = [0, 1, 2].map((i) => this.pos[i] + this._ray.getComponent(i) * D);
      for (let i = 0; i < 3; i++) this.off[i] += (P[i] - (this.target.pos[i] + this.off[i])) * (1 - q);
      this._capOff();
    } else if (q > 1) for (let i = 0; i < 3; i++) this.off[i] /= q;   // on recule : la visée revient sur la cible
  }
  _clampLog(l) { const min = this.target ? Math.log(this.target.minDist) : 0; return THREE.MathUtils.clamp(l, min, Math.log(3e12)); }
  _capOff() { const l = Math.hypot(...this.off), m = Math.exp(this.goal.logD) * 3; if (l > m) for (let i = 0; i < 3; i++) this.off[i] *= m / l; }
  // vise une cible ; d (mètres) facultatif ; dur = durée de la transition (s)
  setTarget(target, { dist, yaw, pitch, dur = 0 } = {}) {
    const from = this.target ? Float64Array.from(this.tgt) : null;
    this.target = target; this.off.fill(0); this.offS.fill(0);
    if (dist != null) this.goal.logD = Math.log(Math.max(dist, target.minDist));
    else this.goal.logD = this._clampLog(this.goal.logD);
    if (yaw != null) this.goal.yaw = yaw;
    if (pitch != null) this.goal.pitch = pitch;
    if (dur > 0 && from) this.tr = { from, t: 0, dur, logFrom: this.logD };
    else { this.tr = null; this.tgt.set(target.pos); this.yaw = this.goal.yaw; this.pitch = this.goal.pitch; this.logD = this.goal.logD; }
  }
  update(dt) {
    if (!this.target) return;
    const k = 1 - Math.exp(-dt * 6);
    this.yaw += (this.goal.yaw - this.yaw) * k; this.pitch += (this.goal.pitch - this.pitch) * k;
    const tp = this.target.pos;
    if (this.tr) {
      const tr = this.tr; tr.t = Math.min(1, tr.t + dt / tr.dur); const e = ease(tr.t);
      for (let i = 0; i < 3; i++) this.tgt[i] = tr.from[i] + (tp[i] + this.off[i] - tr.from[i]) * e;
      // la distance passe par un point haut (on recule pour voir les deux cibles) puis plonge : zoom accéléré
      const lift = Math.log(Math.hypot(tp[0] - tr.from[0], tp[1] - tr.from[1], tp[2] - tr.from[2]) + 1);
      const base = tr.logFrom + (this.goal.logD - tr.logFrom) * e;
      this.logD = Math.max(base, base + (lift - base) * Math.sin(Math.PI * e) * 0.9);
      if (tr.t >= 1) this.tr = null;
    } else {
      for (let i = 0; i < 3; i++) { this.offS[i] += (this.off[i] - this.offS[i]) * k; this.tgt[i] = tp[i] + this.offS[i]; }   // cible suivie exacte, décalage amorti
      this.logD += (this.goal.logD - this.logD) * k;
    }
    const D = Math.exp(this.logD), cp = Math.cos(this.pitch);
    const dir = [Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp];
    for (let i = 0; i < 3; i++) this.pos[i] = this.tgt[i] + dir[i] * D;
    this.camera.position.set(0, 0, 0);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(-dir[0], -dir[1], -dir[2]);
  }
  get distance() { return Math.exp(this.logD); }
}
