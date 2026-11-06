// Télébyte — la télé de la Grande Fronde. Écran dédié à la course, à part de la carte stratégique du jeu.
// Phase 2, étape 4 : vue univers (parcours, racers, classement en direct, horloge de course et curseur).
// Le flux de course est ici le flux de démonstration ; en Phase 3, le flux serveur aura la même interface.
import { feedFromUrl } from '../sandbox/race/DemoFeed.js';
import { loadEdition, liveFeed, rpc, tick } from '../sandbox/race/live.js';
import { UniverseView } from './UniverseView.js';
import { createNarrator } from './narrator.js';
import { mountNews } from './news.js';

// flux : ?feed=live → l'édition du serveur (Phase 3) ; ?feed=mock → publication simulée ; sinon la démo hors ligne.
// En direct sans connexion (ou sans édition), on retombe sur la démo, avec un bandeau.
const FEED_Q = window.FRONDE_FEED || new URLSearchParams(location.search).get('feed') || (location.hash === '#repetition' ? 'demo-live' : null);   // FRONDE_FEED : page qui fixe son mode (répétition en ligne)
let feed = null, LIVE = null, liveErr = null;
// répétition hors ligne (?feed=demo-live) : faux serveur dans la page, fausse partie de 10 000 CG, vraie passerelle du jeu
if (FEED_Q === 'demo-live') {
  window.G = window.G || { credits: 10000 }; window.saveGame = window.saveGame || (() => true);
  const { createFakeServer } = await import('./fake_server.js');
  window.FRONDE_FAKE = await createFakeServer({ credits: () => Math.floor(window.G.credits || 0), ...(window.FRONDE_DEMO || {}) });   // FRONDE_DEMO : essais (compte à rebours, vitesse)
  await new Promise((ok, ko) => { const sc = document.createElement('script'); sc.src = new URL('../game/fronde-bridge.js', import.meta.url).href; sc.onload = ok; sc.onerror = ko; document.head.appendChild(sc); });
}
if (FEED_Q === 'live' || FEED_Q === 'demo-live') {
  try { const snap = await loadEdition(); if (snap) { feed = liveFeed(snap); LIVE = feed.live; } else liveErr = 'aucune édition'; }
  catch (e) { liveErr = e.message === 'not_signed_in' ? 'connecte-toi dans le jeu' : 'serveur injoignable'; console.warn('[fronde]', e); }
}
if (!feed) feed = feedFromUrl(FEED_Q === 'live' || FEED_Q === 'demo-live' ? '' : location.search);
// le jeu (même origine) ouvre le Télébyte en superposition et expose sa passerelle : CG, mise en accord avec le serveur
const GAME = window.SBFronde || (() => { try { return window.parent !== window && window.parent.SBFronde ? window.parent.SBFronde : null; } catch (e) { return null; } })();
const $ = (id) => document.getElementById(id);
const E = feed.edition;
const racer = Object.fromEntries(E.racers.map((r) => [r.id, r]));

