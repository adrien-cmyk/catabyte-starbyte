// Télébyte — la télé de la Grande Fronde. Écran dédié à la course, à part de la carte stratégique du jeu.
// Phase 2, étape 4 : vue univers (parcours, racers, classement en direct, horloge de course et curseur).
// Le flux de course est ici le flux de démonstration ; en Phase 3, le flux serveur aura la même interface.
import { DemoFeed } from '../sandbox/race/DemoFeed.js';
import { UniverseView } from './UniverseView.js';

const feed = new DemoFeed();
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
  location.href = SYSTEM_PAGE + '#course';
}
// retour depuis la vue système : on reprend l'instant et le racer suivi
let restore = null;
try { const ts = sessionStorage.getItem('fronde.t'); if (ts && document.referrer) restore = { t: +ts, sel: sessionStorage.getItem('fronde.sel') || null }; } catch (e) {}

const view = new UniverseView($('scene'), $('labels'), feed, { onEnter: enterSystem, onSelect: (id) => { renderStandings(true); $('focus').hidden = !id; if (id) $('focus-name').textContent = racer[id].name; } });
addEventListener('resize', () => view.resize());

const slider = $('clock');
slider.max = String(Math.ceil(E.t1));
slider.oninput = () => { t = +slider.value; renderStandings(true); };
$('play').onclick = () => { playing = !playing; $('play').textContent = playing ? 'Pause' : 'Lecture'; $('play').setAttribute('aria-pressed', String(!playing)); };
$('speed').onclick = () => { speedI = (speedI + 1) % SPEEDS.length; $('speed').textContent = '×' + SPEEDS[speedI]; };
$('speed').textContent = '×' + SPEEDS[speedI];
$('focus-clear').onclick = () => view.select(view.sel);
$('focus-enter').onclick = () => { const s = feed.stateAt(view.sel, t); enterSystem(s.phase === 'system' ? s.system : s.phase === 'leg' ? s.legTo : E.systems[E.systems.length - 1].id); };
$('edition').textContent = E.name;
$('route').textContent = E.systems.map((s) => s.name).join(' → ');

/* ── classement ── */
const PHASE = { system: 'en passage', leg: 'en voyage', done: 'arrivé' };
let lastSig = '';
function renderStandings(force = false) {
  const rows = feed.standingsAt(t);
  const sig = rows.map((r) => r.id + r.cp).join('|') + view.sel;
  const list = $('standings');
  if (force || sig !== lastSig) {
    lastSig = sig;
    list.innerHTML = rows.map((r) => {
      const s = feed.stateAt(r.id, t), R = racer[r.id];
      const where = s.phase === 'system' ? `${PHASE.system} · ${E.systems.find((x) => x.id === s.system).name}` : s.phase === 'leg' ? `${PHASE.leg} → ${E.systems.find((x) => x.id === s.legTo).name}` : PHASE.done;
      return `<li class="${view.sel === r.id ? 'on' : ''}" data-id="${r.id}" style="--livery:${R.livery}">
        <span class="rk">${r.rank}</span><i></i><span class="nm">${R.name}<small data-where>${where}</small></span>
        <span class="gp" data-gap>${r.rank === 1 ? 'en tête' : r.gap < 1 ? 'à égalité' : '+' + dur(r.gap)}</span></li>`;
    }).join('');
    for (const li of list.children) li.onclick = () => view.select(li.dataset.id);
  }
}
function renderClock() {
  $('time').textContent = hh(t);
  slider.value = String(Math.round(t));
  const ev = feed.nextEvent(t);
  $('next').textContent = ev ? `${ev.label} · ${racer[ev.racer].name} dans ${dur(ev.t - t)}` : 'course terminée';
  const done = t >= E.t1;
  $('state').textContent = done ? 'arrivée' : t <= 0 ? 'départ' : 'en direct';
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
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (playing) { t = Math.min(E.t1, t + dt * SPEEDS[speedI]); if (t >= E.t1) { playing = false; $('play').textContent = 'Lecture'; } }
  renderStandings(); renderClock();
  view.update(t, dt);
}
requestAnimationFrame(loop);

// accès de test (captures)
window.TB = { set: (x) => { t = x; playing = false; renderStandings(true); renderClock(); view.update(t, 1); }, select: (id) => view.select(id), feed, ready: true };
