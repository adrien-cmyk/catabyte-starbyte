// DemoFeed — flux de course de démonstration (Phase 2), en JavaScript pur et déterministe.
// Même interface que le futur flux serveur (Phase 3, Supabase) : la carte de course et Télébyte ne lisent que ça.
//
//   feed.edition                       → { id, name, systems[], racers[], checkpoints[], t0, t1 }
//   feed.stateAt(racerId, t)           → { phase: 'system'|'leg'|'done', system, legFrom, legTo, f, p, v, speed,
//                                          accel, fuel, temp, integrity, next, lastCp, rank }
//   feed.standingsAt(t)                → [{ id, rank, cp, lastCp, gap, phase }]
//   feed.plannedPath(racerId, systemId) / feed.actualPath(racerId, systemId, t)   → échantillons { t, p }
//   feed.nextEvent(t)                  → { t, racer, label } (prochain point de contrôle, tous racers confondus)
//
// Le calcul de la course vit dans engine.js (moteur partagé avec le serveur) ; ce fichier n'en est que la lecture.
// DemoFeed : course complète simulée localement (démo hors ligne). RaceFeed : lecture d'un résultat donné
// (le flux serveur de la Phase 3 lui passe la course rejouée à partir des plans révélés).
import { sampleAt } from '../core/Gravity.js';
import { RACE_SYSTEMS, RACERS, PILOT, gmOfGiant } from './raceData.js';
import { runRace, planOf, clamp, FUEL_PER_LEG, PLAN_LABEL } from './engine.js';
export { choosePlan, PLAN_LABEL } from './engine.js';

export class RaceFeed {
  constructor({ systems = RACE_SYSTEMS, racers = RACERS, pilot = PILOT, result }) {
    this.systems = systems; this.racers = racers; this.pilot = pilot;
    this.tracks = result.tracks;                        // racerId → { segs, cps, finish, events }
    this.edition = { id: pilot.id, name: pilot.name, seed: pilot.seed, systems, racers, t0: 0, t1: result.t1 };
  }
  _seg(id, t) { const tr = this.tracks[id]; return tr.segs.find((s) => t >= s.t0 && t <= s.t1) || (t < 0 ? tr.segs[0] : tr.segs[tr.segs.length - 1]); }
  // sans aucun plan publié (avant le départ) : au départ, à l'entrée du premier système
  _start(id) { const sys = this.systems[0]; return { id, phase: 'start', system: sys.id, legTo: sys.id, f: 0, speed: null, accel: 0, temp: 260, fuel: 1, integrity: 1, lastCp: null, next: null, cpCount: 0 }; }
  stateAt(id, t) {
    const tr = this.tracks[id], s = this._seg(id, t);
    if (!s) return this._start(id);
    const done = t >= tr.finish;
    const passed = tr.cps.filter((c) => c.t <= t), next = tr.cps.find((c) => c.t > t) || null;
    const st = { id, phase: done ? 'done' : s.kind, lastCp: passed.length ? passed[passed.length - 1] : null, next, cpCount: passed.length };
    // carburant et intégrité : états annoncés par le moteur (poussées, chauffe, étapes), le carburant d'étape s'écoule
    const ev = tr.events; let e = ev[0]; for (const x of ev) if (x.t <= t) e = x;
    st.fuel = e.fuel; st.integrity = e.integrity;
    if (s.kind === 'leg') { const f = clamp((t - s.t0) / (s.t1 - s.t0), 0, 1); st.fuel = e.fuel - f * FUEL_PER_LEG; }
    st.fuel = Math.max(0, st.fuel);
    if (s.kind === 'system') {
      const p = [0, 0, 0], v = [0, 0, 0]; sampleAt(s.samples, Math.min(Math.max(t, s.t0), s.t1), p, v);
      const r = Math.hypot(...p), R = s.sys.R;
      st.system = s.sys.id; st.p = p; st.v = v; st.speed = Math.hypot(...v);
      st.thrust = Math.abs(t - s.tpPlanned) < 600 ? 1 : 0.25;                    // poussée de périapse, sinon croisière
      st.accel = gmOfGiant(R) / (r * r) + (Math.abs(t - s.tpPlanned) < 600 ? s.plan.dv / 1200 : 0);
      st.plan = s.plan.kind; st.planLabel = PLAN_LABEL[s.plan.kind] + (s.plan.failed && t > s.tpPlanned - 600 ? ' · surchauffe, poussée coupée' : '');
      // température : chauffe radiative et frottement de la haute atmosphère près de la géante, plus la poussée
      st.temp = 290 + 1400 * Math.pow(R / r, 6) + (Math.abs(t - s.tpPlanned) < 600 ? 260 : 0);
    } else {
      const f = Math.min(1, Math.max(0, (t - s.t0) / (s.t1 - s.t0)));
      st.legFrom = s.from.id; st.legTo = s.to.id; st.f = f; st.speed = null; st.accel = 0; st.temp = 260;
    }
    return st;
  }
  // classement : nombre de points de contrôle passés, puis ordre de passage au dernier ; écart au premier au dernier
  // point de contrôle commun (en secondes). ÉQUITÉ DES PARIS : n'utilise que des passages déjà faits (≤ t), jamais
  // la trajectoire à venir, que le serveur connaît mais ne doit pas laisser deviner.
  standingsAt(t) {
    const rows = this.racers.map((r) => {
      const tr = this.tracks[r.id], passed = tr.cps.filter((c) => c.t <= t);
      return { id: r.id, name: r.name, cp: passed.length, lastT: passed.length ? passed[passed.length - 1].t : 0, done: t >= tr.finish, finish: tr.finish };
    });
    rows.sort((a, b) => (b.cp - a.cp) || (a.lastT - b.lastT));
    const lead = rows[0];
    rows.forEach((row, i) => {
      row.rank = i + 1;
      const k = Math.min(row.cp, lead.cp) - 1;
      row.gap = i === 0 || k < 0 ? 0 : this.tracks[row.id].cps[k].t - this.tracks[lead.id].cps[k].t;
      row.phase = this.stateAt(row.id, t).phase;
    });
    return rows;
  }
  plannedPath(id, sysId) { const s = this.tracks[id].segs.find((x) => x.kind === 'system' && x.sys.id === sysId); return s ? s.samples : []; }
  actualPath(id, sysId, t) { return this.plannedPath(id, sysId).filter((x) => x.t <= t); }
  nextEvent(t) {
    let best = null;
    for (const r of this.racers) { const c = this.tracks[r.id].cps.find((x) => x.t > t); if (c && (!best || c.t < best.t)) best = { t: c.t, racer: r.id, label: c.label }; }
    return best;
  }
}