/* ── horloge de course : accélérée par défaut, curseur pour avancer ou revenir ── */
const SPEEDS = [60, 600, 3600];                                   // ×60, ×600 (72 h en 7 min), ×3600
let t = 0, speedI = 1, playing = true, last = performance.now();
const hh = (s) => { s = Math.max(0, s); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return (d ? `J+${d} ` : '') + `${String(h).padStart(2, '0')} h ${String(m).padStart(2, '0')}`; };
const dur = (s) => { s = Math.abs(s); if (s < 60) return `${Math.round(s)} s`; const h = Math.floor(s / 3600), m = Math.round(s % 3600 / 60); return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`; };

// entrer dans un système : la vue système de course (sandbox), au même instant et sur le même racer
const SYSTEM_PAGE = window.FRONDE_SYSTEM_PAGE || '../sandbox/index.html';
function enterSystem(sysId) {
  try {
    sessionStorage.setItem('fronde.sys', sysId); sessionStorage.setItem('fronde.t', String(t));
    sessionStorage.setItem('fronde.sel', view.sel || ''); sessionStorage.setItem('fronde.back', location.href.split('#')[0]);
  } catch (e) {}
  location.href = SYSTEM_PAGE + (FEED_Q && (FEED_Q !== 'live' || LIVE) ? '?feed=' + FEED_Q : '') + '#course';
}
// retour depuis la vue système : on reprend l'instant et le racer suivi
let restore = null;
try { const ts = sessionStorage.getItem('fronde.t'); if (ts && document.referrer) restore = { t: +ts, sel: sessionStorage.getItem('fronde.sel') || null }; } catch (e) {}

/* ── zoom continu univers ↔ système (Phase 2, étape 8) : la vue système est préchargée dans un cadre caché ;
   plonger = zoom accéléré vers le système, éclair, la vue système prend le relais (sa caméra arrive de très haut) ;
   remonter = l'inverse. Sans cadre (chargement raté), on retombe sur le changement de page. ── */
let sysFrame = null, frameOk = false, inSystem = false, curSysId = null, pending = null, sysT = null;
function loadFrame() {
  if (sysFrame) return;
  sysFrame = document.createElement('iframe'); sysFrame.id = 'sysframe'; sysFrame.title = 'Vue système';
  sysFrame.src = SYSTEM_PAGE + (SYSTEM_PAGE.includes('?') ? '&' : '?') + 'embed' + (FEED_Q && (FEED_Q !== 'live' || LIVE) ? '&feed=' + FEED_Q : '');
  document.body.appendChild(sysFrame);
}
setTimeout(loadFrame, 800);                                          // après le premier affichage du Télébyte
addEventListener('message', (e) => {
  const m = e.data; if (!sysFrame || e.source !== sysFrame.contentWindow || !m || !m.fronde) return;
  if (m.type === 'loaded') { frameOk = true; if (pending) { const p = pending; pending = null; p(); } }
  else if (m.type === 'progress') { loadSet(m.p); clearTimeout(watch); watch = setTimeout(() => { if (!inSystem) fallbackEnter(curSysId); }, 7000); }   // chaque étape relance la garde
  else if (m.type === 'tick') { sysT = m.t; if (LIVE && following !== !!m.live) setFollow(!!m.live); }   // instant affiché par la vue système (voix off, actualité)
  else if (m.type === 'ready') { if (inSystem) return; clearTimeout(watch); loadHide(); inSystem = true; sysFrame.classList.add('on'); document.body.classList.add('insys'); }
  else if (m.type === 'surface') {
    t = Math.min(E.t1, m.t); sysT = null; if (LIVE) setFollow(t >= liveNow() - Math.max(120, 3 * (LIVE.snap.rate || 1))); if (m.sel !== view.sel) { view.sel = m.sel || null; view.onSelect(view.sel); }
    inSystem = false; sysFrame.classList.remove('on'); document.body.classList.remove('insys'); renderStandings(true);
  }
});
// repli : changement de page classique (le cadre n'a pas répondu)
function fallbackEnter(sysId) {
  pending = null; clearTimeout(watch); inSystem = false; loadSet(0.95, false);
  if (sysFrame) sysFrame.classList.remove('on');
  enterSystem(sysId);
}
let watch = 0;
/* mini barre : avance seule (vers 90 %, en ralentissant), et saute aux étapes annoncées par la vue système */
const loadEl = $('load'), loadBar = $('load-b'); let loadP = 0;
function loadSet(p, creep = true) {
  loadP = Math.max(loadP, p); loadEl.setAttribute('aria-valuenow', String(Math.round(loadP * 100)));
  loadBar.style.transition = 'transform .25s ease-out'; loadBar.style.transform = `scaleX(${loadP})`;
  if (creep && loadP < 0.9) setTimeout(() => { if (!loadEl.hidden && loadP < 0.9) { loadBar.style.transition = 'transform 5s cubic-bezier(.15,.6,.3,1)'; loadBar.style.transform = `scaleX(${Math.max(loadP, 0.9)})`; } }, 260);
}
function loadShow(sysId) {
  const sys = E.systems.find((x) => x.id === sysId); $('load-t').textContent = `Entrée dans ${sys ? sys.name : 'le système'}…`;
  loadP = 0; loadBar.style.transition = 'none'; loadBar.style.transform = 'scaleX(0)'; loadEl.classList.remove('out'); loadEl.hidden = false;
  void loadBar.offsetWidth; loadSet(0.06);
}
function loadHide() { if (loadEl.hidden) return; loadSet(1, false); loadEl.classList.add('out'); setTimeout(() => { loadEl.hidden = true; }, 300); }
// changer de vue : bouton d'étape, « voir en 3D » ou « Vue système » → la vue système (préchargée) prend l'écran
// en fondu, avec la mini barre tant qu'elle se prépare
const dive = (sysId) => {
  if (inSystem || !loadEl.hidden) return;
  curSysId = sysId; loadShow(sysId);
  const go = () => { sysFrame.classList.add('on'); sysFrame.contentWindow.postMessage({ fronde: 1, type: 'enter', sys: sysId, t, sel: view.sel || null, snap: LIVE ? LIVE.snap : null, live: LIVE ? following : null }, '*'); };
  clearTimeout(watch); watch = setTimeout(() => { if (!inSystem) fallbackEnter(sysId); }, 7000);   // jamais bloqué
  if (frameOk) return go();
  loadFrame(); pending = go;
};
const view = new UniverseView($('scene'), $('labels'), feed, { onEnter: (id) => dive(id), onSelect: (id) => { renderStandings(true); $('focus').hidden = !id; if (id) $('focus-name').textContent = racer[id].name; } });
addEventListener('resize', () => view.resize());

const slider = $('clock');
slider.max = String(Math.ceil(E.t1));
slider.oninput = () => { t = +slider.value; renderStandings(true); };
$('play').onclick = () => { playing = !playing; $('play').textContent = playing ? 'Pause' : 'Lecture'; $('play').setAttribute('aria-pressed', String(!playing)); };
$('speed').onclick = () => { speedI = (speedI + 1) % SPEEDS.length; $('speed').textContent = '×' + SPEEDS[speedI]; };
$('speed').textContent = '×' + SPEEDS[speedI];
const countdown = (s) => { const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return d ? `${d} j ${h} h` : h ? `${h} h ${String(m).padStart(2, '0')}` : `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };   // court : tient dans la pastille
const startLabel = LIVE ? new Date(LIVE.snap.edition.start_at).toLocaleString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
if (GAME) document.body.classList.add('in-game');                 // ouvert depuis le jeu : place pour son bouton « fermer »
/* ── en direct : l'horloge est celle du serveur ; le curseur permet de revoir, jamais d'aller au-delà du présent ── */
let following = true;
const liveNow = () => LIVE ? LIVE.source.now() : 0;
let setFollow = () => {};
if (LIVE) {
  $('speed').hidden = true;
  setFollow = (on) => { following = on; $('play').textContent = on ? '● Direct' : 'Revenir au direct'; $('play').classList.toggle('live', on); };
  $('play').onclick = () => { setFollow(true); playing = true; };
  // revoir : le curseur sort du direct ; le ramener au bout y revient ; avant le départ, rien à revoir (curseur inactif)
  slider.addEventListener('input', () => {
    const nowR = liveNow();
    if (nowR <= 0) { slider.value = '0'; t = 0; return; }
    t = Math.min(+slider.value, nowR); playing = false;              // revoir au curseur : l'image reste sur l'instant choisi
    setFollow(t >= nowR - Math.max(120, nowR * 0.01));
  });
  setFollow(true); t = Math.max(0, Math.min(liveNow(), E.t1));
}
// démo hors ligne : un bouton pour essayer les paris (répétition accélérée, faux serveur dans la page)
if (!FEED_Q) { const a = document.createElement('button'); a.id = 'try-bets'; a.type = 'button'; a.textContent = 'Essayer les paris'; a.onclick = () => { location.hash = 'repetition'; location.reload(); }; document.querySelector('.onair').appendChild(a); }
if (FEED_Q === 'demo-live') { const a = document.createElement('div'); a.id = 'offline'; a.textContent = 'Répétition · partie fictive · course accélérée'; document.body.appendChild(a); }
if (liveErr) { const b = document.createElement('div'); b.id = 'offline'; b.textContent = `Hors direct (${liveErr}) : course de démonstration`; document.body.appendChild(b); }
$('focus-clear').onclick = () => view.overview();
$('focus-enter').onclick = () => { const s = feed.stateAt(view.sel, t); dive(s.phase === 'system' || s.phase === 'start' ? s.system : s.phase === 'leg' ? s.legTo : E.systems[E.systems.length - 1].id); };
$('edition').textContent = E.name;
$('route').textContent = E.systems.map((s) => s.name).join(' → ');

