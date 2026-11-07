// Test du moteur partagé (Phase 3, étape 1) — déterminisme et rejeu.
//   1. 40 éditions simulées : l'empreinte des temps de passage doit être celle de référence (engine_ref.json) ;
//   2. rejeu à partir des plans sérialisés (JSON, ce que publie le serveur) : même empreinte ;
//   3. rejeu partiel (plans du premier système seulement) : chaque racer s'arrête à l'entrée du deuxième ;
//   4. (option SERVER=chemin) la copie serveur générée donne les mêmes empreintes.
// Trois versions du moteur : v1 (éditions créées avant la Phase 4 : pilot sans v, références engine_ref.json) et v2
// (événements de course : engine_ref_v2.json), sur les 3 systèmes d'origine — ces références ne doivent JAMAIS changer ;
// v3 (une dizaine de systèmes, étapes courtes : engine_ref_v3.json).
// Usage : node tools/fronde/engine_test.mjs [--update]
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const here = new URL('.', import.meta.url);
const E = await import(new URL('../../sandbox/race/engine.js', here));
const D = await import(new URL('../../sandbox/race/raceData.js', here));
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const update = process.argv.includes('--update');
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('ÉCHEC', m); } };
const outs = {};
const SYS = (v, M) => v >= 3 ? M.RACE_SYSTEMS : M.RACE_SYSTEMS_V2, PIL = (v, M) => v >= 3 ? M.PILOT : M.PILOT_V2;
for (const v of [1, 2, 3]) {
  const REF = new URL(['engine_ref.json', 'engine_ref_v2.json', 'engine_ref_v3.json'][v - 1], here);
  const ref = existsSync(REF) ? JSON.parse(readFileSync(REF, 'utf8')) : {};
  const out = outs[v] = {};
  for (let i = 1; i <= 40; i++) {
    const seed = i === 1 ? 'fronde-222' : 'test-' + i, pilot = { ...PIL(v, D), seed, v }, args = { systems: SYS(v, D), racers: D.RACERS, pilot };
    if (v === 1) delete pilot.v;                                   // une édition d'avant : pilote sans version
    const full = E.runRace(args), d = sha(E.digest(full)); out[seed] = d;
    ok(full.complete, `v${v} ${seed} : course incomplète`);
    if (ref[seed] && !(update && v === 3)) ok(ref[seed] === d, `v${v} ${seed} : empreinte ${d} ≠ référence ${ref[seed]} (le moteur a changé)`);
    // rejeu à partir des plans publiés (JSON) ; en v2 sans la graine : le pilote public porte la carte des dangers
    const plans = JSON.parse(JSON.stringify(E.plansMap(full.revealed.map((x) => ({ ...x, plan: E.planOf(x.plan) })))));
    const pub = { ...pilot }; delete pub.seed; if (v >= 2) pub.hazards = full.hazards;
    const re = E.runRace({ ...args, pilot: pub, plans });
    ok(sha(E.digest(re)) === d, `v${v} ${seed} : le rejeu des plans diffère`);
    if (v >= 2) ok(JSON.stringify(D.RACERS.map((r) => re.tracks[r.id].happenings)) === JSON.stringify(D.RACERS.map((r) => full.tracks[r.id].happenings)), `v${v} ${seed} : faits de course du rejeu différents`);
    const first = Object.fromEntries(Object.entries(plans).filter(([k]) => k.endsWith('|' + SYS(v, D)[0].id)));
    const part = E.runRace({ ...args, pilot: pub, plans: first });
    ok(!part.complete && D.RACERS.every((r) => part.tracks[r.id].segs.filter((s) => s.kind === 'system').length === 1), `v${v} ${seed} : rejeu partiel incorrect`);
  }
  if (v === 3 && (update || !existsSync(REF))) { writeFileSync(REF, JSON.stringify(out, null, 1) + '\n'); console.log('références v3 écrites', Object.keys(out).length); }
}
const out = outs[3];
if (process.env.SERVER) {
  // v1 aussi : la copie serveur doit savoir rejouer les éditions d'avant
  { const S1 = await import(pathToFileURL(process.env.SERVER).href); for (const v of [1, 2]) for (const seed of Object.keys(outs[v])) { const pilot = { ...S1.PILOT_V2, seed, v }; if (v === 1) delete pilot.v; ok(sha(S1.digest(S1.runRace({ systems: S1.RACE_SYSTEMS_V2, racers: S1.RACERS, pilot }))) === outs[v][seed], `v${v} ${seed} : la copie serveur diffère`); } }
  const S = await import(pathToFileURL(process.env.SERVER).href);
  for (const seed of Object.keys(out)) { const pilot = { ...D.PILOT, seed }; ok(sha(S.digest(S.runRace({ systems: S.RACE_SYSTEMS, racers: S.RACERS, pilot }))) === out[seed], `${seed} : la copie serveur diffère`); }
}
console.log(fail ? `${fail} échec(s)` : `ok : 40 éditions v1 et 40 v2 (inchangées), 40 v3, rejeu complet et partiel identiques${process.env.SERVER ? ', copie serveur identique' : ''}`);
process.exit(fail ? 1 : 0);
