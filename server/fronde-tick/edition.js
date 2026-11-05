// STARBYTE — Grande Fronde : préparation d'une édition (JavaScript pur, testé sous Node : tools/fronde/edition_test.mjs).
// Utilisé par la fonction serveur fronde-tick (index.ts). Rien ici ne touche la base : on calcule les lignes à écrire.
//   · calendrier : départ le premier samedi du mois à 20 h (heure de Zurich), au moins 5 jours après la création ;
//   · graine : 256 bits aléatoires ; empreinte sha-256 publiée, graine gardée secrète jusqu'à l'arrivée ;
//   · parcours : les systèmes de course dans un ordre tiré de la graine ; racers : la flotte de la maison ;
//   · course simulée une fois avec le moteur partagé : plans des pilotes (publiés au fil de la course) et résultat.
// Les systèmes, racers et paramètres complets sont enregistrés avec l'édition : le jeu rejoue avec EXACTEMENT ces
// données (pas avec les siennes), ce qui garde la course identique même si le jeu évolue entre-temps.
import { runRace, planOf, rngOf, RACE_SYSTEMS, RACERS, PILOT, ENGINE_HASH } from './engine.js';

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
export const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

// heure locale de Zurich d'un instant (h, min)
function zurichHM(ms) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ms));
  return [+p.find((x) => x.type === 'hour').value % 24, +p.find((x) => x.type === 'minute').value];
}
// premier samedi du mois (y, m : 0–11) à 20 h, heure de Zurich (été comme hiver)
export function firstSaturday20(y, m) {
  const d1 = new Date(Date.UTC(y, m, 1)).getUTCDay(), day = 1 + ((6 - d1 + 7) % 7);
  let t = Date.UTC(y, m, day, 19, 0);                         // 19 h UTC = 20 h en hiver
  const [h] = zurichHM(t); t += (20 - h) * 3600e3;            // été : 18 h UTC
  return t;
}
// prochain départ : le premier « premier samedi » à au moins 5 jours d'ici
export function nextStart(now) {
  const d = new Date(now);
  for (let k = 0; k < 4; k++) {
    const y = d.getUTCFullYear() + Math.floor((d.getUTCMonth() + k) / 12), m = (d.getUTCMonth() + k) % 12, t = firstSaturday20(y, m);
    if (t - now >= 5 * 86400e3) return { t, y, m };
  }
  throw new Error('no_start');
}

// prépare une édition : { edition, secrets } (lignes des tables fronde_editions et fronde_secrets)
export async function prepareEdition(now = Date.now(), seed = null) {
  const { t, y, m } = nextStart(now);
  const id = `${y}-${String(m + 1).padStart(2, '0')}`;
  seed = seed || hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
  // parcours : ordre des systèmes tiré de la graine (mélange de Fisher-Yates déterministe)
  const R = rngOf(seed + '|parcours'), systems = RACE_SYSTEMS.slice();
  for (let i = systems.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [systems[i], systems[j]] = [systems[j], systems[i]]; }
  const name = `Grande Fronde · ${MONTHS[m]} ${y}`;
  const pilot = { ...PILOT, id, name, seed };
  const res = runRace({ systems, racers: RACERS, pilot });
  if (!res.complete) throw new Error('race_incomplete');
  const finish = Object.fromEntries(RACERS.map((r) => [r.id, res.tracks[r.id].finish]));
  const winner = Object.entries(finish).sort((a, b) => a[1] - b[1])[0][0];
  const { seed: _hidden, ...publicPilot } = pilot;
  const nominalH = PILOT.nominalHours || 76;
  return {
    edition: {
      id, name, systems, racers: RACERS, pilot: publicPilot,
      start_at: new Date(t).toISOString(), nominal_end_at: new Date(t + nominalH * 3600e3).toISOString(),
      seed_hash: await sha256(seed), engine: ENGINE_HASH,
    },
    secrets: {
      edition_id: id, seed,
      reveals: res.revealed.map((x) => ({ racer: x.racer, sys: x.sys, t: x.t, plan: planOf(x.plan) })),
      result: { winner, finish, t1: res.t1 },
    },
  };
}