/* ── étapes : chaque système, à l'instant où le premier racer y passe la périapse ── */
function stagesOf() {
  return E.systems.map((sys) => {
    if (feed.etaPeriapsis) { const e = feed.etaPeriapsis(sys.id); let t0 = Infinity; for (const r of E.racers) for (const sg of feed.tracks[r.id].segs) if (sg.kind === 'system' && sg.sys.id === sys.id) t0 = Math.min(t0, sg.t0); return { sys, tp: e.t, known: e.known, t0: Number.isFinite(t0) ? t0 : e.t - 6.1 * 3600 }; }
    let tp = Infinity, t0 = Infinity;
    for (const r of E.racers) for (const sg of feed.tracks[r.id].segs) if (sg.kind === 'system' && sg.sys.id === sys.id) { tp = Math.min(tp, sg.tp); t0 = Math.min(t0, sg.t0); }
    return { sys, tp, t0, known: true };
  });
}
let STAGES = stagesOf();
const stageHtml = () => STAGES.map((s, i) => `<button type="button" data-i="${i}" aria-label="Voir le passage à ${s.sys.name}"><b>${s.sys.name}</b><span>${s.known ? '' : '≈ '}${hh(s.tp)}</span></button>`).join('');
$('stages').innerHTML = stageHtml();
// flux publié : à chaque plan reçu, étapes et durée de la course se précisent
if (feed.onUpdate) feed.onUpdate(() => {
  STAGES = stagesOf(); [...$('stages').children].forEach((b, i) => { const s = STAGES[i]; b.querySelector('span').textContent = (s.known ? '' : '≈ ') + hh(s.tp); });
  slider.max = String(Math.ceil(E.t1)); lastSig = '';
  if (nar) nar.rebuild();
});
// en direct : une étape que la course n'a pas encore quittée s'ouvre sur le direct ; une étape que tous les racers ont
// quittée s'ouvre en revoir, 30 min avant le passage (hors direct : toujours le passage)
const stageLeft = (i, at) => E.racers.every((r) => {
  const st = feed.stateAt(r.id, at), idx = (id) => E.systems.findIndex((x) => x.id === id);
  const k = st.phase === 'done' ? Infinity : st.phase === 'leg' ? idx(st.legTo) - 0.5 : st.phase === 'start' ? -1 : idx(st.system);
  return k > i;
});
for (const b of $('stages').children) b.onclick = () => {
  const i = +b.dataset.i, s = STAGES[i];
  if (LIVE) {
    const nowR = liveNow();
    if (nowR > 0 && stageLeft(i, nowR)) { t = Math.max(0, Math.min(s.tp - 1800, nowR)); setFollow(false); }
    else { t = Math.max(0, Math.min(E.t1, nowR)); setFollow(true); }
  } else t = Math.max(0, s.tp - 1800);
  const r = b.getBoundingClientRect(); dive(s.sys.id, r.left + r.width / 2, r.top + r.height / 2);
};


