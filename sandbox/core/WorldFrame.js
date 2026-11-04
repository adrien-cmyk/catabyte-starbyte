// WorldFrame — positions du monde en double précision (mètres), origine flottante sur la caméra.
// Aucun Object3D ne reçoit jamais une position du monde : à chaque image, on écrit (monde − caméra) en float32.
// La caméra three.js reste à l'origine : précision maximale là où l'on regarde de près (racer, passage rasant).
export const AU = 1.495978707e11;
export const KM = 1e3;

export class WorldFrame {
  constructor() {
    this.cam = new Float64Array(3);        // position du monde de la caméra
    this.items = [];                       // { obj, pos: Float64Array(3) | () => Float64Array }
  }
  add(obj, pos) { this.items.push({ obj, pos }); return obj; }
  remove(obj) { this.items = this.items.filter((i) => i.obj !== obj); }
  // vecteur relatif caméra → point du monde (float64 → nombres JS), utile pour les shaders
  rel(p, out = [0, 0, 0]) { out[0] = p[0] - this.cam[0]; out[1] = p[1] - this.cam[1]; out[2] = p[2] - this.cam[2]; return out; }
  update() {
    for (const it of this.items) {
      const p = typeof it.pos === 'function' ? it.pos() : it.pos;
      it.obj.position.set(p[0] - this.cam[0], p[1] - this.cam[1], p[2] - this.cam[2]);
    }
  }
}

export function fmtDist(m) {
  const a = Math.abs(m);
  if (a >= 0.05 * AU) return (m / AU).toFixed(a >= AU ? 2 : 3) + ' UA';
  if (a >= 1e6) return Math.round(m / KM).toLocaleString('fr-CH') + ' km';
  if (a >= 1e3) return (m / KM).toFixed(1) + ' km';
  return Math.round(m) + ' m';
}
