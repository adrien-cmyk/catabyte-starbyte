// Réalisateur du Télébyte (Phase 4, partie D) : le « mode TV ». La caméra va d'elle-même là où ça se passe —
// passage serré dans un système (vue système, poursuite du racer), étape interstellaire (couloir), vue d'ensemble —
// avec un bandeau d'incrustation, et un ralenti sur les moments forts du racer suivi. Un geste du joueur reprend la
// main ; le mode TV revient après un temps sans geste.
//
//   const dir = createDirector({ feed, E, racer, hh, dur, getTl, act })
//     act : { inSystem(), sysId(), corOpen(), corK(), sel(), select(id), dive(sys, sel), leave(then), corridor(k, sel),
//             closeCorridor(), follow(id), slowmo(tc, label), lower(html | null) }
//   dir.update(t)    à chaque image ; dir.setOn(bool), dir.on ; dir.userTouched() (pause), dir.state (essais)
// N'anticipe qu'avec ce qui est publié et que l'écran montre déjà (heures de passage des plans connus) ; jamais avec
// les faits à venir (surchauffe, panne…) : couper vers un racer juste avant son incident le trahirait.
const DWELL = 14000, PAUSE = 45000, SLOW_GAP = 40000;

export function createDirector({ feed, E, racer, hh, dur, getTl, act }) {
  const D = { on: false, state: { target: null, pausedUntil: 0, cuts: 0, slows: [] } };
  let cur = null, cutAt = 0, lastT = null, slowAt = 0, lowerUntil = 0, pending = null;
  const slowDone = new Set();
  const sysName = (id) => (E.systems.find((s) => s.id === id) || { name: id }).name;
  const legIndex = (from) => E.systems.findIndex((s) => s.id === from);

  // ce qui mérite l'antenne à l'instant t : une note par cible possible
  function candidates(t) {
    const out = [], rows = feed.standingsAt(t), rank = Object.fromEntries(rows.map((r) => [r.id, r.rank]));
    const last = E.systems[E.systems.length - 1].id;
    for (const r of E.racers) {
      const tr = feed.tracks[r.id], st = feed.stateAt(r.id, t);
      if (st.phase === 'system') {
        const seg = tr.segs.find((s) => s.kind === 'system' && s.sys.id === st.system && t >= s.t0 && t <= s.t1);
        if (!seg) continue;
        const dtp = seg.tp - t;                                     // périapse (publiée avec le plan, déjà affichée)
        let sc = 2;
        if (dtp > -900 && dtp < 2700) sc += 6 * (1 - Math.min(1, Math.abs(dtp - 300) / 2700));   // le passage approche
        if (seg.plan && seg.plan.kind === 'plongée') sc += 2;
        if (st.system === last) sc += 3;                            // la grande finale
        sc += (5 - (rank[r.id] || 4)) * 0.6;                        // la tête de course d'abord
        // duel : un autre racer dans le même système, à moins de 15 min
        let duel = false; for (const o of E.racers) if (o.id !== r.id) { const so = feed.stateAt(o.id, t); if (so.phase === 'system' && so.system === st.system) { const row = rows.find((x) => x.id === o.id), me = rows.find((x) => x.id === r.id); if (row && me && Math.abs(row.gap - me.gap) < 900) duel = true; } }
        if (duel) sc += 1.5;                                        // une seule fois, quel que soit le nombre de rivaux
        out.push({ kind: 'system', sys: st.system, racer: r.id, score: sc, urgent: dtp > -60 && dtp < 1200, why: dtp > 0 && dtp < 2700 ? `périapse à ${sysName(st.system)} dans ${dur(dtp)}` : st.system === last ? `grande finale à ${sysName(st.system)}` : `en passage à ${sysName(st.system)}` });
      } else if (st.phase === 'leg') {
        let sc = 1.5 + (5 - (rank[r.id] || 4)) * 0.4;
        // un fait d'étape qui vient d'arriver (déjà passé : on peut le montrer)
        for (const h of tr.happenings || []) if (h.t <= t && t - h.t < 1800 && ['beltHit', 'failure', 'repair', 'flare'].includes(h.kind)) sc += 4;
        if (st.legTo === last) sc += 0.5;
        out.push({ kind: 'corridor', k: legIndex(st.legFrom), racer: r.id, score: sc, why: `en route vers ${sysName(st.legTo)}` });
      }
    }
    if (!out.length) out.push({ kind: 'universe', score: 1, why: 'vue d\'ensemble' });
    out.sort((a, b) => b.score - a.score);
    return out;
  }
  const same = (a, b) => a && b && a.kind === b.kind && a.sys === b.sys && a.k === b.k;
  const valid = (c, t) => {
    if (!c) return false;
    if (c.kind === 'system') { const st = feed.stateAt(c.racer, t); return st.phase === 'system' && st.system === c.sys; }
    if (c.kind === 'corridor') return E.racers.some((r) => { const st = feed.stateAt(r.id, t); return st.phase === 'leg' && legIndex(st.legFrom) === c.k; });
    return true;
  };

  function cut(c, t) {
    cur = c; cutAt = performance.now(); D.state.target = c; D.state.cuts++; lowerUntil = cutAt + 7000;
    const nm = c.racer ? racer[c.racer].name : '';
    act.lower(`<b>📺 Mode TV</b> ${nm ? `<span>${nm}</span> · ` : ''}${c.why}`);
    if (c.kind === 'system') {
      act.closeCorridor();
      if (act.inSystem() && act.sysId() === c.sys) { act.follow(c.racer); return; }
      if (act.inSystem()) { act.leave(null, c.racer); pending = c; return; }   // d'abord remonter, puis entrer dans l'autre système
      act.select(c.racer); act.dive(c.sys, c.racer); pending = { ...c, follow: true };
    } else if (c.kind === 'corridor') {
      if (act.inSystem()) { act.select(c.racer); act.leave('corridor', c.racer); return; }
      act.select(c.racer); act.corridor(c.k, c.racer);
    } else {
      act.closeCorridor(); if (act.inSystem()) act.leave(null);
    }
  }

  let blocked = null;                                             // cible dont l'entrée a échoué : on la laisse un moment
  D.update = (t) => {
    const now = performance.now();
    if (lowerUntil && now > lowerUntil) { lowerUntil = 0; act.lower(D.on && now >= D.state.pausedUntil ? '<b>📺</b>' : null, true); }
    if (!D.on) { lastT = t; return; }
    if (now < D.state.pausedUntil) { lastT = t; return; }
    // suites d'une coupe en deux temps (remonter puis plonger ; suivre une fois entré)
    if (pending) {
      if (pending.follow && act.inSystem()) { act.follow(pending.racer); pending = null; }
      else if (!pending.follow && !act.inSystem()) { const p = pending; pending = null; cut(p, t); }
      else if (now - cutAt > 12000) { blocked = { c: pending, until: now + 30000 }; pending = null; cur = null; }   // l'entrée n'a pas eu lieu
      lastT = t; return;
    }
    const all = candidates(t).filter((c) => !(blocked && now < blocked.until && same(c, blocked.c)));
    const best = all[0] || { kind: 'universe', score: 1, why: 'vue d\'ensemble' };
    if (cur) { const mine = all.find((c) => same(c, cur) && c.racer === cur.racer) || all.find((c) => same(c, cur)); if (mine) cur.score = mine.score; }   // note du plan en cours, à jour
    const stale = !valid(cur, t), wait = now - cutAt;
    let cutNow = false;
    // changer de plan : après un temps d'antenne minimal, ou plus tôt pour un passage imminent ailleurs
    if (!cur || stale || (!same(best, cur) && ((wait > DWELL && best.score > (cur.score || 0) * 1.25 + 0.5) || (best.urgent && !cur.urgent && wait > 4000 && best.score > (cur.score || 0))))) { cut(best, t); cutNow = true; }
    else if (same(best, cur) && best.racer !== cur.racer && cur.kind === 'system' && ((wait > DWELL && best.score > cur.score + 1) || (best.urgent && !cur.urgent && wait > 4000))) {
      cur = best; cutAt = now; D.state.target = best; act.follow(best.racer);   // un autre racer dans le même système
    }
    // ralenti : moment fort du racer suivi, juste passé (dans la vue système ; jamais au moment d'une coupe)
    if (!cutNow && !pending && lastT != null && t > lastT && act.inSystem() && now - slowAt > SLOW_GAP) {
      const sel = act.sel(), end = t >= E.t1 - 1;                    // à la toute fin, l'horloge s'arrête sur la dernière arrivée
      for (const e of getTl()) {
        if (e.t > t) break;
        if (e.t > t - 20 && !(end && e.kind === 'finish')) continue;
        if (e.t <= lastT - 20 || e.racer !== sel || slowDone.has(e.key)) continue;
        const strong = (e.kind === 'periapsis' && e.data.plan === 'plongée') || e.kind === 'moon' || e.kind === 'failed' || e.kind === 'finish' || (e.kind === 'overtake' && e.data.lead);
        if (!strong) continue;
        slowDone.add(e.key); slowAt = now; D.state.slows.push(e.kind);
        const label = { periapsis: 'la plongée', moon: 'le passage près de ' + (e.data.moon || 'la lune'), failed: 'la surchauffe', finish: 'l\'arrivée', overtake: 'le dépassement' }[e.kind];
        act.slowmo(e.t, `${racer[e.racer].name} · ${label}`);
        break;
      }
    }
    lastT = t;
  };
  D.setOn = (on) => { D.on = on; cur = null; pending = null; D.state.pausedUntil = 0; act.lower(on ? '<b>📺 Mode TV</b> la régie prend la main' : null); lowerUntil = on ? performance.now() + 3000 : 0; };
  D.userTouched = () => {
    if (!D.on) return;
    D.state.pausedUntil = performance.now() + PAUSE; pending = null; cur = null;
    act.lower('<b>📺 À toi</b> 45 s · <u data-tv-resume>rendre à la régie</u> · <u data-tv-off>arrêter la TV</u>'); lowerUntil = D.state.pausedUntil;   // visible toute la pause
  };
  D.paused = () => D.on && performance.now() < D.state.pausedUntil;
  D.resume = () => { D.state.pausedUntil = 0; cur = null; lowerUntil = 0; act.lower('<b>📺</b>', true); };
  return D;
}
