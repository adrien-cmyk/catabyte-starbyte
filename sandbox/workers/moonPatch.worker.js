// Construit les parcelles de relief des lunes hors du fil principal (aucun gel de l'affichage).
import { MoonRelief, buildPatch } from '../bodies/moonRelief.js';
const reliefs = new Map();
self.onmessage = (e) => {
  const m = e.data;
  let r = reliefs.get(m.key);
  if (!r) { r = new MoonRelief(m.params); reliefs.set(m.key, r); }
  const out = buildPatch(r, m.f, m.s0, m.t0, m.s1, m.t1, m.res, m.center);
  self.postMessage({ id: m.id, ...out }, [out.pos.buffer, out.nor.buffer, out.dir.buffer, out.msk.buffer]);
};
