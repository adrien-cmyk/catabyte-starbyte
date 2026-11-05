// Test du moteur partagé (Phase 3, étape 1) — déterminisme et rejeu.
//   1. 40 éditions simulées : l'empreinte des temps de passage doit être celle de référence (engine_ref.json) ;
//   2. rejeu à partir des plans sérialisés (JSON, ce que publie le serveur) : même empreinte ;
//   3. rejeu partiel (plans du premier système seulement) : chaque racer s'arrête à l'entrée du deuxième ;
//   4. (option SERVER=chemin) la copie serveur générée donne les mêmes empreintes.
// Usage : node tools/fronde/engine_test.mjs [--update]
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const here = new URL('.', import.meta.url);
const E = await import(new URL('../../sandbox/race/engine.js', here));
const D = await import(new URL('../../sandbox/race/raceData.js', here));
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const REF = new URL('engine_ref.json', here), update = process.argv.includes('--update');
const ref = existsSync(REF) ? JSON.parse(readFileSync(REF, 'utf8')) : {};
const out = {}; let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('ÉCHEC', m); } };
for (let i = 1; i <= 40; i++) {
  const seed = i === 1 ? 'fronde-222' : 'test-' + i, pilot = { ...D.PILOT, seed }, args = { systems: D.RACE_SYSTEMS, racers: D.RACERS, pilot };
  const full = E.runRace(args), d = sha(E.digest(full)); out[seed] = d;
  ok(full.complete, `${seed} : course incomplète`);
  if (ref[seed] && !update) ok(ref[seed] === d, `${seed} : empreinte ${d} ≠ référence ${ref[seed]} (le moteur a changé)`);
  const plans = JSON.parse(JSON.stringify(E.plansMap(full.revealed.map((x) => ({ ...x, plan: E.planOf(x.plan) })))));
  ok(sha(E.digest(E.runRace({ ...args, plans }))) === d, `${seed} : le rejeu des plans diffère`);
  const first = Object.fromEntries(Object.entries(plans).filter(([k]) => k.endsWith('|' + D.RACE_SYSTEMS[0].id)));
  const part = E.runRace({ ...args, plans: first });
  ok(!part.complete && D.RACERS.every((r) => part.tracks[r.id].segs.filter((s) => s.kind === 'system').length === 1), `${seed} : rejeu partiel incorrect`);
}
if (process.env.SERVER) {
  const S = await import(pathToFileURL(process.env.SERVER).href);
  for (const seed of Object.keys(out)) { const pilot = { ...D.PILOT, seed }; ok(sha(S.digest(S.runRace({ systems: S.RACE_SYSTEMS, racers: S.RACERS, pilot }))) === out[seed], `${seed} : la copie serveur diffère`); }
}
if (update || !existsSync(REF)) { writeFileSync(REF, JSON.stringify(out, null, 1) + '\n'); console.log('références écrites', Object.keys(out).length); }
console.log(fail ? `${fail} échec(s)` : `ok : 40 éditions, rejeu complet et partiel identiques${process.env.SERVER ? ', copie serveur identique' : ''}`);
process.exit(fail ? 1 : 0);
