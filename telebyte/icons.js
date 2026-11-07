// Icônes du Télébyte (SVG, aucun emoji dans l'interface, sauf la télé du mode TV). Une icône = un ou plusieurs
// tracés sur une grille de 16 × 16, dessinés en trait (stroke) de la couleur courante.
//   svg(name, cls?)            → balise <svg> à insérer dans la page (couleur : currentColor)
//   draw(ctx, name, x, y, s, color)   → même icône sur une toile 2D (centrée en x, y, taille s px)
const P = {
  speaker: ['M2.5 6h2.5l3.5-3v10l-3.5-3H2.5z', 'M11 5.5a3.5 3.5 0 0 1 0 5', 'M12.8 3.6a6 6 0 0 1 0 8.8'],
  muted: ['M2.5 6h2.5l3.5-3v10l-3.5-3H2.5z', 'M11 6l4 4', 'M15 6l-4 4'],
  captions: ['M1.8 3.5h12.4v9H1.8z', 'M4.5 7h3', 'M4.5 9.5h5', 'M9.5 7h2'],
  alert: ['M8 2.2 14.6 13.5H1.4z', 'M8 6.5v3.2', 'M8 11.6v.1'],
  wrench: ['M10.5 2.2a3.2 3.2 0 0 0-3 4.3L2.6 11.4a1.4 1.4 0 0 0 2 2l4.9-4.9a3.2 3.2 0 0 0 4.3-3l-1.9 1.4-1.8-.4-.4-1.8z'],
  fuel: ['M3 13.5V3.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v10', 'M2 13.5h9', 'M4.8 5h3.4', 'M10 6.5h1.6l1.4 1.6v3.6a1 1 0 0 0 2 0V6l-2-2'],
  flag: ['M3.5 14V2.5', 'M3.5 3h8l-1.8 2.8 1.8 2.7h-8'],
  star: ['M8 2.2l1.7 3.6 3.9.5-2.9 2.7.8 3.9L8 11l-3.5 1.9.8-3.9-2.9-2.7 3.9-.5z'],
  swap: ['M3 5.5h9', 'M9.5 3l2.5 2.5L9.5 8', 'M13 10.5H4', 'M6.5 8 4 10.5 6.5 13'],
  dive: ['M3 3c5 0 8 2.5 9.5 8.5', 'M9.5 11.8l3 .3.6-3'],
  ring: ['M8 8m-5.8 0a5.8 2.4 0 1 0 11.6 0a5.8 2.4 0 1 0-11.6 0', 'M8 8m-2.4 0a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0-4.8 0'],
  target: ['M8 8m-5.5 0a5.5 5.5 0 1 0 11 0a5.5 5.5 0 1 0-11 0', 'M8 8m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0'],
  sun: ['M8 8m-2.6 0a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0', 'M8 1.5v1.8', 'M8 12.7v1.8', 'M1.5 8h1.8', 'M12.7 8h1.8', 'M3.4 3.4l1.3 1.3', 'M11.3 11.3l1.3 1.3', 'M3.4 12.6l1.3-1.3', 'M11.3 4.7l1.3-1.3'],
  moon: ['M10.8 2.6a5.6 5.6 0 1 0 2.6 8.6 4.6 4.6 0 0 1-2.6-8.6z'],
  rocks: ['M4.5 5.5m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0', 'M11 4m-1.3 0a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0', 'M10 11m-2.6 0a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0', 'M3.5 12m-.9 0a.9.9 0 1 0 1.8 0a.9.9 0 1 0-1.8 0'],
  bolt: ['M9.2 1.8 3.8 9h3.6l-1 5.2L12.2 7H8.6z'],
  impact: ['M8 1.8l1.2 3.4 3.4-1.4-1.6 3.3 3.2 1.4-3.5.9.8 3.5-3.1-1.9-2.3 2.8-.4-3.6-3.5.2 2.5-2.5-2.5-2.5 3.5.2.4-3.6z'],
  play: ['M5 3.2v9.6L12.6 8z'],
  arrive: ['M2.5 8h10', 'M9.5 5l3 3-3 3'],
  ship: ['M8 1.8c1.6 1.4 2.4 3.6 2.4 6.2v3.4l2.4 1.8v1.2l-2.6-.8H5.8l-2.6.8v-1.2l2.4-1.8V8c0-2.6.8-4.8 2.4-6.2z', 'M8 5.6v2.6'],
  leave: ['M2.5 12.5 12.5 3.5', 'M7 3.5h5.5V9'],
};
export function svg(name, cls = 'ic') {
  const d = P[name] || P.target;
  return `<svg class="${cls}" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d.map((x) => `<path d="${x}"/>`).join('')}</svg>`;
}
const cache = {};
export function draw(ctx, name, x, y, s, color) {
  const d = P[name]; if (!d || typeof Path2D === 'undefined') return;
  const paths = cache[name] || (cache[name] = d.map((x) => new Path2D(x)));
  ctx.save(); ctx.translate(x - s / 2, y - s / 2); ctx.scale(s / 16, s / 16);
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const p of paths) ctx.stroke(p);
  ctx.restore();
}
