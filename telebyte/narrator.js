// Voix off de la Grande Fronde (Phase 4, partie E) : un duo de commentateurs de stade.
//   Arno Vasseur — le commentateur, emporté ; Mila Korsh — la consultante, ancienne pilote de fronde, posée.
// Ils racontent la course à partir de la chronologie (timeline.js : seulement ce qui est déjà arrivé à l'instant
// affiché), comblent les temps morts (point course, télémétrie, vécu des pilotes, faits divers, paris, grande
// finale) et parlent avec la synthèse vocale du navigateur (Web Speech, voix françaises). Sous-titres à l'écran.
//
//   const nar = createNarrator({ feed, E, racer, hh, dur, pools: () => ({ total, by_racer, house }) | null,
//                                mine: () => [{ racer, stake }], sub: élément des sous-titres })
//   nar.update(t, { now })     à chaque image (t : instant affiché ; now : présent du direct, < 0 avant le départ)
//   nar.setMode('voix' | 'texte' | 'off'), nar.mode, nar.unlock() (premier toucher : iOS n'autorise le son qu'après)
//   nar.rebuild()              quand le flux change (nouveaux plans publiés)
//   nar.log                    ce qui a été dit (essais)
// Rien ici ne change la course : faits divers et vécu des pilotes sont de la couleur, tirés au hasard sur l'écran.
import { buildTimeline } from './timeline.js';

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
const PILOTS = { sentinelle: 'la commandante Ysée Marr', cuirasse: 'le vieux Brannoc', mule: 'Tobbe le docker', fulgurant: 'Kaï Varon' };
const PROFILE = {
  sentinelle: 'la régulière, jamais très loin, toujours dangereuse',
  cuirasse: 'une coque blindée, lourde, qui encaisse tout',
  mule: 'un cargo reconverti, rapide entre les étoiles, mais court en poussée',
  fulgurant: 'le casse-cou, il adore plonger au ras des géantes, à ses risques et périls',
};
const FAITS = [
  'Un cargo de melons s\'est mis en travers du relais de Vessa : les douaniers comptent encore les melons.',
  'On signale une colonie de méduses spatiales près des anneaux de Kerath. Elles ne parient pas, rassurez-vous.',
  'Le Comptoir annonce une rupture de stock de cristal : tout le monde a misé sa paie sur la course.',
  'Un commandant a tenté de suivre la course en tanker. Il en est à mi-chemin… de son hangar.',
  'La radio de bord du Kerath Lourd capte une émission de cuisine depuis deux heures. Personne n\'ose couper.',
  'Sur Kesh, les mineurs ont installé un écran géant dans le cratère principal. Ambiance de stade.',
  'Un drone de la régie a percuté une lune. La lune va bien.',
  'Dans les tribunes, un supporter a peint son vaisseau aux couleurs de la Mule. Il a oublié les hublots.',
  'Une tempête de poussière sur Oro : les volcanologues ont annulé leur pique-nique.',
  'Le standard de la régie déborde : tout le monde veut savoir ce que mange Kaï Varon avant une plongée. Réponse : rien.',
  'Les pirates de la ceinture ont déclaré une trêve pour regarder la course. Une première.',
  'Un écho mystérieux sur les radars de Nox. Les techniciens parlent d\'un vieux satellite. Ou d\'autre chose.',
  'Un enfant de Kerath a écrit à la régie pour demander si les vaisseaux ont des freins. Excellente question.',
  'On apprend qu\'un ancien vainqueur de la Fronde vend ses gants de pilote au Comptoir. Prix : secret.',
  'Le chef mécanicien de la Sentinelle n\'a pas dormi depuis le départ. Il dit que c\'est normal.',
  'Une flotte de tankers a ralenti pour laisser passer la course. Les klaxons, c\'est eux.',
];
const VECU_SYS = [
  (n, p) => `À bord ${n.du}, ${p} serre les dents : chaque vibration se sent jusque dans les os.`,
  (n, p) => `Message radio ${n.du} : « Ça chauffe, mais elle tient ! »`,
  (n, p) => `On imagine ${p}, les yeux rivés sur la température de la coque.`,
  (n) => `Dans le cockpit ${n.du}, les alarmes de proximité ne se taisent plus.`,
];
const VECU_LEG = [
  (n, p, to) => `Dans le grand vide, ${p} recalcule la trajectoire de ${to} pour la dixième fois.`,
  (n) => `Silence à bord ${n.du} : c'est le moment de manger un morceau et de dormir un peu.`,
  (n, p) => `Radio ${n.du} : « Rien à signaler, on garde le cap. » Calme avant la tempête.`,
  (n) => `${n.Le} file entre les étoiles. Là-dedans, l'équipage vérifie chaque soudure.`,
];