// flux d'une course publiée au fil de l'eau (Phase 3) : la source donne les plans des pilotes à mesure qu'ils entrent
// dans les systèmes ; le flux rejoue la course avec le moteur partagé (mêmes trajectoires que le serveur) et prévient
// les vues (onUpdate) quand un plan arrive. Rien de l'avenir n'est connu : ni les plans à venir, ni le vainqueur.
//   source.reveals(t, déjà) → [{ racer, sys, t, plan }] publiés jusqu'à l'instant t et pas encore reçus
export class ServerFeed extends RaceFeed {
  constructor({ source, systems = RACE_SYSTEMS, racers = RACERS, pilot = PILOT }) {
    const memo = new Map();
    super({ systems, racers, pilot, result: runRace({ systems, racers, pilot, plans: {}, memo }) });
    this.source = source; this.plans = {}; this.memo = memo; this.version = 0; this._cb = [];
    this.nominal = (pilot.nominalHours || 76) * 3600;          // durée annoncée (le curseur s'arrête là tant que la course n'est pas finie)
    this._apply(null);
  }
  onUpdate(f) { this._cb.push(f); return this; }
  // à appeler avec l'instant affiché : récupère ce qui est publié jusque-là ; true si la course a changé
  sync(t) {
    const fresh = this.source.reveals(Math.max(0, t), this.plans);
    if (!fresh.length) return false;
    for (const x of fresh) this.plans[`${x.racer}|${x.sys}`] = x.plan;
    this._apply(runRace({ systems: this.systems, racers: this.racers, pilot: this.pilot, plans: this.plans, memo: this.memo }));
    this.version++; for (const f of this._cb) f(this);
    return true;
  }
  _apply(res) {
    if (!res) { this.edition.t1 = this.nominal; this.complete = false; return; }
    this.tracks = res.tracks; this.complete = res.complete;
    const known = Object.values(res.tracks).map((x) => x.finish).filter(Number.isFinite);
    this.edition.t1 = res.complete ? res.t1 : Math.max(this.nominal, ...known);
  }
  // estimation du premier passage à la périapse d'un système (boutons d'étapes) : connu si un plan y est publié,
  // sinon fin d'étape la plus proche + approche typique, sinon le calendrier nominal
  etaPeriapsis(sysId) {
    let tp = Infinity, entry = Infinity;
    for (const tr of Object.values(this.tracks)) {
      for (const s of tr.segs) { if (s.kind === 'system' && s.sys.id === sysId) tp = Math.min(tp, s.tp); if (s.kind === 'leg' && s.to.id === sysId) entry = Math.min(entry, s.t1); }
    }
    if (Number.isFinite(tp)) return { t: tp, known: true };
    const k = this.systems.findIndex((s) => s.id === sysId);
    if (!Number.isFinite(entry)) entry = k * (12 + this.pilot.legHours) * 3600;     // ~12 h dans un système, puis l'étape
    return { t: entry + 6.1 * 3600, known: false };
  }
}

// source simulée (essais hors ligne) : la course entière est calculée ici, en secret, et ses plans ne sont donnés
// qu'une fois l'instant d'entrée atteint — exactement ce que fera le serveur
export class MockSource {
  constructor({ systems = RACE_SYSTEMS, racers = RACERS, pilot = PILOT } = {}) { this.full = runRace({ systems, racers, pilot }); }
  reveals(t, have) {
    return this.full.revealed.filter((x) => x.t <= t && !have[`${x.racer}|${x.sys}`]).map((x) => JSON.parse(JSON.stringify({ ...x, plan: planOf(x.plan) })));
  }
}

// choix du flux d'après l'adresse : ?feed=mock (publication progressive simulée) ; défaut : démo complète
export function feedFromUrl(search = (typeof location !== 'undefined' ? location.search : '')) {
  const k = new URLSearchParams(search).get('feed');
  if (k === 'mock') return new ServerFeed({ source: new MockSource() });
  return new DemoFeed();
}

export class DemoFeed extends RaceFeed {
  constructor({ systems = RACE_SYSTEMS, racers = RACERS, pilot = PILOT } = {}) {
    super({ systems, racers, pilot, result: runRace({ systems, racers, pilot }) });
  }
}
