// Graine déterministe : copie exacte de _hashSeed (FNV-1a) et _mulberry32 du jeu (github_upload/index.html).
// Ne pas modifier : la future simulation serveur doit retrouver les mêmes tirages.
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t ^= t + (Math.imul(t ^ (t >>> 7), t | 61) >>> 0);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rngFor = (key) => mulberry32(hashSeed('FRONDE:' + key));
