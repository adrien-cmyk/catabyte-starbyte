// Moteur 3D : dans le jeu, window.SB3D (three.js r186 embarqué par planet3d.js) ; hors du jeu, la même révision
// chargée par l'importmap de la page. Le reste de la sandbox ne lit que cet objet : aucune seconde copie de three.js en jeu.
let L = window.SB3D;
if (!L) {
  const [THREE, { EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }, { GLTFLoader }] = await Promise.all([
    import('three'),
    import('three/addons/postprocessing/EffectComposer.js'),
    import('three/addons/postprocessing/RenderPass.js'),
    import('three/addons/postprocessing/UnrealBloomPass.js'),
    import('three/addons/postprocessing/OutputPass.js'),
    import('three/addons/loaders/GLTFLoader.js'),
  ]);
  L = window.SB3D = { THREE, EffectComposer, RenderPass, UnrealBloomPass, OutputPass, GLTFLoader };
}
export const SB3D = L;
export const THREE = L.THREE;
// niveau de qualité du jeu (perf.js) : 0 Haute … 3 Minimale ; hors du jeu, ?q=0..3 dans l'adresse
export function qualityLevel() {
  if (window.SBPerf) return window.SBPerf.level;
  const q = parseInt(new URLSearchParams(location.search).get('q') || '0', 10);
  return Math.max(0, Math.min(3, q || 0));
}