/* ── classement ── */
const PHASE = { system: 'en passage', leg: 'en voyage', done: 'arrivé', start: 'au départ' };
let lastSig = '';
function renderStandings(force = false) {
  const rows = feed.standingsAt(t);
  const sig = rows.map((r) => r.id + r.cp).join('|') + view.sel;
  const list = $('standings');
  if (force || sig !== lastSig) {
    lastSig = sig;
    list.innerHTML = rows.map((r) => {
      const s = feed.stateAt(r.id, t), R = racer[r.id];
      const where = s.phase === 'start' ? PHASE.start : s.phase === 'system' ? `${PHASE.system} · ${E.systems.find((x) => x.id === s.system).name}` : s.phase === 'leg' ? `${PHASE.leg} → ${E.systems.find((x) => x.id === s.legTo).name}` : PHASE.done;
      return `<li class="${view.sel === r.id ? 'on' : ''}" data-id="${r.id}" style="--livery:${R.livery}">
        <span class="rk">${r.rank}</span><i></i><span class="nm">${R.name}<small data-where>${where}</small></span>
        <span class="gp" data-gap>${r.rank === 1 ? 'en tête' : r.gap < 1 ? 'à égalité' : '+' + dur(r.gap)}</span></li>`;
    }).join('');
    for (const li of list.children) li.onclick = () => view.select(li.dataset.id);
  }
}
function renderClock() {
  $('time').textContent = hh(t);
  { let cur = 0; STAGES.forEach((s, i) => { if (t >= s.t0) cur = i; }); [...$('stages').children].forEach((b, i) => b.classList.toggle('now', i === cur)); }
  slider.value = String(Math.round(t));
  const ev = feed.nextEvent(t);
  $('next').textContent = ev ? `${ev.label} · ${racer[ev.racer].name} dans ${dur(ev.t - t)}` : 'course terminée';
  const done = t >= E.t1;
  if (LIVE) {
    const nowR = liveNow(), st = LIVE.snap.state;
    $('state').textContent = st === 'reglee' ? 'arrivée' : nowR < 0 ? 'départ · ' + countdown(-nowR) : following ? 'en direct' : 'revoir · ' + dur(nowR - t) + ' avant';
    if (nowR < 0) { $('next').textContent = 'Départ ' + startLabel; $('time').textContent = ''; }
  } else $('state').textContent = done ? 'arrivée' : t <= 0 ? 'départ' : 'en direct';
  if (view.sel) {
    const s = feed.stateAt(view.sel, t);
    $('focus-tele').textContent = s.phase === 'system' ? `${(s.speed / 1e3).toFixed(1)} km/s · carburant ${Math.round(s.fuel * 100)} % · intégrité ${Math.round(s.integrity * 100)} %`
      : s.phase === 'leg' ? `voyage interstellaire ${Math.round(s.f * 100)} % · carburant ${Math.round(s.fuel * 100)} %` : 'arrivé';
  }
}

