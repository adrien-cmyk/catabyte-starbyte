// Génère la copie serveur du moteur de course (un seul fichier, sans import) : server/fronde-tick/engine.js.
// Le moteur vit dans sandbox/core/Gravity.js, sandbox/race/raceData.js, sandbox/race/engine.js ; cette copie est celle
// que la fonction Deno fronde-tick importe. Ne jamais la modifier à la main : retoucher le moteur, relancer ce script,
// relancer tools/fronde/engine_test.mjs (SERVER=server/fronde-tick/engine.js), redéployer fronde-tick.
// Usage : node tools/fronde/sync_engine.mjs [sortie]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
const root = new URL('../../', import.meta.url);
const MODS = [['gravity', 'sandbox/core/Gravity.js'], ['raceData', 'sandbox/race/raceData.js'], ['engine', 'sandbox/race/engine.js']];
const NAME = { './core/Gravity.js': 'gravity', '../core/Gravity.js': 'gravity', './raceData.js': 'raceData', './engine.js': 'engine' };
const out = process.argv[2] || 'server/fronde-tick/engine.js';

const parts = [], srcHash = createHash('sha256');
for (const [id, file] of MODS) {
  let s = readFileSync(new URL(file, root), 'utf8'); srcHash.update(s);
  const names = [];
  // import { a, b as c } from './x.js'  →  const { a, b: c } = __m.x;
  s = s.replace(/^import\s*\{([^}]*)\}\s*from\s*'([^']+)';?\s*$/gm, (_, list, from) => {
    const m = NAME[from]; if (!m) throw new Error(`${file} : import inconnu ${from}`);
    return `const {${list.replace(/\s+as\s+/g, ': ')}} = __m.${m};`;
  });
  // export { a, b }  →  enregistrement
  s = s.replace(/^export\s*\{([^}]*)\};?\s*$/gm, (_, list) => { names.push(...list.split(',').map((x) => x.trim()).filter(Boolean)); return ''; });
  // export const|let|function|class NOM  →  déclaration ordinaire + enregistrement
  s = s.replace(/^export\s+(const|let|function|class)\s+([A-Za-z_$][\w$]*)/gm, (_, kw, n) => { names.push(n); return `${kw} ${n}`; });
  // export const { a, b } = …  (déstructuration) : non utilisé dans le moteur ; refusé pour rester simple
  if (/^export\s/m.test(s)) throw new Error(`${file} : forme d'export non gérée`);
  parts.push(`// ── ${file} ──\n__m.${id} = (() => {\n${s}\nreturn { ${[...new Set(names)].join(', ')} };\n})();`);
}
const api = ['runRace', 'digest', 'planOf', 'plansMap', 'choosePlan', 'passSystem', 'rngOf', 'rng2', 'hazardsOf', 'routeOf', 'FLARE_P', 'ENGINE_V', 'PLAN_LABEL', 'FUEL_PER_DV', 'FUEL_PER_LEG', 'V_REF'];
const data = ['RACE_SYSTEMS', 'RACE_SYSTEMS_V2', 'RACERS', 'PILOT', 'PILOT_V2', 'gmOfGiant', 'sphereGM'];
// références d'autocontrôle (5 graines) : la fonction serveur vérifie qu'elle calcule les mêmes courses que le jeu
const ref = JSON.parse(readFileSync(new URL('tools/fronde/engine_ref_v3.json', root), 'utf8'));   // le serveur crée des éditions v3
const REF5 = Object.fromEntries(Object.entries(ref).slice(0, 5));
const engineHash = srcHash.copy().digest('hex').slice(0, 16);
const code = `// STARBYTE — moteur de course de la Grande Fronde, COPIE GÉNÉRÉE par tools/fronde/sync_engine.mjs (dépôt catabyte-starbyte).
// Ne pas modifier ici : retoucher sandbox/race/engine.js (ou Gravity.js, raceData.js), relancer le script, redéployer fronde-tick.
// Source : ${engineHash} (empreinte des fichiers du moteur)
// @ts-nocheck
const __m = {};
${parts.join('\n\n')}

export const { ${api.join(', ')} } = __m.engine;
export const { ${data.join(', ')} } = __m.raceData;
export const ENGINE_HASH = '${engineHash}';
// empreintes de référence (sha-256 tronqué de digest(runRace)) calculées par tools/fronde/engine_test.mjs
export const ENGINE_REF = ${JSON.stringify(REF5)};
`;
mkdirSync(new URL(dirname(out) + '/', root), { recursive: true });
writeFileSync(new URL(out, root), code);
console.log('écrit', out, (code.length / 1024).toFixed(1), 'Kio');
// copies .ts pour le tableau de bord Supabase (il nomme les fichiers en .ts) : engine.ts, edition.ts (imports en .ts)
if (out.endsWith('/engine.js')) {
  const dir = out.slice(0, -'engine.js'.length);
  writeFileSync(new URL(dir + 'engine.ts', root), code);
  const ed = readFileSync(new URL(dir + 'edition.js', root), 'utf8').replace("from './engine.js'", "from './engine.ts'");
  writeFileSync(new URL(dir + 'edition.ts', root), '// @ts-nocheck\n// COPIE GÉNÉRÉE de edition.js par tools/fronde/sync_engine.mjs (import en .ts pour Supabase) — ne pas modifier ici.\n' + ed);
  console.log('écrit', dir + 'engine.ts', dir + 'edition.ts');
}
