// Les racers (avant la course) : les quatre vaisseaux, leur modèle en 3D qui tourne lentement, et leurs specs — les
// vrais paramètres du moteur de course (raceData : poussée de périapse, vitesse en étape, audace, robustesse,
// trajectoire visée), traduits en barres comparées entre eux, avec les chiffres et le caractère du pilote.
//   const rc = mountRacers({ E, racer, hint })   rc.open(id?) ; rc.close() ; rc.isOpen
// La 3D (plans3d/stage.js : mêmes modèles allégés que les plans 3D) ne se charge qu'à la première ouverture et ne
// tourne que fiche ouverte ; sans WebGL, la fiche reste lisible sans l'image.
import { RACER_PROFILES } from '../sandbox/scene/racerProfiles.js';

// ce que dit chaque profil, en clair (même ordre d'idées que les commentaires de raceData)
const CHAR = {
  sentinelle: { tag: 'Équilibrée', txt: 'Le juste milieu. Assez rapide pour plonger, assez solide pour encaisser : la Sentinelle choisit ses moments et ne lâche rien.' },
  cuirasse: { tag: 'Increvable', txt: 'Petit, lourd, presque indestructible. Son réacteur unique pousse plus fort que tous à la périapse ; il passe large et prudent, et laisse les autres casser.' },
  mule: { tag: 'Endurance', txt: 'Le cargo qui ne s\'arrête jamais. La meilleure vitesse entre les systèmes, peu de poussée : la Mule gagne sur la longueur, pas sur un coup d\'éclat.' },
  fulgurant: { tag: 'Casse-cou', txt: 'Il rase les géantes au plus près. Quand ça passe, personne ne le rattrape ; quand la coque chauffe, il peut tout perdre en un passage.' },
};
// specs comparées : valeur → note 1..5 entre le plus faible et le plus fort des quatre
const SPECS = [
  { k: 'Poussée', v: (r) => r.dv, fmt: (r) => `${r.dv.toLocaleString('fr-CH')} m/s à la périapse` },
  { k: 'Vitesse en étape', v: (r) => r.warp * r.vInf, fmt: (r) => `×${r.warp.toFixed(2).replace('.', ',')} · croisière ${(r.vInf / 1000).toFixed(1).replace('.', ',')} km/s` },
  { k: 'Robustesse', v: (r) => 1 / (r.tough || 1), fmt: (r) => (r.tough || 1) < 1 ? 'encaisse la chauffe' : (r.tough || 1) > 1 ? 'coque fragile' : 'coque standard' },
  { k: 'Audace', v: (r) => r.risk, fmt: (r) => r.risk < 0.25 ? 'prudent' : r.risk < 0.5 ? 'mesuré' : 'casse-cou' },
  { k: 'Passage rasant', v: (r) => -r.rp, fmt: (r) => `vise ${r.rp.toFixed(2).replace('.', ',')} rayon de géante` },
];