export function createNarrator({ feed, E, racer, hh, dur, pools = () => null, mine = () => [], sub = null }) {
  const N = Object.fromEntries(E.racers.map((r) => [r.id, names(r)]));
  const P = (id) => PILOTS[id] || 'son pilote';
  const sysName = (id) => (E.systems.find((s) => s.id === id) || { name: id }).name;
  const km = (v) => (v / 1e3).toFixed(1).replace('.', ',');
  const pct = (x) => Math.round(x * 100);
  const fmt = (n) => Math.round(n).toLocaleString('fr-CH');
  let seed = 0; for (const c of E.id || 'fronde') seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let x = seed; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const nar = { mode: 'voix', log: [], tl: [] };
  let lastT = null, lastReal = 0, rate = 1, queue = [], speaking = null, nextFill = 0, faitI = Math.floor(rnd() * FAITS.length), fillI = 0;
  const said = new Map();                                        // fait déjà dit → son instant

  nar.rebuild = () => { nar.tl = buildTimeline(feed); };
  nar.rebuild();

  /* ── ce que disent les commentateurs pour chaque fait ── */
  function linesFor(e, t) {
    const n = e.racer ? N[e.racer] : null, d = e.data, S = e.sys ? sysName(e.sys) : '';
    switch (e.kind) {
      case 'start': return [['A', pick(['Et c\'est parti pour la Grande Fronde ! Quatre vaisseaux, trois systèmes, une seule trajectoire parfaite !', 'Top départ ! La Grande Fronde est lancée, et quelle ambiance dans les tribunes !'])],
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
    const kinds = ['recap', 'tele', 'vecu', 'fait', 'paris', 'tele', 'finale', 'vecu'];
    for (let k = 0; k < kinds.length; k++) {
      const kind = kinds[(fillI++) % kinds.length], L = fillOf(kind, t, rows, lead);
      if (L) return L;
    }
    return null;
  }
  function fillOf(kind, t, rows, lead) {
    const id = pick(rows.filter((r) => !r.done)).id, n = N[id], s = feed.stateAt(id, t);
    if (kind === 'recap') {
      if (rows.length < 2) return null;
      const second = rows[1];
      return [['A', `Point course à ${hh(t)} : ${N[lead.id].le} en tête${second.gap > 1 ? `, ${N[second.id].le} à ${dur(second.gap)}` : `, ${N[second.id].le} dans son sillage`}.`]];
    }
    if (kind === 'tele') {
      if (s.phase === 'system' && s.speed) return [['A', `${n.Le} file à ${km(s.speed)} km/s à ${sysName(s.system)}, réservoir à ${pct(s.fuel)} %, coque à ${pct(s.integrity)} %.`]];
      if (s.phase === 'leg') return [['A', `${n.Le} est en plein vide interstellaire, en route vers ${sysName(s.legTo)}. Réservoir à ${pct(s.fuel)} %, coque à ${pct(s.integrity)} %.`]];
      return null;
    }
    if (kind === 'vecu') {
      if (s.phase === 'system') return [['B', pick(VECU_SYS)(n, P(id))]];
      if (s.phase === 'leg') return [['B', pick(VECU_LEG)(n, P(id), sysName(s.legTo))]];
      return null;
    }
    if (kind === 'fait') { const f = FAITS[(faitI++) % FAITS.length]; return [['A', 'Un petit fait divers en passant.'], ['B', f]]; }
    if (kind === 'paris') return betLine(rows);
    if (kind === 'finale') {
      const last = E.systems[E.systems.length - 1], s0 = feed.stateAt(lead.id, t);
      if (s0.phase === 'leg' && s0.legTo === last.id) return [['B', `La grande finale approche : à ${last.name}, l'arrivée se joue à la périapse. ${N[lead.id].Le} mène la danse, mais rien n'est fait.`]];
      if (s0.phase === 'system' && s0.system === last.id) return [['A', `On est dans la grande finale à ${last.name} ! Chaque seconde compte !`]];
      return null;
    }
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
  function preRace(left) {
    const i = (fillI++) % (E.racers.length + 3);
    if (i < E.racers.length) { const r = E.racers[i]; return [['A', `Présentation : ${N[r.id].le}.`], ['B', `${PROFILE[r.id] ? PROFILE[r.id][0].toUpperCase() + PROFILE[r.id].slice(1) : 'Un outsider à surveiller'}. Aux commandes : ${P(r.id)}.`]]; }
    if (i === E.racers.length) return [['A', `Départ dans ${dur(left)} ! Au programme : ${E.systems.map((s) => s.name).join(', puis ')}. Et l'arrivée à la périapse de ${E.systems[E.systems.length - 1].name}.`]];
    if (i === E.racers.length + 1) return betLine(feed.standingsAt(0)) || [['B', 'Les paris sont ouverts jusqu\'au départ. Choisissez bien votre vaisseau.']];
    return [['B', FAITS[(faitI++) % FAITS.length]]];
  }

  /* ── file de parole et synthèse vocale ── */
  const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
  let voices = { A: null, B: null };
  function chooseVoices() {
    if (!synth) return;
    const fr = synth.getVoices().filter((v) => /^fr/i.test(v.lang));
    if (!fr.length) return;
    const pref = (re) => fr.find((v) => re.test(v.name));
    const frFR = fr.filter((v) => /fr[-_]FR/i.test(v.lang));
    const pool = frFR.length ? frFR : fr;
    voices.A = pref(/thomas|nicolas|daniel|henri|paul|mathieu|male|homme/i) || pool[0];
    voices.B = pref(/am[ée]lie|audrey|marie|aur[ée]lie|virginie|julie|denise|female|femme/i) || pool.find((v) => v !== voices.A) || pool[0];
  }
  if (synth) { chooseVoices(); try { synth.addEventListener('voiceschanged', chooseVoices); } catch (e) { synth.onvoiceschanged = chooseVoices; } }
  const speakable = (s) => s.replace(/(\d)['’\u202f\u00a0 ](?=\d{3}\b)/g, '$1').replace(/km\/s/g, 'kilomètres par seconde').replace(/(\d+) h (\d+)/g, '$1 heures $2').replace(/(\d+) h\b/g, '$1 heures')
    .replace(/(\d+) min\b/g, '$1 minutes').replace(/(\d+) s\b/g, '$1 secondes').replace(/ CG\b/g, ' crédits').replace(/(\d) %/g, '$1 pour cent').replace(/\b1re\b/g, 'première').replace(/\b(\d+)e\b/g, '$1ème').replace(/\bJ\+(\d+)/g, 'jour $1,')
    .replace(/\b([A-ZÀÂÉÈÊÎÔÛÇ]{2,})\b/g, (w) => w[0] + w.slice(1).toLowerCase());   // capitales : lues comme des mots, pas épelées
  function showSub(who, text) {
    if (!sub) return;
    if (nar.mode === 'off' || !text) { sub.hidden = true; return; }
    sub.hidden = false; sub.innerHTML = `<b>${SPK[who].name}</b> ${text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}`;
    sub.classList.toggle('b', who === 'B');
  }
  function say(line) {
    const [who, text] = line, at = performance.now();
    nar.log.push({ who, text, t: lastT, at });
    if (nar.log.length > 400) nar.log.shift();
    showSub(who, text);
    const minMs = 1200 + text.length * 55;                  // durée de lecture d'un sous-titre (et repli sans voix)
    speaking = { until: at + minMs, voice: false };
    if (nar.mode === 'voix' && synth && unlocked) {
      try {
        const u = new SpeechSynthesisUtterance(speakable(text));
        u.lang = 'fr-FR'; if (voices[who]) u.voice = voices[who];
        u.rate = SPK[who].rate * (rate > 1000 ? 1.12 : 1); u.pitch = SPK[who].pitch; u.volume = 1;
        const me = speaking; me.voice = true; me.until = at + Math.max(minMs, 25000);   // garde : si onend ne vient jamais
        u.onend = u.onerror = () => { if (speaking === me) speaking = { until: performance.now() + 350, voice: false }; };
        nar._u = u; synth.speak(u);                         // référence gardée : sinon Chrome peut perdre onend
      } catch (e) { /* pas de voix : sous-titres seuls */ }
    }
  }
  let unlocked = false;
  nar.unlock = () => {
    if (unlocked || !synth) { unlocked = true; return; }
    unlocked = true;
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } catch (e) {}
  };
  nar.setMode = (m) => {
    nar.mode = m;
    if (m !== 'voix' && synth) try { synth.cancel(); } catch (e) {}
    if (m === 'off') { queue = []; showSub('A', ''); }
    speaking = null;
  };
  // une entrée de file = les phrases d'un même fait, dites d'affilée ; seq : ordre d'arrivée (compteur global)
  let seqN = 0, moving = false, lastMove = 0, rateT = null, rateReal = 0;
  const enqueue = (lines, prio, real, t = null) => {
    if (!lines || !lines.length) return;
    queue.push({ lines, prio, at: real, t, seq: seqN++ });
    queue.sort((a, b) => b.prio - a.prio || a.seq - b.seq);
    if (queue.length > 5) queue.length = 5;
  };
  const hush = () => { queue = []; if (synth && nar.mode === 'voix') try { synth.cancel(); } catch (e) {} speaking = null; };

  nar.update = (t, { now = null } = {}) => {
    const real = performance.now();
    if (now != null && now < 0) t = -1;                            // avant le départ : rien de la course n'a eu lieu
    if (nar.mode === 'off') { lastT = t; lastReal = real; return; }
    const dtR = Math.max(1e-3, (real - (lastReal || real)) / 1000);
    if (lastT == null) {
      lastT = t < 60 ? -1 : t; lastReal = real; rateT = t; rateReal = real; nextFill = real + 2500;   // au départ : le départ est annoncé
      if (t >= 60) enqueue(recap(t), 3, real);
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
      const q = queue.shift(); say(q.lines[0]);
      if (q.lines.length > 1) queue.unshift({ ...q, lines: q.lines.slice(1), prio: Infinity });   // la suite du même fait, tout de suite
      nextFill = real + fillGap(now); return;
    }
    if (real >= nextFill) {
      const L = filler(t, now); nextFill = real + fillGap(now);
      if (L) enqueue(L, 1, real);
    }
  };
  const fillGap = (now) => {
    const slow = !moving || rate < 30 || (now != null && now < 0);   // pause, direct (×1) ou avant-course : on laisse respirer           // direct (×1) ou avant-course : on laisse respirer
    return (slow ? 35000 + rnd() * 40000 : 7000 + rnd() * 6000);
  };
  let recapAt = -1e9;
  function recap(t) {
    const rows = feed.standingsAt(t), real = performance.now();
    if (t < 1800 || !rows.length || real - recapAt < 10000) return [];   // pas de point au départ, ni deux d'affilée
    recapAt = real;
    if (rows.every((r) => r.done)) { const w = nar.tl.find((x) => x.kind === 'finish' && x.data.place === 1); return w ? [['A', `Course terminée : victoire ${N[w.racer].du} !`]] : []; }
    const a = rows[0], b = rows[1];
    return [['A', `On vous retrouve à ${hh(t)} de course : ${N[a.id].le} en tête${b ? `, ${N[b.id].le} à ${b.gap > 1 ? dur(b.gap) : 'quelques secondes'}` : ''}.`]];
  }
  nar._linesFor = linesFor;                                       // essais : toutes les phrases d'une course
  return nar;
}
