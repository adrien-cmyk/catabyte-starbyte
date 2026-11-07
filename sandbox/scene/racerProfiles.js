// Profils des quatre racers : les modèles de course définitifs (Racer 07, Monoreactor 88, Bidon 52, Fulgur 07), les
// mêmes que les plans 3D (telebyte/plans3d/models, réduits à ~30 k triangles). Repère glTF : proue vers +z, mètres.
// Tuyères : centre et taille du matériau moteur (M_KV_GLOW_MOTEUR), mesurés sur les modèles ; un bloc moteur large
// porte deux tuyères. Les clés (sr01, kv01, tk07, sport) sont celles des éditions enregistrées : ne pas les renommer.
// livery : couleur de course (traînée, balise, interface) ; tint : matériaux repeints pour la course.
const url = (f) => new URL('../../telebyte/plans3d/models/' + f, import.meta.url).href;
const PLUME_ION = [0x2a5cff, 0x3f86ff, 0x86c0ff, 0xe6f3ff, 0x9ccaff];          // ions bleus (SR-01, KV-01)
const PLUME_CHIMIQUE = [0xff5a1a, 0xff8a2a, 0xffc070, 0xfff2d8, 0xffc890];      // chimique orangé (TK-07)
const PLUME_OR = [0xff7a10, 0xffa030, 0xffd080, 0xfff4dc, 0xffc060];           // or (Le Fulgurant)

export const RACER_PROFILES = {
  // « Sentinelle » : Racer 07, 35 m, deux tuyères ioniques au-dessus de la poupe
  sr01: {
    url: url('racer07_shot.glb.gz'), embedded: url('racer07_shot.glb.gz.js'), length: 34.6, model: 'Racer 07',
    nozzles: [{ x: -2.87, y: 2.55, z: -15.95, r: 0.6 }, { x: 2.87, y: 2.55, z: -15.95, r: 0.6 }],   // réacteurs aux extrémités de la poupe (mesurés)
    plume: PLUME_ION, engine: [0.5, 0.78, 1.0], tint: {},
  },
  // « Kerath Lourd » : Monoreactor 88, 14 m, un seul gros réacteur
  kv01: {
    url: url('monoreactor88_shot.glb.gz'), embedded: url('monoreactor88_shot.glb.gz.js'), length: 14.0, model: 'Monoreactor 88',
    nozzles: [{ x: 0, y: 0.08, z: -7.0, r: 1.9 }],                     // la grande cloche (Ø 4,7 m), pas le seul cœur lumineux
    plume: PLUME_ION, engine: [0.45, 0.7, 1.0], tint: {},
  },
  // « La Mule » : Bidon 52, 48 m, réacteurs chimiques
  tk07: {
    url: url('bidon52_shot.glb.gz'), embedded: url('bidon52_shot.glb.gz.js'), length: 47.7, model: 'Bidon 52',
    nozzles: [-1, 1].flatMap((sx) => [-3.49, 4.58].map((y) => ({ x: sx * 4.66, y, z: -21.44, r: 1.0 }))),   // quatre nacelles aux coins (mesurées)
    plume: PLUME_CHIMIQUE, engine: [1.0, 0.74, 0.42], tint: {},
  },
  // « Le Fulgurant » : Fulgur 07, 100 m, deux nacelles motrices
  sport: {
    url: url('fulgur07_shot.glb.gz'), embedded: url('fulgur07_shot.glb.gz.js'), length: 100, model: 'Fulgur 07',
    nozzles: [{ x: -12.4, y: -0.04, z: -47.6, r: 3.7 }, { x: 12.4, y: -0.04, z: -47.6, r: 3.7 }],   // mesurées
    plume: PLUME_OR, engine: [1.0, 0.7, 0.3], tint: {},
  },
};