// retour depuis la vue système : instant et racer suivi
if (restore) { t = Math.min(restore.t, E.t1); if (restore.sel) view.select(restore.sel); }

function loop(now) {
  requestAnimationFrame(loop);
  if (inSystem) { last = now; if (sysT != null) commentary(sysT); return; }   // la vue système intégrée vit seule (et tient l'horloge)
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (LIVE) {
    const nowR = liveNow();
    if (following) t = Math.max(0, Math.min(E.t1, nowR));
    else if (playing && nowR > 0) { t = Math.min(t + dt * 600, E.t1, nowR); if (t >= Math.min(E.t1, nowR) - 1) setFollow(true); }   // revoir : lecture ×600 jusqu'au direct
    slider.max = String(Math.max(1, Math.ceil(Math.max(0, Math.min(E.t1, nowR)))));
    slider.disabled = nowR <= 0;
  } else if (playing) { t = Math.min(E.t1, t + dt * SPEEDS[speedI]); if (t >= E.t1) { playing = false; $('play').textContent = 'Lecture'; } }
  if (feed.sync) feed.sync(t);                                    // flux publié : plans reçus jusqu'à l'instant affiché
  renderStandings(); renderClock();
  view.update(t, dt);
  commentary(t);
}
// sous-titres juste au-dessus du classement (en bas sur téléphone) ou du pied de page
function placeSub() {
  const b = $('board').getBoundingClientRect(), f = document.querySelector('footer').getBoundingClientRect();
  const top = b.bottom > innerHeight * 0.6 ? b.top : f.top;
  document.documentElement.style.setProperty('--sub-b', Math.round(innerHeight - top + 8) + 'px');
}
addEventListener('resize', placeSub); setTimeout(placeSub, 300); setInterval(placeSub, 2000);
function commentary(at) {
  const now = LIVE ? liveNow() : null;
  try { news.update(now != null && now < 0 ? -1 : at); nar.update(at, { now }); } catch (e) { console.warn('[fronde] commentaire', e); }
}
/* ── voix off et fil d'actualité (Phase 4) ── */
// paris : ceux du serveur en direct ; en démo hors ligne, une cagnotte fictive (tirée du nom de l'édition)
const demoPools = (() => { let h = 7; for (const c of E.id || 'x') h = (h * 33 + c.charCodeAt(0)) % 9973; const by = {}; let tot = 0; E.racers.forEach((r, i) => { const v = 1500 + ((h * (i + 3) * 7919) % 9000) + (r.risk || 0) * 9000; by[r.id] = Math.round(v / 10) * 10; tot += by[r.id]; }); return { total: tot, by_racer: by, house: 5 }; })();
const nar = createNarrator({
  feed, E, racer, hh, dur, sub: $('sub'),
  pools: () => LIVE ? (LIVE.snap.pools ? { ...LIVE.snap.pools, house: LIVE.snap.edition.house_pct } : null) : demoPools,
  mine: () => (LIVE && LIVE.snap.my_bets) || [],
});
const news = mountNews({ E, racer, hh, getTl: () => nar.tl, onReplay: replay });
// revoir un moment fort : un peu avant, sur le bon racer ; dans la vue système s'il s'est passé dans un système
function replay(e) {
  const inSys = e.sys && ['plan', 'ring', 'periapsis', 'failed', 'damage', 'finale', 'finish', 'moon'].includes(e.kind);
  const lead = e.kind === 'plan' || e.kind === 'finale' ? 600 : inSys ? 1500 : 900;
  t = Math.max(0, e.t - lead); playing = true;
  if (LIVE) { if (t < liveNow() - 1) setFollow(false); } else $('play').textContent = 'Pause';
  if (e.racer && view.sel !== e.racer) view.select(e.racer);
  if (feed.sync) feed.sync(t);
  renderStandings(true); renderClock();
  if (inSys) dive(e.sys);
}
// commentaire : voix + sous-titres, sous-titres seuls, ou rien (mémorisé) ; le son ne part qu'après un premier toucher
const VOICE_L = { voix: '🔊', texte: '💬', off: '🔇' }, VOICE_T = { voix: 'voix off et sous-titres', texte: 'sous-titres seuls', off: 'coupé' };
const setVoice = (m) => { nar.setMode(m); $('voice').textContent = VOICE_L[m]; $('voice').title = 'Commentaire : ' + VOICE_T[m]; $('voice').classList.toggle('off', m === 'off'); $('voice').setAttribute('aria-label', 'Commentaire : ' + VOICE_T[m]); try { localStorage.setItem('fronde.voice', m); } catch (e) {} };
{ let m = 'voix'; try { m = localStorage.getItem('fronde.voice') || 'voix'; } catch (e) {} setVoice(VOICE_L[m] ? m : 'voix'); }
$('voice').onclick = () => {
  nar.unlock(); const m = nar.mode === 'voix' ? 'texte' : nar.mode === 'texte' ? 'off' : 'voix'; setVoice(m);
  const sb = $('sub'); sb.hidden = false; sb.classList.remove('b'); sb.innerHTML = `<b>Commentaire</b> ${VOICE_T[m]}`;   // ce que fait le bouton, un instant
  clearTimeout(sb._h); sb._h = setTimeout(() => { if (sb.textContent.startsWith('Commentaire')) sb.hidden = true; }, 1800);
};
addEventListener('pointerdown', () => nar.unlock(), { capture: true, once: true });

requestAnimationFrame(loop);

// accès de test (captures)
import('./bets.js').then((m) => m.mountBets({ feed, LIVE, GAME, rpc, tick, racer, E })).catch((e) => console.warn('[fronde] paris', e));
// la vue système suit les nouveaux instantanés pendant qu'on y est
if (LIVE) feed.onSnap((snap) => { if (sysFrame && frameOk) sysFrame.contentWindow.postMessage({ fronde: 1, type: 'snap', snap }, '*'); });

window.TB = { nar, news, replay, live: () => LIVE && { state: LIVE.snap.state, now: liveNow(), id: E.id }, view, dive: (id) => dive(id), get state() { return { frameOk, inSystem, t, sel: view.sel }; }, set: (x) => { t = x; playing = false; if (feed.sync) feed.sync(t); renderStandings(true); renderClock(); view.update(t, 1); }, select: (id) => view.select(id), feed, ready: true };
