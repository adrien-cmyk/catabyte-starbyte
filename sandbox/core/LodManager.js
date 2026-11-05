// LodManager — niveaux de détail pilotés par la qualité du jeu (perf.js : 0 Haute, 1 Moyenne, 2 Économe, 3 Minimale).
// Dans le jeu, il suit window.SBPerf.level en direct (la qualité automatique baisse quand l'appareil peine) ; dans le
// labo, ?q=0..3 ou le sélecteur du panneau. Les réglages « à chaud » sont appliqués tout de suite ; ceux qui
// tiennent à la géométrie construite (finesse des sphères, nombre de formes d'astéroïdes, taille des parcelles de
// lune) ne changent qu'au rechargement, comme les moteurs 3D du jeu (perf.js : MSAA au rechargement suivant).
//
// Budgets visés par niveau (plan technique §9) et réglages correspondants. rockPx : tailles à l'écran (px) au-delà
// desquelles un rocher passe au détail 0 (1 280 triangles), 1 (320), 2 (20), ou reste un point ; le relief fin est
// porté par l'éclairage, donc le détail 1 suffit jusqu'à ~110 px. rockShare : part du budget de triangles des rochers.
export const BUDGETS = [
  { name: 'Haute', dpr: 2, calls: 400, tris: 1.5e6, bloom: true, giantOct: 10, crossfade: true, moonSplit: 0.32, rockPx: [110, 14, 3, 0.45], rockKeep: 1, dust: 1, rockShare: 0.7 },
  { name: 'Moyenne', dpr: 1.25, calls: 250, tris: 6e5, bloom: true, giantOct: 8, crossfade: true, moonSplit: 0.42, rockPx: [140, 18, 4, 0.7], rockKeep: 0.75, dust: 0.7, rockShare: 0.6 },
  { name: 'Économe', dpr: 1, calls: 150, tris: 3e5, bloom: false, giantOct: 6, crossfade: false, moonSplit: 0.62, rockPx: [180, 24, 5.5, 1.0], rockKeep: 0.5, dust: 0.45, rockShare: 0.5 },
  { name: 'Minimale', dpr: 0.75, calls: 120, tris: 2e5, bloom: false, giantOct: 5, crossfade: false, moonSplit: 0.85, rockPx: [240, 32, 8, 1.6], rockKeep: 0.33, dust: 0.25, rockShare: 0.4 },
];

export class LodManager {
  constructor(initial = 0) {
    this.level = initial; this.targets = []; this._last = -1;
  }
  get budget() { return BUDGETS[this.level]; }
  // fn(budget, level) appelée à chaque changement de niveau (et une fois à l'enregistrement)
  register(fn) { this.targets.push(fn); fn(this.budget, this.level); return fn; }
  set(level) {
    level = Math.max(0, Math.min(3, level | 0));
    if (level === this.level && this._last === level) return;
    this.level = this._last = level;
    for (const f of this.targets) f(this.budget, level);
  }
  // à appeler de temps en temps : suit la qualité automatique du jeu quand elle existe
  poll() { if (window.SBPerf) this.set(window.SBPerf.level); }
}
