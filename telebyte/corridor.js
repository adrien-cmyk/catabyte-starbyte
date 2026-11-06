// Vue couloir du Télébyte (Phase 4, partie B) : une étape interstellaire racontée comme une piste. Départ à gauche
// (système quitté), arrivée à droite, les vaisseaux avancent selon leur distance parcourue (immobiles pendant une
// panne, une réparation ou un abri contre une éruption), la ceinture d'astéroïdes et son raccourci au-dessus de la
// piste principale, l'éruption stellaire qui balaie l'étape, les chocs et pannes signalés au-dessus des vaisseaux.
// Deux cadrages : Ensemble (toute l'étape) et Suivre (fenêtre autour du racer choisi, les autres en bord d'écran).
//
//   const cor = mountCorridor({ feed, E, racer, hh, dur, onSelect })
//   cor.open(k | null)  (k : indice de l'étape ; null = celle du racer choisi ou de la tête), cor.close(), cor.isOpen
//   cor.update(t, dt, sel)   à chaque image ; cor.legNow(t, sel) → étape à montrer (ou -1)
// Ne lit que le flux (ce qui est révélé) et n'affiche que ce qui s'est passé à l'instant t.
const LY_KM = 9.4607e12;

export function mountCorridor({ feed, E, racer, hh, dur, onSelect = () => {} }) {
  const root = document.getElementById('corridor'), cv = root.querySelector('canvas'), ctx = cv.getContext('2d');
  const title = root.querySelector('.co-title'), btns = root.querySelectorAll('.co-views button');
  let k = -1, mode = 'ensemble', W = 0, H = 0, dpr = 1, scroll = 0, auto = true, lastT = null;
  const S = { isOpen: false };
  // étoiles du fond (défilent : on voyage)
  const stars = []; { let s = 3; const R = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 140; i++) stars.push({ x: R(), y: R(), z: 0.2 + R() * 0.8 }); }
  const rocks = []; { let s = 17; const R = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 90; i++) rocks.push({ f: R(), y: R(), r: 0.6 + R() * 1.8 }); }

  function resize() {
    const r = root.getBoundingClientRect(); dpr = Math.min(devicePixelRatio || 1, 2);
    W = Math.max(1, r.width); H = Math.max(1, r.height - 40);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
  }
  addEventListener('resize', () => { if (S.isOpen) resize(); });
  for (const b of btns) b.onclick = () => { if (b.dataset.v === 'close') return S.close(); mode = b.dataset.v; paintBtns(); };
  const paintBtns = () => { for (const b of btns) b.classList.toggle('on', b.dataset.v === mode); };
  // toucher un vaisseau : le choisir (et passer en Suivre)
  cv.addEventListener('click', (e) => {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null; for (const h of hits) { const d = Math.hypot(h.x - x, h.y - y); if (d < 26 && (!best || d < best.d)) best = { ...h, d }; }
    if (best) { onSelect(best.id); mode = 'suivre'; paintBtns(); }
  });
  let hits = [];

  // étape montrée : celle du racer choisi s'il voyage, sinon celle où voyagent le plus de racers
  S.legNow = (t, sel) => {
    const legOf = (id) => { const st = feed.stateAt(id, t); return st.phase === 'leg' ? E.systems.findIndex((s) => s.id === st.legFrom) : -1; };
    if (sel) { const x = legOf(sel); if (x >= 0) return x; }
    const n = {}; for (const r of E.racers) { const x = legOf(r.id); if (x >= 0) n[x] = (n[x] || 0) + 1; }
    const ks = Object.keys(n).map(Number).sort((a, b) => n[b] - n[a] || a - b);
    return ks.length ? ks[0] : -1;
  };
  S.open = (kk = null, t = 0, sel = null) => {
    S.isOpen = true; root.hidden = false; document.body.classList.add('corr');
    auto = kk == null; k = kk == null ? S.legNow(t, sel) : kk; if (k < 0) k = 0;
    mode = sel ? 'suivre' : 'ensemble'; paintBtns(); resize();
  };
  S.close = () => { S.isOpen = false; root.hidden = true; document.body.classList.remove('corr'); };

  // segment d'étape d'un racer, et sa distance parcourue (fraction) : à l'arrêt pendant les temps perdus
  function legSeg(id) { return feed.tracks[id].segs.find((s) => s.kind === 'leg' && s.from.id === E.systems[k].id); }
  function stopsOf(id, seg) {
    const out = [];
    for (const h of feed.tracks[id].happenings || []) if (h.t >= seg.t0 && h.t <= seg.t1 && h.data && h.data.lost) out.push({ t: h.t, lost: h.data.lost, h });
    return out;
  }
  function distF(id, seg, t) {
    const stops = stopsOf(id, seg), total = seg.t1 - seg.t0, lostAll = stops.reduce((a, s) => a + s.lost, 0);
    let moved = Math.min(Math.max(t, seg.t0), seg.t1) - seg.t0, stopped = null;
    for (const s of stops) { const a = s.t - seg.t0; if (moved > a) { const inStop = Math.min(moved - a, s.lost); moved -= inStop; if (inStop < s.lost) stopped = s; } }
    return { f: Math.max(0, Math.min(1, moved / Math.max(1, total - lostAll))), stopped };
  }

  S.update = (t, dt, sel) => {
    if (!S.isOpen) return;
    if (auto) { const x = S.legNow(t, sel); if (x >= 0) k = x; }
    const from = E.systems[k], to = E.systems[k + 1]; if (!to) return;
    const dly = Math.hypot(to.galPos[0] - from.galPos[0], to.galPos[1] - from.galPos[1], to.galPos[2] - from.galPos[2]);
    const hz = feed.hazards && feed.hazards.legs ? feed.hazards.legs[k] : null;
    const tt = `${from.name} → ${to.name} · ${dly.toFixed(1).replace('.', ',')} al`;
    if (title.textContent !== tt) title.textContent = tt;
    // vitesse apparente du défilement : la course avance (lecture) → les étoiles filent
    const adv = lastT == null ? 0 : Math.max(0, Math.min(3600, t - lastT)); lastT = t;
    scroll += adv / 900 + dt * 0.02;
    const c = ctx; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(2,4,9,.86)'; c.fillRect(0, 0, W, H);
    for (const s of stars) {
      const x = ((s.x - scroll * s.z * 0.08) % 1 + 1) % 1 * W, y = s.y * H, l = 2 + s.z * 10 * Math.min(1, adv / 120 + 0.15);
      c.strokeStyle = `rgba(200,220,255,${0.15 + s.z * 0.35})`; c.lineWidth = s.z; c.beginPath(); c.moveTo(x, y); c.lineTo(x + l, y); c.stroke();
    }
    // piste : marges, ligne principale, voie de la ceinture
    const L = 34, R = W - 34, yMain = H * 0.64, yBelt = H * 0.34;
    const X0 = (f) => L + (R - L) * f;
    // cadrage Suivre : fenêtre autour du racer choisi
    let fx = (f) => X0(f), win = null;
    const selSeg = sel && legSeg(sel);
    if (mode === 'suivre' && selSeg && t >= selSeg.t0) {
      const fc = distF(sel, selSeg, t).f, span = 0.22, a = Math.max(0, Math.min(1 - span, fc - span / 2));
      win = [a, a + span]; fx = (f) => L + (R - L) * (f - a) / span;
    }
    // systèmes aux deux bouts
    const edge = (f, name, left) => { const x = fx(f); if (x < L - 4 || x > R + 4) return; c.fillStyle = '#9fd4ec'; c.beginPath(); c.arc(x, yMain, 5, 0, 7); c.fill(); c.font = '600 10px system-ui, sans-serif'; c.textAlign = left ? 'left' : 'right'; c.fillStyle = '#cfe6f3'; c.fillText(name.toUpperCase(), x + (left ? -2 : 2), yMain + 22); };
    c.strokeStyle = 'rgba(255,201,160,.45)'; c.setLineDash([8, 6]); c.lineWidth = 1.5; c.beginPath(); c.moveTo(Math.max(L, fx(0)), yMain); c.lineTo(Math.min(R, fx(1)), yMain); c.stroke(); c.setLineDash([]);
    edge(0, from.name, true); edge(1, to.name, false);
    if (hz && hz.belt) {
      const b0 = fx(0.26), b1 = fx(0.72);
      c.fillStyle = 'rgba(184,165,138,.07)'; c.fillRect(Math.max(0, b0), yBelt - H * 0.13, Math.min(W, b1) - Math.max(0, b0), H * 0.26);
      for (const r of rocks) { const x = fx(0.26 + r.f * 0.46); if (x < 0 || x > W) continue; c.fillStyle = 'rgba(205,185,153,.55)'; c.beginPath(); c.arc(x, yBelt + (r.y - 0.5) * H * 0.24, r.r, 0, 7); c.fill(); }
      c.strokeStyle = 'rgba(205,185,153,.35)'; c.setLineDash([3, 5]); c.beginPath(); c.moveTo(fx(0.2), yMain); c.quadraticCurveTo(fx(0.26), yBelt, fx(0.32), yBelt); c.lineTo(fx(0.66), yBelt); c.quadraticCurveTo(fx(0.72), yBelt, fx(0.78), yMain); c.stroke(); c.setLineDash([]);
      c.font = '9px ui-monospace, monospace'; c.fillStyle = '#cdb999'; c.textAlign = 'left';
      if (b0 > -200 && b0 < W) c.fillText(`⁂ CEINTURE · raccourci −${Math.round(hz.belt.gain * 100)} %`, Math.max(6, b0), yBelt - H * 0.13 - 4);
    }
    // éruption en cours (un fait déjà arrivé à l'un des racers de cette étape)
    let flare = null;
    for (const r of E.racers) for (const h of feed.tracks[r.id].happenings || []) if (h.kind === 'flare' && h.sys === to.id && t >= h.t && t <= h.t + (h.data.dur || 0)) flare = h;
    if (flare) {
      const a = 0.16 + 0.07 * Math.sin(performance.now() / 260);
      const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, `rgba(255,150,60,${a + 0.1})`); g.addColorStop(1, `rgba(255,150,60,${a * 0.3})`);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.font = '700 11px system-ui, sans-serif'; c.fillStyle = '#ffd27a'; c.textAlign = 'center'; c.fillText('☀ ÉRUPTION STELLAIRE EN COURS', W / 2, 16);
    } else if (hz) { c.font = '9px ui-monospace, monospace'; c.fillStyle = 'rgba(255,176,112,.8)'; c.textAlign = 'right'; c.fillText(`☀ risque d'éruption : ${hz.flare}`, W - 8, 14); }
    // vaisseaux
    hits = [];
    const rows = feed.standingsAt(t), placed = [];
    const list = E.racers.map((r) => {
      const seg = legSeg(r.id), st = feed.stateAt(r.id, t);
      if (!seg || t < seg.t0) return { r, where: 'avant', st };
      if (t > seg.t1) return { r, where: 'après', st };
      const d = distF(r.id, seg, t); return { r, where: 'ici', seg, d, st };
    });
    for (const it of list) {
      const { r, st } = it, row = rows.find((x) => x.id === r.id);
      if (it.where !== 'ici') {
        // pas encore parti / déjà arrivé : petit jeton au bout de la piste
        const f = it.where === 'avant' ? 0 : 1, x0 = fx(f); if (x0 < L - 4 || x0 > R + 4) continue;
        const n = placed.filter((p) => p.end === f).length; placed.push({ end: f });
        const y = yMain + 34 + n * 13;
        c.fillStyle = r.livery; c.beginPath(); c.arc(x0, y, 3.5, 0, 7); c.fill();
        c.font = '10px system-ui, sans-serif'; c.fillStyle = 'rgba(230,238,243,.7)'; c.textAlign = f ? 'right' : 'left';
        c.fillText(`${r.name} ${it.where === 'avant' ? '· encore à ' + from.name : '· arrivé'}`, x0 + (f ? -8 : 8), y + 3);
        continue;
      }
      const onBelt = it.seg.belt && it.d.f > 0.2 && it.d.f < 0.78;
      const bw = onBelt ? Math.min(1, Math.min(it.d.f - 0.2, 0.78 - it.d.f) / 0.06) : 0;
      let x = fx(it.d.f);
      if (win && (it.d.f < win[0] || it.d.f > win[1])) {
        // hors de la fenêtre (Suivre) : flèche au bord, avec l'écart
        const right = it.d.f > win[1], xe = right ? R + 10 : L - 10, ye = 22 + placed.filter((p) => p.edge === right).length * 15; placed.push({ edge: right });
        c.fillStyle = r.livery; c.font = '600 10px system-ui, sans-serif'; c.textAlign = right ? 'right' : 'left';
        c.fillText(`${right ? '' : '◂ '}${r.name} ${row && row.rank > 1 ? '+' + dur(row.gap) : 'en tête'}${right ? ' ▸' : ''}`, xe + (right ? -6 : 6), ye);
        continue;
      }
      // une rangée par racer (ordre du classement) : jamais d'étiquettes empilées les unes sur les autres
      const ri = row ? row.rank - 1 : 0, y = yMain + (yBelt - yMain) * bw + (ri - (E.racers.length - 1) / 2) * 24;
      const on = sel === r.id;
      // vaisseau : flèche aux couleurs du racer, traînée derrière (aucune à l'arrêt)
      if (!it.d.stopped) { const tr = c.createLinearGradient(x - 46, 0, x, 0); tr.addColorStop(0, 'rgba(255,255,255,0)'); tr.addColorStop(1, r.livery); c.strokeStyle = tr; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 46, y); c.lineTo(x - 6, y); c.stroke(); }
      c.fillStyle = r.livery; c.beginPath(); c.moveTo(x + 8, y); c.lineTo(x - 6, y - 6); c.lineTo(x - 3, y); c.lineTo(x - 6, y + 6); c.closePath(); c.fill();
      if (on) { c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, 11, 0, 7); c.stroke(); }
      hits.push({ id: r.id, x, y });
      // étiquette sur une ligne, à droite du vaisseau (à gauche près du bord) : rang, nom, état
      let tag = '', tagCol = '#ff8a6a';
      if (it.d.stopped) { const s0 = it.d.stopped; tag = ({ failure: '⚠ panne', repair: '🔧 réparation', flare: '☀ à l\'abri' }[s0.h.kind] || 'arrêt') + ' ' + dur(s0.t + s0.lost - t); if (s0.h.kind === 'repair') tagCol = '#9fe6ff'; }
      for (const h of feed.tracks[r.id].happenings || []) if ((h.kind === 'beltHit' || (h.kind === 'flare' && !h.data.prudent)) && t >= h.t && t - h.t < 2400) {
        const a = 1 - (t - h.t) / 2400; tag = tag || (h.kind === 'beltHit' ? '💥 choc' : '⚡ électronique grillée');
        c.strokeStyle = `rgba(255,170,120,${a})`; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, 12 + (1 - a) * 16, 0, 7); c.stroke();
      }
      const name = `${row ? row.rank + ' · ' : ''}${r.name}`; let tele = on ? `  coque ${Math.round(st.integrity * 100)} % · ⛽ ${Math.round(st.fuel * 100)} %` : '';
      c.font = `${on ? 700 : 600} 11px system-ui, sans-serif`;
      const wName = c.measureText(name).width; c.font = '700 10px system-ui, sans-serif'; const wTag = tag ? c.measureText('  ' + tag).width : 0;
      c.font = '9px ui-monospace, monospace'; let wTele = c.measureText(tele).width;
      // à droite du vaisseau si ça tient, sinon à gauche ; la télémétrie saute si la place manque
      const fits = (w) => x + 14 + w <= W - 4 || x - 14 - w >= 4;
      if (!fits(wName + wTag + wTele)) { tele = ''; wTele = 0; }
      const wAll = wName + wTag + wTele, left = x + 14 + wAll > W - 4, x0 = Math.max(4, left ? x - 14 - wAll : x + 14);
      c.textAlign = 'left'; c.font = `${on ? 700 : 600} 11px system-ui, sans-serif`; c.fillStyle = on ? '#fff' : '#d6e2ea'; c.fillText(name, x0, y + 4);
      if (tag) { c.font = '700 10px system-ui, sans-serif'; c.fillStyle = tagCol; c.fillText('  ' + tag, x0 + wName, y + 4); }
      if (tele) { c.font = '9px ui-monospace, monospace'; c.fillStyle = 'rgba(160,180,195,.9)'; c.fillText(tele, x0 + wName + wTag, y + 4); }
    }
    // échelle (Suivre : graduations fines en années-lumière)
    c.font = '9px ui-monospace, monospace'; c.fillStyle = 'rgba(139,154,166,.75)'; c.textAlign = 'center';
    const ticks = win ? 10 : 5;
    for (let i = 0; i <= ticks; i++) {
      const f = win ? win[0] + (win[1] - win[0]) * i / ticks : i / ticks, x = fx(f);
      c.fillRect(x, yMain + 50 + 12 * 0, 1, 4);
      if (i % (win ? 2 : 1) === 0) c.fillText(`${(f * dly).toFixed(win ? 2 : 1).replace('.', ',')} al`, x, yMain + 64);
    }
    // vitesse moyenne du racer choisi (en multiples de c) : l'étape est un saut hors de l'échelle ordinaire
    if (selSeg && t >= selSeg.t0 && t <= selSeg.t1) {
      const lostAll = stopsOf(sel, selSeg).reduce((a, s) => a + s.lost, 0), pure = (selSeg.t1 - selSeg.t0 - lostAll) / 3600;
      const xc = Math.round(dly * 8766 / Math.max(1, pure));
      c.textAlign = 'left'; c.font = '600 10px system-ui, sans-serif'; c.fillStyle = '#9fe6ff';
      c.fillText(`${racer[sel].name} · ${distF(sel, selSeg, t).stopped ? 'à l\'arrêt' : `≈ ${xc.toLocaleString('fr-CH')} × la vitesse de la lumière`}`, 8, H - 8);
    }
  };
  Object.defineProperty(S, 'k', { get: () => k });
  return S;
}
