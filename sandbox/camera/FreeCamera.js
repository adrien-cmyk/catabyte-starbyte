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
    this._bind();
  }
  _bind() {
    const d = this.dom, pts = new Map(); let pinch0 = 0, logD0 = 0;
    d.addEventListener('pointerdown', (e) => { if (!this.enabled) return; d.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); logD0 = this.goal.logD; } });
    d.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const p = pts.get(e.pointerId), dx = e.clientX - p[0], dy = e.clientY - p[1];
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) { this.goal.yaw -= dx * 0.005; this.goal.pitch = THREE.MathUtils.clamp(this.goal.pitch + dy * 0.004, -1.5, 1.5); }
      else if (pts.size === 2) { const [a, b] = [...pts.values()]; const dd = Math.hypot(a[0] - b[0], a[1] - b[1]); this.goal.logD = this._clampLog(logD0 - Math.log(dd / pinch0) * 1.6); }
    });
    const up = (e) => pts.delete(e.pointerId);
    d.addEventListener('pointerup', up); d.addEventListener('pointercancel', up);
    d.addEventListener('wheel', (e) => { if (!this.enabled) return; e.preventDefault(); this.goal.logD = this._clampLog(this.goal.logD + e.deltaY * 0.0022); }, { passive: false });
  }
  _clampLog(l) { const min = this.target ? Math.log(this.target.minDist) : 0; return THREE.MathUtils.clamp(l, min, Math.log(3e12)); }
  // vise une cible ; d (mètres) facultatif ; dur = durée de la transition (s)
  setTarget(target, { dist, yaw, pitch, dur = 0 } = {}) {
    const from = this.target ? Float64Array.from(this.tgt) : null;
    this.target = target;
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
      for (let i = 0; i < 3; i++) this.tgt[i] = tr.from[i] + (tp[i] - tr.from[i]) * e;
      // la distance passe par un point haut (on recule pour voir les deux cibles) puis plonge : zoom accéléré
      const lift = Math.log(Math.hypot(tp[0] - tr.from[0], tp[1] - tr.from[1], tp[2] - tr.from[2]) + 1);
      const base = tr.logFrom + (this.goal.logD - tr.logFrom) * e;
      this.logD = Math.max(base, base + (lift - base) * Math.sin(Math.PI * e) * 0.9);
      if (tr.t >= 1) this.tr = null;
    } else {
      this.tgt.set(tp);
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
