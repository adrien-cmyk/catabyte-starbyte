// Données de la course pilote (Phase 2) — JavaScript pur, partagé plus tard avec le serveur (Phase 3).
// Dix systèmes de l'univers Starbyte (adresse amas-secteur-système), quatre racers aux profils distincts.
// Toutes les grandeurs sont en unités SI (m, s, m/s) ; le repère local d'un système est celui de sa géante
// (plan équatorial XZ, axe de rotation Y).

const GM_JUP = 1.267e17, R_JUP = 7.0e7;
// masse d'une géante à partir de son rayon (densité proche de celle de Jupiter)
export const gmOfGiant = (R) => GM_JUP * (R / R_JUP) ** 2.2;

// moons : orbites en rayons de la géante (a), densité rho (kg/m³) ; starDist en UA ; sunAz / sunEl : direction du
// soleil dans le repère de la géante (azimut, élévation en radians)
const G = 6.674e-11, sphereGM = (r, rho) => G * (4 / 3) * Math.PI * r ** 3 * rho;

// systèmes de la course pilote d'origine (moteur v1–v2, trois étapes) : ne jamais les modifier (les éditions
// enregistrées et les références de test en dépendent)
export const RACE_SYSTEMS_V2 = [
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

// systèmes ajoutés pour le format à une dizaine d'étapes (moteur v3) : géantes plus variées, lunes plus serrées
// (entrée à 4 rayons de géante : les lunes utiles orbitent à moins de 4,5 rayons)
const NEW_SYSTEMS = [
  {
    id: 'orvane', name: 'Orvane', address: 'A-D-11', star: 'yellow', starDist: 4.1, giant: 'rose', R: 6.6e7, sunAz: 1.9, sunEl: 0.15,
    moons: [
      { id: 'ambre', name: 'Ambre · lune cratérisée', family: 'rocky', r: 1.05e6, a: 2.9, phase: 0.7, inc: 0.02, rho: 3200 },
      { id: 'sile', name: 'Sile · lune glacée', family: 'icy', r: 1.38e6, a: 4.2, phase: 3.3, inc: 0.03, rho: 1850 },
    ],
    ring: { inner: 1.28, outer: 2.05 },
    galPos: [5.6, 0.5, 7.2],
  },
  {
    id: 'talys', name: 'Talys', address: 'A-G-02', star: 'white', starDist: 11.0, giant: 'pale', R: 5.4e7, sunAz: -1.2, sunEl: 0.3,
    moons: [
      { id: 'neve', name: 'Nève · lune glacée', family: 'icy', r: 1.22e6, a: 3.1, phase: 5.1, inc: 0.05, rho: 1700 },
    ],
    ring: { inner: 1.4, outer: 1.9 },
    galPos: [12.8, -1.0, 10.4],
  },
  {
    id: 'sarn', name: 'Sarn', address: 'B-C-14', star: 'yellow', starDist: 6.3, giant: 'jade', R: 7.4e7, sunAz: 2.8, sunEl: 0.08,
    moons: [
      { id: 'brai', name: 'Brai · lune volcanique', family: 'volcanic', r: 1.6e6, a: 2.6, phase: 1.9, inc: 0.01, rho: 3550 },
      { id: 'lunn', name: 'Lunn · lune cratérisée', family: 'rocky', r: 0.95e6, a: 3.7, phase: 4.4, inc: 0.04, rho: 3100 },
    ],
    ring: { inner: 1.25, outer: 2.2 },
    galPos: [21.6, 0.7, 9.1],
  },
  {
    id: 'mirr', name: 'Mirr', address: 'B-B-06', star: 'red', starDist: 1.3, giant: 'copper', R: 7.8e7, sunAz: -2.2, sunEl: 0.1,
    moons: [
      { id: 'forge', name: 'Forge · lune volcanique', family: 'volcanic', r: 1.7e6, a: 3.2, phase: 2.6, inc: 0.02, rho: 3600 },
    ],
    ring: { inner: 1.2, outer: 2.15 },
    galPos: [26.4, -0.4, 1.6],
  },
  {
    id: 'quell', name: 'Quell', address: 'B-E-09', star: 'white', starDist: 8.8, giant: 'violet', R: 6.0e7, sunAz: 0.2, sunEl: 0.25,
    moons: [
      { id: 'iris', name: 'Iris · lune glacée', family: 'icy', r: 1.1e6, a: 2.8, phase: 0.3, inc: 0.03, rho: 1750 },
      { id: 'gravel', name: 'Gravel · lune cratérisée', family: 'rocky', r: 1.25e6, a: 4.0, phase: 3.8, inc: 0.02, rho: 3250 },
    ],
    ring: { inner: 1.32, outer: 2.0 },
    galPos: [24.1, 1.3, -7.4],
  },
  {
    id: 'ostra', name: 'Ostra', address: 'C-A-05', star: 'yellow', starDist: 7.4, giant: 'cream', R: 6.8e7, sunAz: -0.9, sunEl: 0.18,
    moons: [
      { id: 'perle', name: 'Perle · lune glacée', family: 'icy', r: 1.45e6, a: 3.5, phase: 2.1, inc: 0.02, rho: 1800 },
    ],
    ring: { inner: 1.22, outer: 2.6 },
    galPos: [15.6, -0.9, -11.2],
  },
  {
    id: 'ivene', name: 'Ivène', address: 'C-D-13', star: 'red', starDist: 0.7, giant: 'ember', R: 8.4e7, sunAz: 1.4, sunEl: 0.05,
    moons: [
      { id: 'scorie', name: 'Scorie · lune volcanique', family: 'volcanic', r: 1.5e6, a: 2.7, phase: 5.6, inc: 0.03, rho: 3450 },
      { id: 'givre', name: 'Givre · lune glacée', family: 'icy', r: 1.0e6, a: 3.9, phase: 1.2, inc: 0.05, rho: 1650 },
    ],
    ring: { inner: 1.26, outer: 2.1 },
    galPos: [6.2, 0.6, -9.6],
  },
];
// parcours de démonstration (et réserve du serveur, qui en tire l'ordre de chaque édition) : dix systèmes
const byId = Object.fromEntries([...RACE_SYSTEMS_V2, ...NEW_SYSTEMS].map((x) => [x.id, x]));
export const RACE_SYSTEMS = ['kerath', 'ivene', 'vessa', 'ostra', 'quell', 'mirr', 'nox', 'sarn', 'talys', 'orvane'].map((id) => byId[id]);


// profils : rp = périapse visée (rayons de géante), dv = poussée à la périapse (m/s, effet Oberth),
// warp = facteur de vitesse interstellaire (1 = référence), vInf = vitesse d'arrivée de croisière (m/s),
// risk = caractère du pilote (0 prudent … 1 casse-cou) : il pèse sur le choix de trajectoire à chaque système (DemoFeed.choosePlan)
// tough = fragilité de la coque (< 1 : encaisse la chauffe et rate moins ses plongées ; > 1 : fragile).
// Équilibre vérifié (v3, dix systèmes, 60 éditions) : chacun gagne (de 10 à 19 victoires), écart médian 1er–2e ≈ 13 min.
export const RACERS = [
  { id: 'sentinelle', name: 'Sentinelle', ship: 'sr01', livery: '#e8394a', rp: 1.12, dv: 900, warp: 1.00, vInf: 1.20e4, risk: 0.45, tough: 1 },
  { id: 'cuirasse', name: 'Kerath Lourd', ship: 'kv01', livery: '#5b86ff', rp: 1.30, dv: 1300, warp: 0.96, vInf: 1.15e4, risk: 0.15, tough: 0.6 },
  { id: 'mule', name: 'La Mule', ship: 'tk07', livery: '#56c878', rp: 1.20, dv: 650, warp: 1.05, vInf: 1.18e4, risk: 0.3, tough: 0.8 },
  { id: 'fulgurant', name: 'Le Fulgurant', ship: 'sport', livery: '#f2c230', rp: 1.06, dv: 950, warp: 1.0, vInf: 1.2e4, risk: 0.65, tough: 1.25 },
];

// format d'origine (moteur v2) : 3 systèmes, longues étapes ; gardé pour les tests de rejeu
export const PILOT_V2 = { id: 'pilote-1', name: 'Grande Fronde · course pilote', seed: 'fronde-52', legHours: 20.5, entryR: 9, nominalHours: 76, v: 2 };

// format de la course (moteur v3) : 72 h simulées, une dizaine de systèmes, étapes interstellaires courtes entre eux ;
// usure, carburant et temps perdus répartis sur les dix passages (wear, lossK)
export const PILOT = {
  id: 'pilote-1', name: 'Grande Fronde · course pilote', seed: 'fronde-21',    // démo : tous les faits de course, 2 surchauffes, 3 racers en 8 min
  legHours: 3.4,                               // durée de référence d'une étape interstellaire
  entryR: 4,                                   // entrée et sortie d'un système à 4 rayons de géante
  nominalHours: 76,                            // durée annoncée d'une édition (la vraie fin reste secrète jusqu'à l'arrivée)
  wear: 0.4, lossK: 0.5,                       // part de l'usure, du carburant et des temps perdus par passage (v3)
  gapRef: 1800,                                // retard (s) qui pousse un pilote à tout tenter (v3 ; étapes courtes)
  v: 3,                                        // version du moteur ; une édition sans v se rejoue en v1, v: 2 en v2
};

export { sphereGM };
