// OrbitalWindows — fenêtres orbitales d'un système (Phase 2, étape 6), tirées des trajectoires réelles du flux.
// · Porte de périapse : jauge radiale à l'azimut où les racers passent au plus près, en trois bandes
//   (rasante < 1,08 R : chauffe et frottement de la haute atmosphère ; classique ; sûre > 1,22 R), chaque racer
//   marqué à sa périapse.
// · Porte des anneaux : bande dans le plan des anneaux, là où les racers le traversent, colorée selon la densité
//   réelle de l'anneau (ring.densityAt, la même donnée que le disque et la simulation) : divisions presque vides =
//   raccourcis sûrs, zones denses = passages risqués ; chaque racer marqué à son point de traversée.
// Géométrie dans le repère local de la géante (mètres), enfant de giant.group : elle suit l'inclinaison et la position.
import { THREE } from '../lib/sb3d-shim.js';
import { sampleAt } from '../core/Gravity.js';

const BANDS = [
  { from: 1.0, to: 1.08, col: 0xff6a4f, label: 'rasante · chauffe' },
  { from: 1.08, to: 1.22, col: 0xffc46a, label: 'classique' },
  { from: 1.22, to: 1.45, col: 0x9fd4ec, label: 'sûre' },
];
export const periRisk = (rR) => (rR < 1.08 ? 'élevé' : rR < 1.22 ? 'modéré' : 'faible');
export const ringRisk = (d) => (d < 0.08 ? 'faible' : d < 0.4 ? 'modéré' : 'élevé');

const densCol = (d) => new THREE.Color().setHSL(0.52 - 0.5 * Math.min(1, d), 0.85, 0.42 + 0.12 * (1 - d));

