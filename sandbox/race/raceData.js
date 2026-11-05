// Données de la course pilote (Phase 2) — JavaScript pur, partagé plus tard avec le serveur (Phase 3).
// Trois vrais systèmes de l'univers Starbyte (adresse amas-secteur-système), quatre racers aux profils distincts.
// Toutes les grandeurs sont en unités SI (m, s, m/s) ; le repère local d'un système est celui de sa géante
// (plan équatorial XZ, axe de rotation Y).

const GM_JUP = 1.267e17, R_JUP = 7.0e7;
// masse d'une géante à partir de son rayon (densité proche de celle de Jupiter)
export const gmOfGiant = (R) => GM_JUP * (R / R_JUP) ** 2.2;

// moons : orbites en rayons de la géante (a), densité rho (kg/m³) ; starDist en UA ; sunAz / sunEl : direction du
// soleil dans le repère de la géante (azimut, élévation en radians)
const G = 6.674e-11, sphereGM = (r, rho) => G * (4 / 3) * Math.PI * r ** 3 * rho;

export const RACE_SYSTEMS = [
  {
    id: 'kerath', name: 'Kerath', address: 'A-C-07', star: 'yellow', starDist: 5.2, giant: 'amber', R: 7.0e7, sunAz: -2.54, sunEl: 0.12,
    moons: [
      { id: 'oro', name: 'Oro · lune volcanique', family: 'volcanic', r: 1.82e6, a: 3.4, phase: 2.2, inc: 0.01, rho: 3500 },
      { id: 'kesh', name: 'Kesh · lune cratérisée', family: 'rocky', r: 1.15e6, a: 5.6, phase: 1.15, inc: 0.03, rho: 3300 },
      { id: 'ilva', name: 'Ilva · lune glacée', family: 'icy', r: 1.56e6, a: 8.3, phase: 0.25, inc: 0.02, rho: 1900 },
    ],
    ring: { inner: 1.24, outer: 2.32 },
    galPos: [0, 0, 0],                         // position galactique (années-lumière) pour la vue univers
  },
  {
    id: 'vessa', name: 'Vessa', address: 'A-F-12', star: 'white', starDist: 9.5, giant: 'blue', R: 6.2e7, sunAz: 0.6, sunEl: 0.22,
    moons: [
      { id: 'tirn', name: 'Tirn · lune glacée', family: 'icy', r: 1.30e6, a: 4.1, phase: 0.8, inc: 0.04, rho: 1800 },
      { id: 'sael', name: 'Saël · lune cratérisée', family: 'rocky', r: 0.9e6, a: 6.8, phase: 3.9, inc: 0.02, rho: 3000 },
    ],
    ring: { inner: 1.3, outer: 2.1 },
    galPos: [9.4, 1.2, -3.1],
  },
  {
    id: 'nox', name: 'Nox', address: 'B-A-03', star: 'red', starDist: 0.9, giant: 'black', R: 8.1e7, sunAz: -0.4, sunEl: 0.06,
    moons: [
      { id: 'cendre', name: 'Cendre · lune volcanique', family: 'volcanic', r: 1.4e6, a: 3.8, phase: 4.6, inc: 0.02, rho: 3400 },
    ],
    ring: { inner: 1.22, outer: 2.0 },
    galPos: [17.8, -0.6, 2.4],
  },
];

// profils : rp = périapse visée (rayons de géante), dv = poussée à la périapse (m/s, effet Oberth),
// warp = facteur de vitesse interstellaire (1 = référence), risk = goût du risque (fenêtres plus rasantes)
export const RACERS = [
  { id: 'sentinelle', name: 'Sentinelle', ship: 'sr01', livery: '#e8394a', rp: 1.12, dv: 900, warp: 1.00, vInf: 1.20e4 },
  { id: 'cuirasse', name: 'Kerath Lourd', ship: 'kv01', livery: '#5b86ff', rp: 1.30, dv: 1300, warp: 0.96, vInf: 1.15e4 },
  { id: 'mule', name: 'La Mule', ship: 'tk07', livery: '#56c878', rp: 1.20, dv: 650, warp: 1.05, vInf: 1.18e4 },
  { id: 'fulgurant', name: 'Le Fulgurant', ship: 'sport', livery: '#f2c230', rp: 1.06, dv: 1000, warp: 1.02, vInf: 1.25e4 },
];

// format de la course pilote (brief §5) : 72 h simulées, 3 systèmes, étapes interstellaires entre eux
export const PILOT = {
  id: 'pilote-1', name: 'Grande Fronde · course pilote', seed: 'fronde-pilote-1',
  legHours: 20.5,                              // durée de référence d'une étape interstellaire
  entryR: 9,                                   // entrée et sortie d'un système à 9 rayons de géante
};

export { sphereGM };
