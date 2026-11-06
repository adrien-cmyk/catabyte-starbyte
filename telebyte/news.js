// Fil d'actualité du Télébyte (Phase 4, partie C) : bandeau « dernière minute » sous l'en-tête, et la liste des
// moments forts (touche le bandeau) avec un bouton « Revoir » sur chacun. Ne montre que les faits passés à l'instant
// affiché (chronologie : timeline.js).
//   mountNews({ E, racer, hh, getTl: () => chronologie, onReplay: (fait) => … }) → { update(t) }
import { upTo } from './timeline.js';
import { names } from './narrator.js';

const ICON = { overtake: '⇄', failed: '⚠', damage: '⚠', finish: '🏁', finale: '★', plan: '↘', ring: '◌', fuel: '⛽', start: '▶', periapsis: '◉', leg: '→', exit: '↗' };

export function headline(e, E, racer) {
  const n = e.racer ? names(racer[e.racer]) : null, nm = n ? n.Le : '', S = e.sys ? (E.systems.find((s) => s.id === e.sys) || {}).name : '', d = e.data || {};
  switch (e.kind) {
    case 'start': return 'Départ de la Grande Fronde';
    case 'plan': return d.plan === 'plongée' ? `${nm} tente la plongée rasante à ${S}` : null;
    case 'failed': return `Surchauffe à bord ${n.du}, poussée coupée à ${S}`;
    case 'damage': return d.dmg > 0.1 ? `${nm} ressort très abîmé${n.e} de ${S}` : `${nm} touché${n.e} à ${S}`;
    case 'overtake': return d.lead ? `${nm} prend la tête` : `${nm} remonte ${d.rank}e`;
    case 'finale': return `Grande finale : ${nm} entre le premier à ${S}`;
    case 'finish': return d.place === 1 ? `${nm} remporte la Grande Fronde !` : `${nm} termine ${d.place}e`;
    case 'fuel': return `Réservoir ${n.du} à ${Math.round(d.fuel * 100)} %`;
    case 'ring': return null;
    case 'periapsis': return d.plan === 'plongée' ? `${nm} frôle ${S} à ${(d.v / 1e3).toFixed(1).replace('.', ',')} km/s` : null;
    default: return e.title || null;
  }
}

export function mountNews({ E, racer, hh, getTl, onReplay }) {
  const bar = document.getElementById('news'), panel = document.getElementById('news-list'), body = document.getElementById('news-body');
  let lastKey = null, items = [];
  const openT = performance.now();             // pas d'éclair pour le premier titre (à l'ouverture)
  const open = (on) => { panel.hidden = !on; bar.setAttribute('aria-expanded', String(on)); if (on) render(); };
  bar.onclick = () => open(panel.hidden);
  document.getElementById('news-close').onclick = () => open(false);
  function render() {
    body.innerHTML = items.length ? '<ol class="nw-rows">' + items.slice().reverse().map((x, i) => `<li style="--livery:${x.e.racer ? racer[x.e.racer].livery : '#9fd4ec'}"><span class="ic">${ICON[x.e.kind] || '•'}</span><span class="tx">${x.h}<small>${hh(x.e.t)}</small></span><button type="button" data-k="${items.length - 1 - i}">Revoir</button></li>`).join('') + '</ol>'
      : '<p class="nw-empty">Rien encore : la course n\'a pas commencé.</p>';
    for (const b of body.querySelectorAll('button[data-k]')) b.onclick = () => { open(false); onReplay(items[+b.dataset.k].e); };
  }
  return {
    update(t) {
      const tl = upTo(getTl(), t);
      const fresh = []; for (const e of tl) { const h = headline(e, E, racer); if (h) fresh.push({ e, h }); }
      items = fresh;
      const top = items[items.length - 1];
      const key = top ? top.e.key : null;
      if (key !== lastKey) {
        lastKey = key;
        bar.hidden = !top;
        if (top) {
          bar.querySelector('.nw-t').textContent = hh(top.e.t);
          bar.querySelector('.nw-h').textContent = top.h;
          bar.classList.remove('flash'); void bar.offsetWidth; if (performance.now() - openT > 1500) bar.classList.add('flash');
        }
        if (!panel.hidden) render();
      }
    },
    get items() { return items; },
  };
}
