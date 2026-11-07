// Les répliques d'Arno et Mila : le document (docs/grande-fronde/REPLIQUES_ARNO_MILA.md, écrit par Adrien) est la
// source ; ce script en tire les données du commentateur (telebyte/feuilleton.js). Ce qui est en italique, les titres,
// les tableaux de consignes et les notes ne sont jamais lus à voix haute. Un monologue garde ses paragraphes en
// répliques successives de la même voix (des respirations, jouées d'affilée).
// Usage : node tools/fronde/repliques_md.mjs   (puis vérifier telebyte/feuilleton.js et relancer les essais)
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../../', import.meta.url);
const md = readFileSync(new URL('docs/grande-fronde/REPLIQUES_ARNO_MILA.md', root), 'utf8').replace(/\r/g, '').split('\n');
const WHO = { Arno: 'A', Mila: 'B' };
const clean = (s) => s.replace(/\s+/g, ' ').trim();
const speakerLine = (l) => { const m = l.match(/^\s*(?:-\s*)?\*\*(Arno|Mila)\*\*\s*—\s*(.+)$/); return m ? [WHO[m[1]], clean(m[2])] : null; };
// découpe en parties ## et sous-parties ### / ####
const parts = []; let part = null, sec = null, ent = null;
for (const raw of md) {
  const l = raw.trimEnd();
  let m;
  if ((m = l.match(/^## (.+)/))) { part = { title: m[1], secs: [] }; parts.push(part); sec = null; ent = null; continue; }
  if (!part) continue;
  if ((m = l.match(/^### (.+)/))) { sec = { title: m[1], ents: [], lines: [], bullets: [], rows: [] }; part.secs.push(sec); ent = null; continue; }
  if ((m = l.match(/^#### (\d+)\. (.+)/))) { ent = { n: +m[1], title: m[2], lines: [] }; (sec || (sec = { title: '', ents: [], lines: [], bullets: [], rows: [] })).ents.push(ent); continue; }
  if (!sec) continue;
  if (/^\s*\*[^*].*\*\s*$/.test(l) || /^\s*---\s*$/.test(l) || !l.trim()) continue;          // italique (consigne), séparateur, vide
  if (/^\|/.test(l)) { const c = l.split('|').map((x) => x.trim()).filter(Boolean); if (c.length === 2 && !/^-+$/.test(c[0]) && !/Situation/.test(c[0])) sec.rows.push(c); continue; }
  const sp = speakerLine(l);
  const tgt = ent ? ent.lines : sec.lines;
  if (sp) { (/^\s*-/.test(l) ? sec.bullets : tgt).push(sp); continue; }
  if ((m = l.match(/^\s*-\s*«\s*(.+?)\s*»\s*$/))) { sec.bullets.push(['A', clean(m[1])]); continue; }
  if ((m = l.match(/^\s*-\s*\*(.+?)\*\s*:\s*\*\*(Arno|Mila)\*\*\s*—\s*(.+)$/))) { sec.bullets.push([WHO[m[2]], clean(m[3]), clean(m[1])]); continue; }
  if (/^\s*[-#*|]/.test(l)) continue;
  // paragraphe sans nom : la suite du même orateur (respiration d'un monologue)
  if (tgt.length) tgt.push([tgt[tgt.length - 1][0], clean(l)]);
}
const P = (re) => { const p = parts.find((x) => re.test(x.title)); if (!p) throw new Error('partie introuvable : ' + re); return p; };
const S = (p, re) => { const s = p.secs.find((x) => re.test(x.title)); if (!s) throw new Error('section introuvable : ' + re + ' dans ' + p.title); return s; };
// feuilletons : entrées numérotées ; la section donne la phase
const feuil = (p, phaseOf) => p.secs.flatMap((s) => s.ents.map((e) => ({ n: e.n, phase: phaseOf(s.title) || undefined, lines: e.lines })));
const AVANT = feuil(P(/feuilleton — avant/), (t) => /^Ouverture/.test(t) ? 'ouverture' : /montée en pression/i.test(t) ? 'depart' : null);
const PENDANT = feuil(P(/feuilleton — pendant/), (t) => /fatigue/i.test(t) ? 'fatigue' : /approche de la fin/i.test(t) ? 'finale' : null);
const BL = P(/blagues/).secs.map((s) => s.lines).filter((x) => x.length);
const REA = Object.fromEntries(P(/réactions/).secs.map((s) => [s.title, s.bullets]));
const CRIS = Object.fromEntries(P(/cris/).secs.length ? P(/cris/).secs.flatMap((s) => s.rows).map(([a, b]) => [a, b.replace(/^«\s*|\s*»$/g, '')]) : []);
// (le tableau des cris est dans la partie elle-même, avant sa première section)
const FD = P(/faits divers/), AMORCES = S(FD, /Amorces/).bullets.map((b) => b[1]), BREVES = FD.secs.filter((s) => /^\d+\./.test(s.title)).map((s) => s.lines);
const PRES = Object.fromEntries(P(/présentation des pilotes/).secs.map((s, i) => [['sentinelle', 'cuirasse', 'mule', 'fulgurant'][i], s.lines]));
const VE = P(/vécu à bord/), VECU = { system: S(VE, /Dans un système — évocation/).bullets, leg: S(VE, /Entre deux systèmes/).bullets };
const RT = P(/retours d’antenne/), RETOURS = Object.fromEntries(RT.secs.map((s) => [s.title, s.lines]));
const AR = P(/arrivée/), ARRIVEE = Object.fromEntries(AR.secs.map((s) => [s.title, s.lines]));
// cris : le tableau est sous le titre de partie (pas de section) : on le relit à part
const crisRows = []; { let on = false; for (const l of md) { if (/^## Les cris/.test(l)) on = true; else if (/^##? /.test(l) && on && !/^## Les cris/.test(l)) break; if (on && /^\|/.test(l)) { const c = l.split('|').map((x) => x.trim()).filter(Boolean); if (c.length === 2 && !/^-+$/.test(c[0]) && !/^Situation/.test(c[0])) crisRows.push([c[0], c[1].replace(/^«\s*|\s*»$/g, '')]); } } }
const data = { AVANT, PENDANT, BLAGUES: BL, REACTIONS: REA, CRIS: Object.fromEntries(crisRows), AMORCES, BREVES, PRESENTATIONS: PRES, VECU, RETOURS, ARRIVEE };
// contrôles : orateurs, longueur (la voix lit 400 caractères au plus par réplique)
let n = 0, chars = 0, long = [];
const walk = (L) => { for (const l of L) { n++; chars += l[1].length; if (l[1].length > 400) long.push(l[1].slice(0, 60)); } };
AVANT.forEach((e) => walk(e.lines)); PENDANT.forEach((e) => walk(e.lines)); BL.forEach(walk); Object.values(REA).forEach(walk); BREVES.forEach(walk); Object.values(PRES).forEach(walk); walk(VECU.system); walk(VECU.leg); Object.values(RETOURS).forEach(walk); Object.values(ARRIVEE).forEach(walk);
const out = `// Les répliques d'Arno et Mila — DONNÉES GÉNÉRÉES par tools/fronde/repliques_md.mjs à partir de
// docs/grande-fronde/REPLIQUES_ARNO_MILA.md (texte d'Adrien, V2). Ne pas modifier ici : corriger le document, relancer.
// A : Arno Vasseur ; B : Mila Korsh. Une réplique = [qui, texte] (la vraie voix en lit au plus 400 caractères).
// Feuilletons : { n, phase?, lines } ; phase : ouverture (une fois par course, avant le départ), depart (approche
// effective du départ), fatigue (après assez d'heures de course), finale (phase finale).
${Object.entries(data).map(([k, v]) => `export const ${k} = ${JSON.stringify(v, null, 1)};`).join('\n')}
`;
writeFileSync(new URL('telebyte/feuilleton.js', root), out);
console.log(`avant ${AVANT.length} entrées (${AVANT.filter((e) => e.phase).map((e) => e.n + ':' + e.phase).join(' ')}) · pendant ${PENDANT.length} (${PENDANT.filter((e) => e.phase).map((e) => e.n + ':' + e.phase).join(' ')})`);
console.log(`blagues ${BL.length} · réactions ${Object.keys(REA).length} · cris ${crisRows.length} · amorces ${AMORCES.length} · brèves ${BREVES.length} · présentations ${Object.keys(PRES).length} · vécu ${VECU.system.length}+${VECU.leg.length} · retours ${Object.keys(RETOURS).length} · arrivée ${Object.keys(ARRIVEE).length}`);
console.log(`${n} répliques, ${chars} caractères ; trop longues : ${long.length ? long.join(' | ') : 'aucune'}`);
