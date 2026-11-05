// Lunes de la sandbox (vraie échelle). Orbites dans le plan équatorial de la géante, hors des anneaux (2,32 R).
// Périodes : 3e loi de Kepler pour une géante de la masse de Jupiter (GM = 1,267e17 m³/s²).
const GM = 1.267e17;
const P = (r) => 2 * Math.PI * Math.sqrt(r * r * r / GM);
export function sandboxMoons(Rg) {
  const o = (k, phase, inc) => ({ r: k * Rg, period: P(k * Rg), phase, inc });
  return [
    { id: 'oro', name: 'Oro · lune volcanique', family: 'volcanic', radius: 1.82e6, seed: 'oro', orbit: o(3.4, 2.2, 0.01) },
    { id: 'kesh', name: 'Kesh · lune cratérisée', family: 'rocky', radius: 1.15e6, seed: 'kesh', orbit: o(5.6, 1.15, 0.03) },
    { id: 'ilva', name: 'Ilva · lune glacée', family: 'icy', radius: 1.56e6, seed: 'ilva', orbit: o(8.3, 0.25, 0.02) },
  ];
}
