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
import { runRace, clamp, FUEL_PER_LEG, PLAN_LABEL } from './engine.js';
export { choosePlan, PLAN_LABEL } from './engine.js';

export class RaceFeed {
  constructor({ systems = RACE_SYSTEMS, racers = RACERS, pilot = PILOT, result }) {
    this.systems = systems; this.racers = racers; this.pilot = pilot;
    this.tracks = result.tracks;                        // racerId → { segs, cps, finish, events }
    const ref = this.tracks[racers[0].id];
    this.edition = { id: pilot.id, name: pilot.name, seed: pilot.seed, systems, racers, t0: 0, t1: result.t1, checkpoints: ref.cps.map((c) => c.label) };
  }
  _seg(id, t) { const tr = this.tracks[id]; return tr.segs.find((s) => t >= s.t0 && t <= s.t1) || (t < 0 ? tr.segs[0] : tr.segs[tr.segs.length - 1]); }
  stateAt(id, t) {
    const tr = this.tracks[id], racer = this.racers.find((r) => r.id === id), s = this._seg(id, t);
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

export class DemoFeed extends RaceFeed {
  constructor({ systems = RACE_SYSTEMS, racers = RACERS, pilot = PILOT } = {}) {
    super({ systems, racers, pilot, result: runRace({ systems, racers, pilot }) });
  }
}
