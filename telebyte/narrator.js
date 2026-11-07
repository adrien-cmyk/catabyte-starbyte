// Voix off de la Grande Fronde (Phase 4, partie E) : un duo de commentateurs de stade.
//   Arno Vasseur — le commentateur, emporté ; Mila Korsh — la consultante, ancienne pilote de fronde, posée.
// Ils racontent la course à partir de la chronologie (timeline.js : seulement ce qui est déjà arrivé à l'instant
// affiché), comblent les temps morts (point course, télémétrie, vécu des pilotes, faits divers, paris, grande
// finale). Sous-titres à l'écran ; voix : de vraies voix ElevenLabs (telebyte/voice.js, option voice), seulement pour
// les phrases réutilisables (faits de course, anecdotes) ; l'heure et les chiffres du moment restent en sous-titres.
//
//   const nar = createNarrator({ feed, E, racer, hh, dur, pools: () => ({ total, by_racer, house }) | null,
//                                mine: () => [{ racer, stake }], sub: élément des sous-titres, voice: createVoice() })
//   nar.update(t, { now })     à chaque image (t : instant affiché ; now : présent du direct, < 0 avant le départ)
//   nar.setMode('voix' | 'texte' | 'off'), nar.mode, nar.unlock() (premier toucher : iOS n'autorise le son qu'après)
//   nar.rebuild()              quand le flux change (nouveaux plans publiés)
//   nar.log                    ce qui a été dit (essais)
// Rien ici ne change la course : faits divers et vécu des pilotes sont de la couleur, tirés au hasard sur l'écran.
import { buildTimeline } from './timeline.js';
import { svg } from './icons.js';

const SPK = { A: { name: 'Arno', rate: 1.1, pitch: 1.08 }, B: { name: 'Mila', rate: 0.98, pitch: 0.94 } };