export class OrbitalWindows {
  constructor() { this.group = new THREE.Group(); this.labels = []; this.marks = []; }
  dispose() { this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); this.group.clear(); }
  // feed : flux de course ; sys : système (raceData) ; giant : GasGiant affiché (ring, R)
  build(feed, sys, giant) {
    this.dispose(); this.giant = giant;
    const R = giant.R, ring = giant.ring, P = [0, 0, 0], V = [0, 0, 0];
    const per = [], cross = [];
    for (const r of feed.racers) {
      const tr = feed.tracks[r.id], seg = tr.segs.find((s) => s.kind === 'system' && s.sys.id === sys.id);
      if (!seg) continue;
      sampleAt(seg.samples, seg.tp, P, V); per.push({ r, p: P.slice(), rR: Math.hypot(...P) / R });
      const c = tr.cps.find((x) => x.kind === 'ring' && x.sys === sys.id);
      if (c) { sampleAt(seg.samples, c.t, P, V); cross.push({ r, p: [P[0], 0, P[2]], rR: c.r, inRing: c.inRing, d: ring ? ring.densityAt(c.r) : 0 }); }
    }
    this.per = per; this.cross = cross;
    const az = (list) => { let x = 0, z = 0; for (const q of list) { const l = Math.hypot(q.p[0], q.p[2]); x += q.p[0] / l; z += q.p[2] / l; } const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
    const line = (pts, col, op = 0.9) => {
      const g = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(...p)));
      const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false }));
      m.renderOrder = 6; this.group.add(m); return m;
    };
    // porte de périapse : jauge radiale (bandes), graduations tous les 0,05 R, une marque par racer
    if (per.length) {
      const [ux, uz] = az(per), up = [0, 1, 0], side = [-uz, 0, ux];
      const y = per.reduce((a, q) => a + q.p[1], 0) / per.length;
      const at = (rR, o = 0, h = 0) => [ux * rR * R + side[0] * o, y + h, uz * rR * R + side[2] * o];
      // bandes en ruban (lisibles de loin), dans le plan de passage
      const rw = 0.012 * R;
      for (const b of BANDS) {
        const q = [at(b.from, -rw), at(b.from, rw), at(b.to, -rw), at(b.to, rw)].map((p) => new THREE.Vector3(...p));
        const g = new THREE.BufferGeometry().setFromPoints(q); g.setIndex([0, 1, 2, 1, 3, 2]);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: b.col, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
        m.renderOrder = 6; this.group.add(m);
      }
      const tick = [];
      for (let k = 0; k <= 9; k++) { const rR = 1 + k * 0.05, w = (k % 2 ? 0.006 : 0.012) * R; tick.push(at(rR, -w), at(rR, w)); }
      line(tick, 0x9fd4ec, 0.55);
      for (const q of per) {
        const w = 0.03 * R, h = 0.012 * R;
        line([at(q.rR, -w, 0), at(q.rR, w, 0), at(q.rR, 0, -h), at(q.rR, 0, h)], new THREE.Color(q.r.livery), 1);
      }
      this.periGate = { at, mid: at(1.2, 0.03 * R), end: at(1.62) };   // étiquette au-delà de la jauge
    }
    // porte des anneaux : bande colorée par la densité, de l'anneau intérieur à l'extérieur
    if (ring && cross.length) {
      const [ux, uz] = az(cross), side = [-uz, 0, ux], N = 360, w = 0.018 * R;
      const pos = new Float32Array((N + 1) * 2 * 3), col = new Float32Array((N + 1) * 2 * 3), idx = [];
      for (let i = 0; i <= N; i++) {
        const rR = ring.inner + (ring.outer - ring.inner) * i / N, d = ring.densityAt(rR), c = densCol(d);
        const x = ux * rR * R, z = uz * rR * R;
        pos.set([x - side[0] * w, 0, z - side[2] * w, x + side[0] * w, 0, z + side[2] * w], i * 6);
        col.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6);
        if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx);
      const band = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
      band.renderOrder = 6; this.group.add(band);
      const at = (rR, o = 0) => [ux * rR * R + side[0] * o, 0, uz * rR * R + side[2] * o];
      line([at(ring.inner, -w * 1.6), at(ring.outer, -w * 1.6), at(ring.inner, w * 1.6), at(ring.outer, w * 1.6)], 0x9fd4ec, 0.5);
      for (const q of cross) line([at(q.rR, -w * 2.6), at(q.rR, w * 2.6)], new THREE.Color(q.r.livery), 1);
      this.ringGate = { at, mid: at((ring.inner + ring.outer) / 2, w * 3), end: at(ring.outer + 0.12, w * 3) };
    }
    giant.group.add(this.group);
    return this;
  }
  // points d'ancrage des étiquettes, en coordonnées du monde (float64) : centre de la géante + rotation
  anchors() {
    const g = this.giant, q = g.group.quaternion, v = new THREE.Vector3(), out = [];
    const put = (p, kind) => { v.set(...p).applyQuaternion(q); out.push({ kind, p: [g.pos[0] + v.x, g.pos[1] + v.y, g.pos[2] + v.z] }); };
    if (this.periGate) put(this.periGate.end, 'peri');
    if (this.ringGate) put(this.ringGate.end, 'ring');
    return out;
  }
  // point milieu des deux portes (monde, float64) et leur écart : pour cadrer la caméra dessus
  frameWorld() {
    const g = this.giant, q = g.group.quaternion, v = new THREE.Vector3(), pts = [];
    for (const gate of [this.periGate, this.ringGate]) if (gate) { v.set(...gate.mid).applyQuaternion(q); pts.push([g.pos[0] + v.x, g.pos[1] + v.y, g.pos[2] + v.z]); }
    if (!pts.length) return null;
    const c = [0, 1, 2].map((i) => pts.reduce((a, p) => a + p[i], 0) / pts.length);
    const spread = pts.length > 1 ? Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1], pts[0][2] - pts[1][2]) : g.R * 0.5;
    return { c, spread };
  }
  // texte des fenêtres pour un racer (panneau de course)
  describe(id) {
    const R = this.giant.R, p = (this.per || []).find((q) => q.r.id === id), c = (this.cross || []).find((q) => q.r.id === id);
    const lines = [], fr = (x) => x.toFixed(2).replace('.', ',');
    if (p) lines.push(`Périapse ${fr(p.rR)} R · ${Math.round((p.rR - 1) * R / 1e3).toLocaleString('fr-CH')} km d'altitude · risque ${periRisk(p.rR)}`);
    if (c) lines.push(c.inRing ? `Anneaux à ${fr(c.rR)} R · densité ${Math.round(c.d * 100)} % · risque ${ringRisk(c.d)}` : `Plan des anneaux franchi à ${fr(c.rR)} R, hors de l'anneau`);
    return lines;
  }
}
export { BANDS };
