// Profils des quatre racers de la course pilote : vaisseaux du jeu (et Le Fulgurant du Blackmarket) en livrée de
// course. Repère glTF des modèles du jeu : proue vers +z, unités en mètres. Tuyères repérées sur le matériau moteur
// (M_KV_GLOW_MOTEUR) ou reprises des profils de ship3d.js quand le moteur forme un seul bloc.
// livery : couleur de course (traînée, balise, interface) ; tint : matériaux repeints pour la course.
const url = (f) => new URL('../assets/' + f, import.meta.url).href;
const PLUME_ION = [0x2a5cff, 0x3f86ff, 0x86c0ff, 0xe6f3ff, 0x9ccaff];          // ions bleus (SR-01, KV-01)
const PLUME_CHIMIQUE = [0xff5a1a, 0xff8a2a, 0xffc070, 0xfff2d8, 0xffc890];      // chimique orangé (TK-07)
const PLUME_OR = [0xff7a10, 0xffa030, 0xffd080, 0xfff4dc, 0xffc060];           // or (Le Fulgurant)

export const RACER_PROFILES = {
  // frégate SR-01 « Sentinelle » : 72 m, livrée d'origine rouge et blanche
  sr01: {
    url: url('sb_sr01_lod.glb'), embedded: url('sb_sr01_lod.glb.js'), length: 72,
    nozzles: [{ x: -2.3, y: 4.4, z: -34.4, r: 1.6 }, { x: 2.3, y: 4.4, z: -34.4, r: 1.6 }],
    plume: PLUME_ION, engine: [0.5, 0.78, 1.0], tint: {},
  },
  // cuirassé KV-01 « Kerath Lourd » : 1,3 km, six tuyères sur deux rangs, accents repeints en bleu de course
  kv01: {
    url: url('sb_kv01_lod.glb'), embedded: url('sb_kv01_lod.glb.js'), length: 1318,
    nozzles: [[100, 21], [52, 17]].flatMap(([y, r]) => [-44, 0, 44].map((x) => ({ x, y, z: -655, r }))),
    plume: PLUME_ION, engine: [0.45, 0.7, 1.0], tint: { M_KV_ARMOR_RED: '#2f5bd8' },
  },
  // tanker TK-07 « La Mule » : 29 m, réacteurs chimiques, coque repeinte en vert de course
  tk07: {
    url: url('sb_tk07_lod.glb'), embedded: url('sb_tk07_lod.glb.js'), length: 28.7,
    nozzles: [{ x: -2.5, y: 2.55, z: -14.4, r: 1.3 }, { x: 2.5, y: 2.55, z: -14.4, r: 1.3 }],
    plume: PLUME_CHIMIQUE, engine: [1.0, 0.74, 0.42], tint: { M_TK_ARMOR_JAUNE: '#3fa860' },
  },
  // Le Fulgurant (Blackmarket, catégorie sport) : 635 m, lance jaune et nacelles en lames, deux nacelles motrices
  sport: {
    url: url('fulgurant.glb.gz'), embedded: url('fulgurant.glb.gz.js'), length: 635,
    nozzles: [{ x: -40, y: 0, z: -302, r: 7 }, { x: 40, y: 0, z: -302, r: 7 }],
    plume: PLUME_OR, engine: [1.0, 0.7, 0.3], tint: {},
  },
};