// noms avec article : « le Fulgurant », « du Fulgurant », « au Fulgurant »
const KNOWN = { sentinelle: 'f', cuirasse: 'm', mule: 'f', fulgurant: 'm' };
export function names(r) {
  let base = r.name, g = KNOWN[r.id] || 'm';
  const m = /^(Le|La|L')\s*(.*)$/.exec(r.name);
  if (m) { base = m[2]; g = m[1] === 'La' ? 'f' : m[1] === 'Le' ? 'm' : 'v'; }
  const vowel = /^[AEIOUYÉÈH]/i.test(base);
  const le = vowel ? 'l\'' + base : (g === 'f' ? 'la ' : 'le ') + base;
  const du = vowel ? 'de l\'' + base : g === 'f' ? 'de la ' + base : 'du ' + base;
  const au = vowel ? 'à l\'' + base : g === 'f' ? 'à la ' + base : 'au ' + base;
  return { le, Le: le[0].toUpperCase() + le.slice(1), du, au, il: g === 'f' ? 'elle' : 'il', Il: g === 'f' ? 'Elle' : 'Il', e: g === 'f' ? 'e' : '' };
}
// pilotes (couleur seulement)
const PILOTS = { sentinelle: 'Ysée Marr', cuirasse: 'Brannoc', mule: 'Tobbe', fulgurant: 'Kaï Varon' };
// nom canonique d'un racer dans les textes à trous ([racer]) du document d'Adrien
const RACER_NOM = { sentinelle: 'la Sentinelle', cuirasse: 'le Kerath Lourd', mule: 'La Mule', fulgurant: 'le Fulgurant' };

const NB = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze'];
import * as TX from './feuilleton.js';
const { AVANT, PENDANT } = TX;
// mémoire sur l'appareil : progression du feuilleton (toutes courses), et ce qui ne se joue qu'une fois par course
const mem = {
  get: (k, d = null) => { try { const v = globalThis.localStorage.getItem('fronde.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: (k, v) => { try { globalThis.localStorage.setItem('fronde.' + k, JSON.stringify(v)); } catch (e) {} },
};
export function createNarrator({ feed, E, racer, hh, dur, pools = () => null, mine = () => [], sub = null, voice = null }) {
  const N = Object.fromEntries(E.racers.map((r) => [r.id, names(r)]));
  const P = (id) => PILOTS[id] || 'son pilote';
  const sysName = (id) => (E.systems.find((s) => s.id === id) || { name: id }).name;
  const km = (v) => (v / 1e3).toFixed(1).replace('.', ',');
  const pct = (x) => Math.round(x * 100);
  const fmt = (n) => Math.round(n).toLocaleString('fr-CH');
  let seed = 0; for (const c of E.id || 'fronde') seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const rnd0 = () => { seed = (seed + 0x6D2B79F5) >>> 0; let x = seed; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  // les phrases d'un fait sont tirées de son identifiant, pas du fil de la soirée : chaque joueur entend les mêmes
  // phrases (un seul fichier de voix, lu une fois, partagé)
  let rndOver = null;
  const rnd = () => (rndOver ? rndOver() : rnd0());
  const seeded = (key) => { let h = 2166136261; for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); } return () => { h = (h + 0x6D2B79F5) >>> 0; let x = h; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const nar = { mode: 'voix', log: [], tl: [] };
  let blagueI = Math.floor(rnd0() * TX.BLAGUES.length);
  let lastT = null, lastReal = 0, rate = 1, queue = [], speaking = null, nextFill = 0, faitI = Math.floor(rnd() * TX.BREVES.length), fillI = 0;
  const said = new Map();                                        // fait déjà dit → son instant

  nar.rebuild = () => { nar.tl = buildTimeline(feed); };
  nar.rebuild();

  /* ── ce que disent les commentateurs pour chaque fait ── */
  // réactions après un fait (texte V2) : une seule réplique adaptée, ou aucune ; la gravité prime sur la variété
  const REACT = { overtake: 'Dépassement confirmé', moon: 'Passage près d’une lune', belt: 'Raccourci dans une ceinture', beltHit: 'Choc — état encore inconnu',
    failure: 'Panne', repair: 'Réparation en cours', flare: 'Éruption détectée — impact à déterminer', failed: 'Surchauffe confirmée' };
  // cris d'Arno : rares, seulement sur l'action qu'ils décrivent
  const CRI = { overtake: 'Dépassement qui se concrétise', beltHit: 'Contact ou situation dangereuse', failed: 'Nouvelle difficulté immédiate' };
  const INCIDENTS = new Set(['beltHit', 'failure', 'failed', 'damage']);
  function linesFor(e, t) {
    rndOver = seeded(e.key || e.kind + e.t);
    try {
      let L = linesFor0(e, t); if (!L || !L.length) return L;
      const d = e.data || {};
      let rk = REACT[e.kind];
      if (e.kind === 'plan' && d.plan === 'plongée') rk = 'Plongée rasante annoncée';
      if (e.kind === 'periapsis' && d.plan === 'plongée') rk = 'Passage au plus près réussi';
      if (e.kind === 'flare' && d.prudent) rk = null;                          // abri réussi : rien à ajouter
      const bank = rk && TX.REACTIONS[rk];
      if (bank && bank.length && rnd() < 0.45 && L.length < 3) {   // de préférence l'autre voix : Mila ajoute une lecture après Arno
        const other = bank.filter((b) => b[0] !== L[L.length - 1][0]); L = [...L, pick(other.length ? other : bank).slice(0, 2)];
      }
      const cri = CRI[e.kind] && TX.CRIS[CRI[e.kind]];
      if (cri && rnd() < 0.2 && L[0][0] === 'A') L = [['A', cri + ' ' + L[0][1], L[0][2]], ...L.slice(1)];
      // l'arrivée (fragments V2) : victoire confirmée, laisser retomber, saluer les autres, fermer la retransmission
      if (e.kind === 'finish') {
        const A = TX.ARRIVEE, n = E.racers.length;
        // l'émotion d'abord, les gains ensuite (montant du moment : sous-titre seul)
        if (d.place === 1) L = [...(A['Victoire officiellement confirmée'] || []), L[0], ...(A['Après la confirmation — laisser retomber'] || []), ...L.slice(1).map((l) => /\d/.test(l[1]) ? [l[0], l[1], false] : l), ...(n > 1 ? A['Saluer les autres concurrents'] || [] : [])];
        if (d.place === n) L = [...L, ...(A['Fermer la retransmission'] || [])];
      }
      return L;
    } finally { rndOver = null; }
  }
  function linesFor0(e, t) {
    const n = e.racer ? N[e.racer] : null, d = e.data, S = e.sys ? sysName(e.sys) : '';
    switch (e.kind) {
      case 'start': return [['A', pick([`Et c'est parti pour la Grande Fronde ! Quatre vaisseaux, ${NB[E.systems.length] || E.systems.length} systèmes, une seule trajectoire parfaite !`, 'Top départ ! La Grande Fronde est lancée, et quelle ambiance dans les tribunes !'])],
        ['B', `Premier rendez-vous : ${sysName(E.systems[0].id)}. Il va falloir choisir sa trajectoire, et vite.`]];
      case 'plan':
        if (d.plan === 'plongée') return [['A', pick([`${n.Le} choisit la plongée rasante à ${S} ! ${n.Il} va frôler la géante !`, `Attention, ${n.le} plonge ! Plongée rasante annoncée à ${S} !`])],
          ['B', pick(['C\'est l\'effet Oberth : pousser au plus près de la planète, c\'est là que chaque goutte de carburant rapporte le plus. Mais ça chauffe.', 'Gros pari tactique. Si la coque tient, il ressort comme une fusée.'])]];
        if (d.last) return [['A', `${n.Le} entre dans le système de ${S}, le dernier : passage ${d.plan === 'prudente' ? 'prudent' : 'classique'}, cap sur l'arrivée.`]];
        return [['A', d.plan === 'prudente' ? pick([`${n.Le} reste au large à ${S}, passage prudent.`, `Passage prudent pour ${n.le} à ${S}.`]) : `Passage classique pour ${n.le} à ${S}.`],
          ...(rnd() < 0.4 ? [['B', d.plan === 'prudente' ? `${n.Il} ménage sa coque, ${n.il} pense déjà à la finale.` : 'Le choix de la raison. Pas de folie, pas de cadeau.']] : [])];
      case 'ring': return [['A', pick([`${n.Le} traverse le plan des anneaux de ${S} ! Les débris crépitent sur la coque !`, `Passage dans les anneaux pour ${n.le} ! Ça grêle sur le blindage !`])]];
      case 'periapsis': return [['A', pick([`${n.Le} au plus près de ${S} : ${km(d.v)} km/s !`, `Périapse pour ${n.le} ! ${km(d.v)} km/s au compteur !`])],
        ...(d.plan === 'plongée' || rnd() < 0.35 ? [['B', `${P(e.racer)[0].toUpperCase() + P(e.racer).slice(1)} encaisse ${d.g.toFixed(1).replace('.', ',')} g dans le siège. ${d.plan === 'plongée' ? 'La coque doit être rouge vif.' : 'Ça reste confortable.'}`]] : [])];
      case 'failed': return [['A', pick([`Oh ! Alerte à bord ${n.du} ! Surchauffe, la poussée est coupée !`, `Coup dur pour ${n.le} ! Surchauffe en pleine plongée, les moteurs se coupent !`])],
        ['B', `C'est le prix de la plongée. ${n.Il} va sortir bien moins vite que prévu.`]];
      case 'damage': return [['A', `${n.Le} ressort abîmé${n.e} de ${S} : coque à ${pct(feed.stateAt(e.racer, e.t).integrity)} %.`],
        ...(d.dmg > 0.1 ? [['B', `Avec une coque pareille, ses étapes vont être plus lentes. Il faudra voir ${n.il === 'il' ? 's\'il' : 'si elle'} ose encore plonger.`]] : [])];
      case 'exit': return [['A', `${n.Le} quitte ${S} à ${km(d.vOut)} km/s.`]];
      case 'leg': return d.last
        ? [['A', `Dernière étape pour ${n.le} : cap sur ${sysName(d.to)}, la grande finale !`]]
        : [['A', pick([`Cap sur ${sysName(d.to)} pour ${n.le}, place au voyage interstellaire.`, `${n.Le} file vers ${sysName(d.to)}. Une vingtaine d'heures de vide devant ${n.il === 'il' ? 'lui' : 'elle'}.`])]];
      case 'fuel': return [['A', `Le réservoir ${n.du} descend à ${pct(d.fuel)} %.`], ['B', d.fuel < 0.2 ? 'C\'est très juste. Plus aucune grosse poussée possible.' : 'Il va devoir économiser pour la finale.']];
      case 'overtake': {
        const who = d.passed.map((x) => N[x].le).join(' et ');
        return d.lead ? [['A', pick([`Changement en tête ! ${n.Le} passe devant ${who} !`, `${n.Le} prend la tête de la Grande Fronde !`])]]
          : [['A', `${n.Le} double ${who}, ${n.il} remonte à la ${d.rank}${d.rank === 1 ? 're' : 'e'} place !`]];
      }
      case 'finale': return [['A', `Mesdames et messieurs, la grande finale ! ${n.Le} entre le premier dans le système de ${S} !`],
        ['B', 'Tout se joue maintenant : l\'arrivée, c\'est la périapse. Le plus rasant gagne, si sa coque tient.']];
      case 'finish': {
        if (d.place === 1) {
          const pl = pools();
          return [['A', `${n.Le.toUpperCase()} REMPORTE LA GRANDE FRONDE ! Quelle course !`],
            ['B', pl && pl.total ? `Les commandants qui ont misé sur ${n.le} se partagent la cagnotte : ${fmt(pl.total * (100 - (pl.house || 5)) / 100)} CG.` : `Bravo à ${P(e.racer)}. Une course de patience et de nerfs.`]];
        }
        const win = nar.tl.find((x) => x.kind === 'finish' && x.data.place === 1);
        return [['A', `${n.Le} termine ${d.place}e${win ? `, à ${dur(e.t - win.t)} du vainqueur` : ''}.`]];
      }
      // événements du moteur v2 (Phase 4, partie A)
      case 'moon': return [['A', pick([`${n.Le} va chercher ${d.moon} ! Assistance gravitationnelle, ${n.il} rase la lune !`, `Quelle audace ! ${n.Le} frôle ${d.moon} pour voler un peu de vitesse !`])],
        ['B', d.dmg ? `Ça rapporte ${d.gain} m/s… mais ${n.il} a pris des débris de plein fouet, coque à ${pct(feed.stateAt(e.racer, e.t + 1).integrity)} %.` : `${d.gain} m/s gagnés gratuitement. Du grand pilotage.`]];
      case 'belt': return [['A', `${n.Le} coupe par la ceinture d'astéroïdes ! Le raccourci de tous les dangers !`],
        ['B', `${Math.round(d.gain * 100)} % de trajet en moins, mais il faut slalomer entre les rochers pendant des heures.`]];
      case 'beltHit': return [['A', pick([`Choc ! ${n.Le} percute un astéroïde !`, `Impact pour ${n.le} dans la ceinture ! Ça a tapé fort !`])],
        ['B', `Coque à ${pct(d.integrity)} %. ${d.integrity < 0.6 ? 'Là, ça devient inquiétant.' : 'Ça tient, pour l\'instant.'}`]];
      case 'failure': return [['A', `Panne de propulsion à bord ${n.du} ! ${n.Il} dérive dans le vide !`],
        ['B', `Les mécaniciens sont dehors, en scaphandre. Ça va lui coûter ${dur(d.lost)}, au moins.`]];
      case 'repair': return [['A', `${n.Le} coupe les moteurs : arrêt réparation en plein vide.`],
        ['B', `${dur(d.lost)} perdues, mais une coque remise à ${pct(d.integrity)} %. Le choix de la sagesse.`]];
      case 'flare': return d.prudent
        ? [['A', `Éruption stellaire ! ${n.Le} se met à l'abri derrière son bouclier.`], ['B', `Prudent. ${n.Il} perd ${dur(d.lost)}, mais l'électronique est sauve.`]]
        : [['A', `Éruption stellaire ! ${n.Le} fonce à travers la tempête de particules !`], ['B', d.lost ? `Aïe, l'électronique a grillé : ${dur(d.lost)} pour tout redémarrer.` : `Ça passe ! Coque à ${pct(d.integrity)} %, mais pas une seconde de perdue.`]];
      case 'fuelSave': return [['A', `${n.Le} passe en mode économie : réservoir presque vide, ${n.il} réduit la poussée.`]];
      default: if (e.text) return [['A', e.text], ...(e.comment ? [['B', e.comment]] : [])];
    }
    return [];
  }

  /* ── temps morts : point course, télémétrie, vécu, faits divers, paris, finale ── */
  function filler(t, now) {
    if (now != null && now < 0) return preRace(-now);
    const rows = feed.standingsAt(t), lead = rows[0], done = rows.every((r) => r.done);
    if (done) { const w = nar.tl.find((x) => x.kind === 'finish' && x.data.place === 1); return w ? [['A', `Rappel du résultat : victoire ${N[w.racer].du}. Rendez-vous dans trois semaines pour la prochaine Grande Fronde !`]] : null; }
    const kinds = ['recap', 'feuilleton', 'vecu', 'feuilleton', 'fait', 'paris', 'feuilleton', 'tele', 'blague', 'vecu', 'feuilleton', 'recap'];
    for (let k = 0; k < kinds.length; k++) {
      const kind = kinds[(fillI++) % kinds.length], L = fillOf(kind, t, rows, lead);
      if (L) return L;
    }
    return null;
  }
  const nv = (L) => L && L.map((l) => [l[0], l[1], false]);   // phrase du moment (heure, chiffres) : sous-titre seul, pas de voix
  function fillOf(kind, t, rows, lead) {
    const id = pick(rows.filter((r) => !r.done)).id, n = N[id], s = feed.stateAt(id, t);
    if (kind === 'recap') {
      if (rows.length < 2 || performance.now() - recapAt < 180000) return null;   // pas deux points coup sur coup
      recapAt = performance.now();
      const second = rows[1];
      return nv([['A', `Point course à ${hh(t)} : ${N[lead.id].le} en tête${second.gap > 1 ? `, ${N[second.id].le} à ${dur(second.gap)}` : `, ${N[second.id].le} dans son sillage`}.`]]);
    }
    if (kind === 'tele') {
      if (s.phase === 'system' && s.speed) return nv([['A', `${n.Le} file à ${km(s.speed)} km/s à ${sysName(s.system)}, réservoir à ${pct(s.fuel)} %, coque à ${pct(s.integrity)} %.`]]);
      if (s.phase === 'leg') return nv([['A', `${n.Le} est en plein vide interstellaire, en route vers ${sysName(s.legTo)}. Réservoir à ${pct(s.fuel)} %, coque à ${pct(s.integrity)} %.`]]);
      return null;
    }
    if (kind === 'vecu') {                                         // évocations de Mila (texte V2), à trous
      const sub = (x) => x.replace(/\[racer\]/g, RACER_NOM[id] || n.le).replace(/\[pilote\]/g, P(id)).replace(/\[système\]/g, sysName(s.legTo || s.system))
        .replace(/\bde le /g, 'du ').replace(/\bà le /g, 'au ');
      const bank = s.phase === 'system' ? TX.VECU.system : s.phase === 'leg' ? TX.VECU.leg : null;
      return bank && bank.length ? [pick(bank).slice(0, 2)].map(([w, x]) => [w, sub(x)]) : null;
    }
    if (kind === 'fait') return fait(t);
    if (kind === 'paris') return nv(betLine(rows));
    if (kind === 'feuilleton') return feuilletonPendant(t);
    if (kind === 'blague') return blague(t);
    return null;
  }
  function betLine(rows) {
    const pl = pools(); if (!pl || !pl.total) return null;
    const by = pl.by_racer || {}, ids = Object.keys(by).filter((x) => by[x] > 0).sort((a, b) => by[b] - by[a]);
    if (!ids.length) return null;
    const my = mine() || [];
    if (my.length && rnd() < 0.5) {
      const b = my[my.length - 1], r = rows.find((x) => x.id === b.racer);
      if (r && N[b.racer]) return [['A', `Commandant, ton pari sur ${N[b.racer].le} : ${r.rank === 1 ? `${N[b.racer].il} est en tête, ça sent bon !` : `${N[b.racer].il} est ${r.rank}e pour l'instant. Rien n'est perdu.`}`]];
    }
    const fav = ids[0], share = by[fav] / pl.total, house = pl.house || 5;
    const long = E.racers.map((r) => r.id).filter((x) => by[x] > 0).sort((a, b) => by[a] - by[b])[0];
    const odds = long && by[long] ? pl.total * (100 - house) / 100 / by[long] : 0;
    return rnd() < 0.5 || !long || long === fav
      ? [['A', `Côté paris : ${N[fav].le} est le favori des commandants, ${pct(share)} % des mises. Cagnotte : ${fmt(pl.total)} CG.`]]
      : [['B', `Si ${N[long].le} gagne, ceux qui y ont cru touchent ${odds.toFixed(1).replace('.', ',')} fois leur mise. Le coup de poker de la soirée.`]];
  }
  // ── feuilleton (texte V2 d'Adrien) ──
  // progression : sur l'appareil, toutes courses confondues (entrées sans phase) ; chaque phase réservée se joue une
  // fois par course, seulement quand la course y est vraiment (une entrée dont la phase est passée est abandonnée)
  const edKey = (k) => `${k}.${E.id || 'demo'}`;
  const finalPhase = (t) => { const last = E.systems[E.systems.length - 1].id;
    return E.racers.some((r) => { const st = feed.stateAt(r.id, t); return (st.phase === 'system' && st.system === last) || (st.phase === 'leg' && st.legTo === last); }); };
  function nextOf(list, key) { const done = mem.get(key, 0); if (done >= list.length) return null; mem.set(key, done + 1); return list[done]; }
  function feuilletonAvant(now) {
    const ouv = AVANT.filter((e) => e.phase === 'ouverture');
    // ouverture : séquence continue, une seule fois par course, à la première visite d'avant-course
    if (ouv.length && !mem.get(edKey('ouverture'), false)) { mem.set(edKey('ouverture'), true); return ouv.flatMap((e) => e.lines); }
    // montée en pression : seulement à l'approche effective du départ (45 dernières minutes), dans l'ordre, puis le silence
    if (now != null && now > -2700) { const e = nextOf(AVANT.filter((x) => x.phase === 'depart'), edKey('depart')); return e ? e.lines : null; }
    const libre = AVANT.filter((e) => !e.phase); if (!libre.length) return null;
    const i = mem.get('feuil2.avant', 0) % libre.length; mem.set('feuil2.avant', i + 1);
    return libre[i].lines;
  }
  function feuilletonPendant(t) {
    if (finalPhase(t)) { const e = nextOf(PENDANT.filter((x) => x.phase === 'finale'), edKey('finale')); return e ? e.lines : null; }
    if (t > 30 * 3600) { const e = nextOf(PENDANT.filter((x) => x.phase === 'fatigue'), edKey('fatigue')); if (e) return e.lines; }
    const libre = PENDANT.filter((e) => !e.phase); if (!libre.length) return null;
    const i = mem.get('feuil2.pendant', 0) % libre.length; mem.set('feuil2.pendant', i + 1);
    return libre[i].lines;
  }
  nar.feuilleton = (k, t = 0, now = -1) => (k === 'avant' ? feuilletonAvant(now) : feuilletonPendant(t));   // essais
  // présentations courtes des pilotes : une fois chacune par course (pas à chaque reconnexion)
  function presentation() {
    const done = mem.get(edKey('pres'), []); const r = E.racers.find((x) => !done.includes(x.id) && TX.PRESENTATIONS[x.id]);
    if (!r) return null; mem.set(edKey('pres'), [...done, r.id]); return TX.PRESENTATIONS[r.id];
  }
  // pas de plaisanterie juste après un incident (choc, panne, surchauffe, dégâts) : 30 min de course
  const calme = (t) => !nar.tl.some((x) => x.t <= t && t - x.t < 1800 && INCIDENTS.has(x.kind));
  const blague = (t) => (t != null && !calme(t) ? null : TX.BLAGUES[(blagueI++) % TX.BLAGUES.length]);
  const fait = (t) => (t != null && !calme(t) ? null : [['A', pick(TX.AMORCES)], ...TX.BREVES[(faitI++) % TX.BREVES.length]]);
  let preI = 0;
  function preRace(left) {
    const now = -left;
    if (now > -2700) return feuilletonAvant(now);                // approche du départ : la montée en pression, puis on laisse respirer
    if ((preI++) % 3 !== 2) { const F = feuilletonAvant(now); if (F) return F; }   // avant le départ : surtout le feuilleton
    const k = (fillI++) % 4;
    if (k === 0) { const P0 = presentation(); if (P0) return P0; }
    if (k === 1) return nv([['A', `Départ dans ${dur(left)}. Au programme : ${E.systems.map((x) => x.name).join(', puis ')}.`]]);
    if (k === 2) return nv(betLine(feed.standingsAt(0))) || blague(null);
    return fait(null) || blague(null);
  }
  // reconnexion pendant la course : une formule courte (variantes), puis le point de course réel
  function retour(t) {
    const R0 = TX.RETOURS, first = !mem.get(edKey('vu'), false); mem.set(edKey('vu'), true);
    if (first) return R0['Première entrée pendant la course'] || null;
    const lead = feed.standingsAt(t)[0], st = lead && feed.stateAt(lead.id, t);
    const soon = nar.tl.some((x) => x.kind === 'periapsis' && x.t > t && x.t - t < 1200) || E.racers.some((r) => { const s2 = feed.stateAt(r.id, t); return s2.phase === 'system'; });
    if (soon && R0['Nouveau passage en vue']) return R0['Nouveau passage en vue'];
    if (st && st.phase === 'leg' && R0['Retour sur une longue traversée']) return R0['Retour sur une longue traversée'];
    return R0['Première entrée pendant la course'] || null;
  }

  /* ── file de parole : sous-titres, et vraies voix (telebyte/voice.js, ElevenLabs) ── */
  const speakable = (s) => s.replace(/(\d)['’\u202f\u00a0 ](?=\d{3}\b)/g, '$1').replace(/km\/s/g, 'kilomètres par seconde').replace(/(\d+) h (\d+)/g, '$1 heures $2').replace(/(\d+) h\b/g, '$1 heures')
    .replace(/(\d+) min\b/g, '$1 minutes').replace(/(\d+) s\b/g, '$1 secondes').replace(/ CG\b/g, ' crédits').replace(/(\d) %/g, '$1 pour cent').replace(/\b1re\b/g, 'première').replace(/\b(\d+)e\b/g, '$1ème').replace(/\bJ\+(\d+)/g, 'jour $1,')
    .replace(/\b([A-ZÀÂÉÈÊÎÔÛÇ]{2,})\b/g, (w) => w[0] + w.slice(1).toLowerCase());   // capitales : lues comme des mots, pas épelées
  function showSub(who, text) {
    if (!sub) return;
    if (nar.mode === 'off' || !text) { sub.hidden = true; return; }
    // voix voulue mais pas encore autorisée par le téléphone : on le dit (un toucher suffit)
    const hint = nar.mode === 'voix' && voice && !audioOk ? ` <small class="hint">${svg('muted')} touche l'écran pour le son</small>` : '';
    sub.hidden = false; sub.innerHTML = `<b>${SPK[who].name}</b> ${text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}${hint}`;
    sub.classList.toggle('b', who === 'B');
  }
  function say(line) {
    const [who, text, canVoice] = line, at = performance.now();
    nar.log.push({ who, text, t: lastT, at });
    if (nar.log.length > 400) nar.log.shift();
    showSub(who, text); lastLine = text;
    const minMs = 1200 + text.length * 55;                  // durée de lecture d'un sous-titre (et repli sans voix)
    speaking = { until: at + minMs, voice: false };
    // vraie voix (ElevenLabs) si la phrase est prête ; sinon le sous-titre seul, à son rythme
    if (nar.mode === 'voix' && voice && canVoice !== false && voice.unlocked) {
      const st = voice.status(who, speakable(text));
      if (st.state === 'ready') {
        const me = speaking; me.voice = true; me.until = at + 30000;   // garde : si la fin du son ne vient jamais
        const h = voice.play(st.url, () => { if (speaking === me) speaking = { until: performance.now() + 450, voice: false }; }, who);
        // le son n'a pas démarré (lecture refusée) : on retombe sur la durée du sous-titre
        setTimeout(() => { if (speaking === me && !h.started()) { me.voice = false; me.until = at + minMs; } else if (h.started() && !audioOk) { audioOk = true; showSub(who, text); } }, 1500);
      }
    }
  }
  // iPhone : le son n'est autorisé qu'à partir d'un vrai geste (fin de toucher, clic)
  let audioOk = false, lastLine = '';
  nar.unlock = () => { if (voice && nar.mode === 'voix') voice.unlock(); };
  Object.defineProperty(nar, 'audioOk', { get: () => audioOk });
  nar.setMode = (m) => {
    nar.mode = m;
    if (m !== 'voix' && voice) voice.stop();
    if (m === 'off') { queue = []; showSub('A', ''); }
    speaking = null;
  };
  // une entrée de file = les phrases d'un même fait, dites d'affilée ; seq : ordre d'arrivée (compteur global)
  let seqN = 0, moving = false, lastMove = 0, rateT = null, rateReal = 0, nextPrep = 0;
  const enqueue = (lines, prio, real, t = null) => {
    if (!lines || !lines.length) return;
    if (voice && nar.mode === 'voix') for (const l of lines) if (l[2] !== false) voice.prepare(l[0], speakable(l[1]));
    queue.push({ lines, prio, at: real, t, seq: seqN++ });
    queue.sort((a, b) => b.prio - a.prio || a.seq - b.seq);
    if (queue.length > 5) queue.length = 5;
  };
  const hush = () => { queue = []; if (voice) voice.stop(); speaking = null; };

  // un aparté (ralenti du réalisateur) : une phrase, puis on laisse passer le rejeu sans commenter ni « faire le point »
  let quietUntil = 0;
  nar.aside = (lines, ms) => { hush(); quietUntil = performance.now() + ms; enqueue(lines, Infinity, performance.now()); };
  nar.endAside = () => { if (quietUntil > performance.now()) quietUntil = performance.now() + 300; };
  // changement de vue (entrée dans un système, retour) : l'instant suivant est repris tel quel, sans « point course »
  let resyncing = false;
  nar.resync = () => { resyncing = true; };
  nar.update = (t, { now = null } = {}) => {
    const real = performance.now();
    if (resyncing) { resyncing = false; lastT = t; lastReal = real; rateT = null; return; }
    if (real < quietUntil) { lastT = t; lastReal = real; rateT = null; if (!speaking || real >= speaking.until) { if (speaking && !speaking.voice) showSub('A', ''); speaking = null; if (queue.length) { const q = queue.shift(); say(q.lines[0]); } } return; }
    if (now != null && now < 0) t = -1;                            // avant le départ : rien de la course n'a eu lieu
    if (nar.mode === 'off') { lastT = t; lastReal = real; return; }
    const dtR = Math.max(1e-3, (real - (lastReal || real)) / 1000);
    if (lastT == null) {
      lastT = t < 60 ? -1 : t; lastReal = real; rateT = t; rateReal = real; nextFill = real + 2500;   // au départ : le départ est annoncé
      if (t >= 60 && (now == null || now >= 0)) { const R1 = retour(t); if (R1) enqueue(R1, 3, real); enqueue(recap(t), 3, real); }
    }
    {
      const dt = t - lastT;
      // saut : retour en arrière, bond en avant, ou onglet revenu après une absence (jugé avec la vitesse d'avant)
      const jump = dt < -1 || dt > Math.max(1800, rate * Math.min(dtR, 1) * 6 + 600) || (dtR > 3 && dt > 600);
      // vitesse de la course affichée : mesurée entre deux changements de l'instant (la vue système ne l'envoie que
      // tous les quarts de seconde) ; immobile plus d'une seconde et demie = pause
      if (dt !== 0) {
        if (!jump && rateT != null && real > rateReal) { const r = (t - rateT) / ((real - rateReal) / 1000); if (dt > 0 && r > 0) rate = moving ? rate * 0.7 + r * 0.3 : r; }
        rateT = t; rateReal = real; moving = true; lastMove = real;
      } else if (real - lastMove > 1500) moving = false;
      if (jump) {
        hush();
        if (dt < 0) for (const [k, kt] of said) if (kt > t) said.delete(k);   // on revoit : ces faits seront redits
        enqueue(recap(t), 3, real, t);
      } else if (dt > 0) {
        // faits survenus depuis la dernière image ; en lecture rapide, seulement les plus forts
        const minPrio = rate > 1500 ? 4 : rate > 250 ? 3 : 1;
        for (const e of nar.tl) {
          if (e.t <= lastT) continue; if (e.t > t) break;
          if (e.prio < minPrio || said.has(e.key)) continue;
          said.set(e.key, e.t); enqueue(linesFor(e, t), e.prio, real, e.t);
        }
      }
      lastT = t; lastReal = real;
    }
    // vieilles phrases abandonnées : trop attendu (temps réel), ou la course est loin devant (temps de course)
    queue = queue.filter((q) => q.prio === Infinity || (real - q.at < (q.prio >= 5 ? 30000 : 16000) && (q.t == null || t - q.t < (q.prio >= 5 ? 3 : 1.5) * 3600)));
    if (speaking && real < speaking.until) return;
    if (speaking && !speaking.voice) showSub('A', '');
    speaking = null;
    if (queue.length) {
      const h0 = queue[0].lines[0];
      if (voice && nar.mode === 'voix' && voice.unlocked && h0[2] !== false && real - queue[0].at < 4000 && voice.status(h0[0], speakable(h0[1])).state === 'pending') return;
      const q = queue.shift(); say(q.lines[0]);
      // la suite du même fait, tout de suite ; pour l'ambiance (feuilleton, brèves : priorité 1), un vrai fait de course peut
      // passer entre deux phrases (la suite attend, rafraîchie pour ne pas être jetée comme trop vieille)
      if (q.lines.length > 1) queue.unshift({ ...q, lines: q.lines.slice(1), prio: q.prio <= 1 ? 2.5 : Infinity, at: real });
      nextFill = real + fillGap(now); return;
    }
    // voix : les phrases des faits des 15 prochaines minutes de course sont préparées d'avance (fichier trouvé, ou lu
    // une fois par le serveur), pour partir sans attente ; rien n'est montré ni dit avant l'heure
    if (voice && nar.mode === 'voix' && real >= nextPrep && rate < 120) {   // en direct (×1) ou presque ; pas en lecture rapide
      nextPrep = real + 5000; let n = 0;
      for (const e of nar.tl) { if (e.t <= t) continue; if (e.t > t + 900 || n >= 6) break; if (said.has(e.key)) continue; n++;
        for (const l of linesFor(e, e.t) || []) if (l[2] !== false) voice.prepare(l[0], speakable(l[1])); }
    }
    if (real >= nextFill) {
      const L = filler(t, now); nextFill = real + fillGap(now);
      if (L) enqueue(L, 1, real);
    }
  };
  const fillGap = (now) => {
    if (now != null && now < 0) return 90000 + rnd() * 60000;     // avant-course : le feuilleton, posément (une réplique toutes les 1 min 30 à 2 min 30)
    const slow = !moving || rate < 30;                            // pause ou direct (×1) : on laisse respirer
    return (slow ? 35000 + rnd() * 40000 : 7000 + rnd() * 6000);
  };

  let recapAt = -1e9;
  function recap(t) {
    const rows = feed.standingsAt(t), real = performance.now();
    if (t < 1800 || !rows.length || real - recapAt < 10000) return [];   // pas de point au départ, ni deux d'affilée
    recapAt = real;
    if (rows.every((r) => r.done)) { const w = nar.tl.find((x) => x.kind === 'finish' && x.data.place === 1); return w ? [['A', `Course terminée : victoire ${N[w.racer].du} !`]] : []; }
    const a = rows[0], b = rows[1];
    return nv([['A', `On vous retrouve à ${hh(t)} de course : ${N[a.id].le} en tête${b ? `, ${N[b.id].le} à ${b.gap > 1 ? dur(b.gap) : 'quelques secondes'}` : ''}.`]]);
  }
  nar._linesFor = linesFor;                                       // essais : toutes les phrases d'une course
  return nar;
}