export function mountRacers({ E, racer, hint = null }) {
  const R = E.racers;
  const el = document.createElement('section'); el.id = 'racers'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Les racers');
  el.innerHTML = `<div class="rc-head"><b>Les racers</b><button type="button" class="rc-x" aria-label="Fermer">×</button></div>
    <div class="rc-view"><canvas></canvas><span class="rc-load">chargement du vaisseau…</span></div>
    <nav class="rc-tabs">${R.map((r) => `<button type="button" data-id="${r.id}" style="--livery:${r.livery}"><i></i>${r.name}</button>`).join('')}</nav>
    <div class="rc-card"></div>`;
  document.body.appendChild(el);
  const card = el.querySelector('.rc-card'), canvas = el.querySelector('canvas'), load = el.querySelector('.rc-load');
  const rng = SPECS.map((s) => { const v = R.map(s.v); return [Math.min(...v), Math.max(...v)]; });
  let sel = R[0].id, st = null, cam = null, ships = {}, raf = 0, t0 = 0, failed = false;

  function renderCard() {
    const r = R.find((x) => x.id === sel), P = RACER_PROFILES[r.ship] || {}, c = CHAR[r.id] || { tag: '', txt: '' };
    for (const b of el.querySelectorAll('.rc-tabs button')) b.classList.toggle('on', b.dataset.id === sel);
    card.style.setProperty('--livery', r.livery);
    card.innerHTML = `<h3>${r.name}<small>${P.model || ''}${P.length ? ' · ' + Math.round(P.length) + ' m' : ''}</small><em>${c.tag}</em></h3>
      <p>${c.txt}</p>
      <ul>${SPECS.map((s, i) => { const [a, b] = rng[i], n = b > a ? 1 + Math.round((s.v(r) - a) / (b - a) * 4) : 3;
        return `<li><span>${s.k}</span><b aria-label="${n} sur 5">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= n ? 'on' : ''}"></i>`).join('')}</b><small>${s.fmt(r)}</small></li>`; }).join('')}</ul>`;
  }
  // 3D : un studio dans le ciel de la course (géante du premier système), le vaisseau choisi tourne lentement
  async function init3d() {
    if (st || failed) return;
    try {
      const [{ createStage }, { THREE }] = await Promise.all([import('./plans3d/stage.js'), import('../sandbox/lib/sb3d-shim.js')]);
      st = await createStage(canvas, { giant: (E.systems[0] && E.systems[0].giant) || 'amber' });
      st.fx.rocks && st.fx.rocks(false);
      cam = new THREE.PerspectiveCamera(32, 1, 0.1, 20000);
      st.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    } catch (e) { failed = true; load.textContent = 'aperçu 3D indisponible sur cet appareil'; console.warn('[racers] 3D', e); }
  }
  async function show(id) {
    if (!st) return;
    load.hidden = false; load.textContent = 'chargement du vaisseau…';
    try {
      if (!ships[id]) { ships[id] = await st.ship(id); ships[id].visible = false; st.scene.add(ships[id]); }
      if (sel !== id) return;                                           // un autre onglet entre-temps
      for (const [k, s] of Object.entries(ships)) s.visible = k === id;
      load.hidden = true;
    } catch (e) { load.textContent = 'modèle indisponible'; console.warn('[racers] modèle', e); }
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!st || !cam) return;
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    if (canvas.width !== Math.round(w * st.renderer.getPixelRatio())) st.resize(w, h);
    cam.aspect = w / h; cam.updateProjectionMatrix();
    const s = ships[sel]; if (!s || !s.visible) { st.render(cam); return; }
    const L = s.userData.len, a = (now - t0) / 1000 * 0.35 + 2.4;    // trois quarts avant, tour complet en ~18 s
    const d = 0.52 * L / (Math.tan(cam.fov * Math.PI / 360) * Math.min(w / h, 1.4)) + 3;   // de profil, la coque tient dans la largeur
    cam.position.set(Math.sin(a) * d, L * 0.32, Math.cos(a) * d); cam.lookAt(0, 0, 0);
    s.position.set(0, 0, 0); s.rotation.set(0, 0, 0); s.userData.thrust(0.55, now / 1000);
    st.render(cam, { dt: 1 / 60 });
  }
  function select(id) { sel = id; renderCard(); show(id); }
  const api = {
    isOpen: false,
    async open(id = null) {
      if (id) sel = id;
      el.hidden = false; api.isOpen = true; renderCard();
      if (!raf) { t0 = performance.now(); raf = requestAnimationFrame(frame); }
      await init3d(); show(sel);
    },
    close() { el.hidden = true; api.isOpen = false; cancelAnimationFrame(raf); raf = 0; if (hint) hint(false); },
  };
  el.querySelector('.rc-x').onclick = () => api.close();
  for (const b of el.querySelectorAll('.rc-tabs button')) b.onclick = () => select(b.dataset.id);
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') api.close(); });
  renderCard();
  return api;
}
