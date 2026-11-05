// Faux serveur de la Grande Fronde, dans la page (répétition hors ligne : telebyte/?feed=demo-live).
// Il suit les mêmes règles que le SQL v41 (server/schema_mp_v41_grande_fronde.sql) : paris « vainqueur » jusqu'au
// départ, plafond 5 000 CG, identifiant de pari (renvoi sans doublon), plans publiés à l'heure d'entrée, pari mutuel
// (maison 5 %, remboursement si personne sur le vainqueur), encaissement unique, graine révélée à l'arrivée.
// Temps raccourci : paris ouverts COUNTDOWN secondes, puis la course passe RATE fois plus vite que le temps réel.
// Des parieurs fictifs misent aussi, pour que les cotes vivent. Rien ne quitte la page.
import { runRace, planOf } from '../sandbox/race/engine.js';
import { RACE_SYSTEMS, RACERS, PILOT } from '../sandbox/race/raceData.js';

const HOUSE = 5, CAP = 5000;
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));

export async function createFakeServer({ credits = () => 0, countdown: COUNTDOWN = 90, rate: RATE = 720 } = {}) {
  const seed = hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
  const pilot = { ...PILOT, id: 'repetition', name: 'Grande Fronde · répétition', seed };
  const full = runRace({ systems: RACE_SYSTEMS, racers: RACERS, pilot });
  const finish = Object.fromEntries(RACERS.map((r) => [r.id, full.tracks[r.id].finish]));
  const winner = Object.entries(finish).sort((a, b) => a[1] - b[1])[0][0];
  const reveals = full.revealed.map((x) => ({ racer: x.racer, sys: x.sys, t: x.t, plan: planOf(x.plan) }));
  const startMs = Date.now() + COUNTDOWN * 1000;
  const { seed: _s, ...pub } = pilot;
  const ed = { id: 'repetition', name: pilot.name, systems: RACE_SYSTEMS, racers: RACERS, pilot: pub, start_at: new Date(startMs).toISOString(),
    nominal_end_at: new Date(startMs + 76 * 3600e3 / RATE).toISOString(), seed_hash: await sha256(seed), seed: null, result: null, house_pct: HOUSE, stake_cap: CAP };
  const bets = [], payouts = new Map();   // payouts : 'moi' → { amount, kind, claimed }
  let settled = false;
  const elapsed = () => { const d = (Date.now() - startMs) / 1000; return d < 0 ? d : d * RATE; };
  // parieurs fictifs : favoris plus joués, mises régulières jusqu'au départ
  const fav = { fulgurant: 0.36, mule: 0.24, sentinelle: 0.22, cuirasse: 0.18 };
  const crowd = () => { let x = Math.random(), r = 'fulgurant'; for (const [k, p] of Object.entries(fav)) { if ((x -= p) <= 0) { r = k; break; } } bets.push({ id: uid(), user: 'foule-' + (1 + (bets.length % 37)), racer: r, stake: 50 * (1 + Math.floor(Math.random() * 30)), at: Date.now() }); };
  for (let i = 0; i < 14; i++) crowd();
  const crowdTimer = setInterval(() => { if (elapsed() < 0) crowd(); else clearInterval(crowdTimer); }, 2500);
  const pools = () => { const by = {}; let total = 0; for (const b of bets) { by[b.racer] = (by[b.racer] || 0) + b.stake; total += b.stake; } return { total, by_racer: by, bettors: new Set(bets.map((b) => b.user)).size }; };
  function settle() {
    if (settled || elapsed() < full.t1) return;
    settled = true; ed.seed = seed; ed.result = { winner, finish, t1: full.t1 };
    const P = pools(), mine = bets.filter((b) => b.user === 'moi'), win = P.by_racer[winner] || 0;
    if (!mine.length) return;
    if (!win) payouts.set('moi', { amount: mine.reduce((a, b) => a + b.stake, 0), kind: 'remboursement', claimed: false });
    else { const pool = Math.floor(P.total * (100 - HOUSE) / 100), s = mine.filter((b) => b.racer === winner).reduce((a, b) => a + b.stake, 0); if (s) payouts.set('moi', { amount: Math.floor(s * pool / win), kind: 'gain', claimed: false }); }
  }
  const fail = (m) => { throw new Error(m); };
  const api = {
    mp_fronde_edition() {
      settle();
      const el = elapsed(), st = settled ? 'reglee' : el < 0 ? 'annoncee' : 'en_course', pay = payouts.get('moi');
      return { edition: { ...ed }, state: st, elapsed: el, server_now: new Date().toISOString(), rate: RATE, next_needed: false,
        reveals: reveals.filter((x) => settled || x.t <= el), pools: pools(),
        my_bets: bets.filter((b) => b.user === 'moi').map((b) => ({ id: b.id, racer: b.racer, stake: b.stake, at: new Date(b.at).toISOString() })),
        my_payout: pay ? { amount: pay.amount, kind: pay.kind, claimed: pay.claimed } : null };
    },
    mp_fronde_bet({ p_racer, p_stake, p_nonce }) {
      const again = p_nonce && bets.find((b) => b.user === 'moi' && b.nonce === p_nonce);
      if (again) return { ok: true, id: again.id, repeat: true, pools: pools() };
      if (elapsed() >= 0) fail('bets_closed');
      if (!RACERS.some((r) => r.id === p_racer)) fail('bad_racer');
      if (!(p_stake >= 1)) fail('bad_stake');
      const mine = bets.filter((b) => b.user === 'moi').reduce((a, b) => a + b.stake, 0);
      if (mine + p_stake > CAP) fail('over_cap');
      if (credits() < p_stake) fail('not_enough_credits');
      const b = { id: uid(), user: 'moi', racer: p_racer, stake: p_stake, at: Date.now(), nonce: p_nonce }; bets.push(b);
      return { ok: true, id: b.id, my_total: mine + p_stake, pools: pools() };
    },
    mp_fronde_mine() {
      settle(); const pay = payouts.get('moi');
      return { bets: bets.filter((b) => b.user === 'moi').map((b) => ({ id: b.id, edition: ed.id, racer: b.racer, stake: b.stake })),
        payouts: pay ? [{ edition: ed.id, amount: pay.amount, kind: pay.kind, claimed: pay.claimed }] : [] };
    },
    mp_fronde_claim() {
      settle(); const pay = payouts.get('moi');
      if (!pay || pay.claimed) return { claimed_now: false, amount: 0, already: !!pay };
      pay.claimed = true; return { claimed_now: true, amount: pay.amount, kind: pay.kind };
    },
  };
  return {
    winner, full,
    async post(path, body) {
      await new Promise((r) => setTimeout(r, 120));            // un peu de réseau
      if (path.startsWith('/functions/v1/fronde-tick')) return { created: null, edition: ed.id };
      const fn = path.replace('/rest/v1/rpc/', '');
      if (!api[fn]) throw new Error('not_found');
      return JSON.parse(JSON.stringify(api[fn](body || {})));
    },
  };
}
