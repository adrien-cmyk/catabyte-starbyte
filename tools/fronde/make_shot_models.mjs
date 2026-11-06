// Modèles allégés pour les plans 3D du Télébyte (GDD_PLANS_3D) : à partir des modèles « vitrine » ou « lod_carte »
// du jeu, une version de 10 à 16 k triangles, sans normales (recalculées au chargement avec des arêtes franches :
// toCreasedNormals), textures ramenées à 512 px, maillages fusionnés par matériau, compressée en gzip (.glb.gz).
// Usage : DEPS=/chemin/node_modules node tools/fronde/make_shot_models.mjs <entrée.glb> <sortie.glb.gz> [triangles visés]
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const req = createRequire((process.env.DEPS || './node_modules') + '/');
const { NodeIO } = await import(req.resolve('@gltf-transform/core'));
const { ALL_EXTENSIONS } = await import(req.resolve('@gltf-transform/extensions'));
const F = await import(req.resolve('@gltf-transform/functions'));
const { MeshoptSimplifier } = await import(req.resolve('meshoptimizer'));
const sharp = req('sharp');
const [, , src, out, target = '14000'] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const tris = () => { let t = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { const i = p.getIndices(); t += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3; } return Math.round(t); };
const t0 = tris();
// normales et tangentes retirées : sinon les arêtes vives empêchent toute simplification
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { for (const a of ['NORMAL', 'TANGENT']) { const x = p.getAttribute(a); if (x) p.setAttribute(a, null); } }
await doc.transform(F.dedup(), F.prune(), F.weld({ tolerance: 0.0002 }));
const ratio = Math.min(1, +target / t0);
await doc.transform(F.simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.02, lockBorder: false }));
if (tris() > +target * 1.3) await doc.transform(F.simplify({ simplifier: MeshoptSimplifier, ratio: +target / tris(), error: 0.06, lockBorder: false }));
await doc.transform(F.flatten(), F.join(), F.prune(), F.dedup(), F.textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [512, 512], quality: 80 }));
const glb = await io.writeBinary(doc);
const gz = gzipSync(Buffer.from(glb), { level: 9 });
writeFileSync(out, gz);
console.log(`${src.split('/').pop()} : ${t0} → ${tris()} triangles, ${(glb.length / 1e6).toFixed(2)} Mo, gzip ${(gz.length / 1e6).toFixed(2)} Mo → ${out}`);
