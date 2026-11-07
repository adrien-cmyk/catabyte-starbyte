// @ts-nocheck
// COPIE GÉNÉRÉE de edition.js par tools/fronde/sync_engine.mjs (import en .ts pour Supabase) — ne pas modifier ici.
// STARBYTE — Grande Fronde : préparation d'une édition (JavaScript pur, testé sous Node : tools/fronde/edition_test.mjs).
// Utilisé par la fonction serveur fronde-tick (index.ts). Rien ici ne touche la base : on calcule les lignes à écrire.
//   · calendrier : une course tous les 21 jours, le dimanche à 20 h (heure de Zurich), à partir du dimanche 8 novembre
//     2026 ; paris ouverts 3 jours avant le départ ;
//   · graine : 256 bits aléatoires ; empreinte sha-256 publiée, graine gardée secrète jusqu'à l'arrivée ;
//   · parcours : les dix systèmes de course, de proche en proche depuis un départ tiré de la graine ; racers : la flotte ;
//   · course simulée une fois avec le moteur partagé : plans des pilotes (publiés au fil de la course) et résultat.
// Les systèmes, racers et paramètres complets sont enregistrés avec l'édition : le jeu rejoue avec EXACTEMENT ces
// données (pas avec les siennes), ce qui garde la course identique même si le jeu évolue entre-temps.
import { runRace, planOf, rngOf, hazardsOf, routeOf, RACE_SYSTEMS, RACERS, PILOT, ENGINE_HASH } from './engine.ts';

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
export const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

// heure locale de Zurich d'un instant (h, min)
function zurichHM(ms) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ms));
  return [+p.find((x) => x.type === 'hour').value % 24, +p.find((x) => x.type === 'minute').value];
}
// premier samedi du mois (y, m : 0–11) à 20 h, heure de Zurich (été comme hiver)
export function firstSaturday20(y, m) {   // (ancien calendrier mensuel, gardé pour référence)
  const d1 = new Date(Date.UTC(y, m, 1)).getUTCDay(), day = 1 + ((6 - d1 + 7) % 7);
  let t = Date.UTC(y, m, day, 19, 0);                         // 19 h UTC = 20 h en hiver
  const [h] = zurichHM(t); t += (20 - h) * 3600e3;            // été : 18 h UTC
  return t;
}
// 20 h à Zurich d'un jour donné (y, m : 0–11, d), été comme hiver
export function at20Zurich(y, m, d) {
  let t = Date.UTC(y, m, d, 19, 0);
  const [h] = zurichHM(t); return t + (20 - h) * 3600e3;
}
export const PERIOD_DAYS = 21, OPEN_DAYS = 3;
const ANCHOR = [2026, 10, 8];                                   // dimanche 8 novembre 2026, première édition
// prochain départ : le premier créneau (tous les 21 jours) encore à au moins 2 heures d'ici
export function nextStart(now) {
  for (let k = 0; k < 400; k++) {
    const day = new Date(Date.UTC(ANCHOR[0], ANCHOR[1], ANCHOR[2] + k * PERIOD_DAYS));
    const t = at20Zurich(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
    if (t - now >= 2 * 3600e3) return { t, y: day.getUTCFullYear(), m: day.getUTCMonth(), d: day.getUTCDate() };
  }
  throw new Error('no_start');
}

// prépare une édition : { edition, secrets } (lignes des tables fronde_editions et fronde_secrets)
// opts.test : course d'essai accélérée (départ dans opts.leadMin minutes, course de 72 h ramenée à opts.minutes)
export async function prepareEdition(now = Date.now(), seed = null, opts = {}) {
  let { t, y, m, d } = nextStart(now);
  let id = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, rate = 1, opensAt = t - OPEN_DAYS * 86400e3;
  if (opts.test) {
    t = now + (opts.leadMin || 8) * 60e3; opensAt = now; rate = Math.round(72 * 3600 / ((opts.minutes || 30) * 60));
    const z = new Date(now); id = 'essai-' + z.toISOString().slice(0, 16).replace(/[-:T]/g, '');
  }
  seed = seed || hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
  // parcours : v3, les dix systèmes de proche en proche depuis un départ tiré de la graine (routeOf) ; avant, ordre
  // des trois systèmes mélangé (Fisher-Yates déterministe)
  let systems;
  if ((PILOT.v || 1) >= 3) systems = routeOf(RACE_SYSTEMS, seed);
  else { const R = rngOf(seed + '|parcours'); systems = RACE_SYSTEMS.slice(); for (let i = systems.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [systems[i], systems[j]] = [systems[j], systems[i]]; } }
  const name = opts.test ? `Course d'essai · ${opts.minutes || 30} min` : `Grande Fronde · dimanche ${d} ${MONTHS[m]} ${y}`;
  // carte des dangers (ceintures, risque d'éruption) : publique, tirée de la graine (v2)
  const pilot = { ...PILOT, id, name, seed, ...((PILOT.v || 1) >= 2 ? { hazards: hazardsOf(systems, seed) } : {}) };
  const res = runRace({ systems, racers: RACERS, pilot });
  if (!res.complete) throw new Error('race_incomplete');
  const finish = Object.fromEntries(RACERS.map((r) => [r.id, res.tracks[r.id].finish]));
  const winner = Object.entries(finish).sort((a, b) => a[1] - b[1])[0][0];
  const { seed: _hidden, ...publicPilot } = pilot;
  const nominalH = PILOT.nominalHours || 76;
  return {
    edition: {
      id, name, systems, racers: RACERS, pilot: publicPilot,
      start_at: new Date(t).toISOString(), opens_at: new Date(Math.max(now, opensAt)).toISOString(),
      nominal_end_at: new Date(t + nominalH * 3600e3 / rate).toISOString(), rate,
      seed_hash: await sha256(seed), engine: ENGINE_HASH,
    },
    secrets: {
      edition_id: id, seed,
      reveals: res.revealed.map((x) => ({ racer: x.racer, sys: x.sys, t: x.t, plan: planOf(x.plan) })),
      result: { winner, finish, t1: res.t1 },
    },
  };
}
