// RaceLayer — couche de course sur le Race World (Phase 2, étape 5 : vue système).
// Lit le flux de course (DemoFeed, plus tard le flux serveur) et, dans le système affiché :
// · place les quatre racers à leur position du flux (repère de la géante → monde), poussée comprise ;
// · dessine la trajectoire de chacun (trait holographique à sa livrée : vive pour le racer suivi, discrète sinon,
//   partie parcourue estompée) ;
// · pose une étiquette par racer (rang, écart au précédent, vitesse) ;
// · tient un panneau de course (système, temps, classement, curseur, vitesse, retour vers Télébyte).
// Les racers qui ne sont pas dans ce système (en voyage, ailleurs) sont masqués et annoncés dans le panneau.
import { THREE } from '../lib/sb3d-shim.js';
import { TrajectoryHolo } from '../scene/TrajectoryHolo.js';
import { OrbitalWindows, BANDS } from './OrbitalWindows.js';
import { sampleAt } from '../core/Gravity.js';

// rééchantillonnage d'une trajectoire : un point tous les ~0,5° vus depuis la géante (pas de temps ∝ r / v), par
// interpolation d'Hermite sur l'intégration — une vraie courbe de fronde, sans segments droits ni coins
function resample(S, gp, R) {
  const out = [], P = [0, 0, 0], V = [0, 0, 0];
  let t = S[0].t; const t1 = S[S.length - 1].t;
  while (t < t1 && out.length < 3000) {
    sampleAt(S, t, P, V); out.push({ t, p: P.slice(), v: V.slice() });
    const r = Math.hypot(...P), v = Math.hypot(...V) || 1;
    t += Math.max(5, Math.min(1800, 0.009 * r / v));
  }
  sampleAt(S, t1, P, V); out.push({ t: t1, p: P.slice(), v: V.slice() });
  return out;
}

const hh = (s) => { s = Math.max(0, s); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return (d ? `J+${d} ` : '') + `${String(h).padStart(2, '0')} h ${String(m).padStart(2, '0')}`; };
const dur = (s) => { s = Math.abs(s); if (s < 60) return `${Math.round(s)} s`; const h = Math.floor(s / 3600), m = Math.round(s % 3600 / 60); return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`; };

export class RaceLayer {
  // ctx : { scene, frame, feed, giant(), sys(), fleet() (racers en livrée, avec .def), hud, labels,
  //         setTime(t), getTime(), setSpeed(x), follow(id) }
  constructor(ctx) {
    this.c = ctx; this.on = false; this.sel = null; this.holos = {}; this._q = new THREE.Quaternion(); this._v = new THREE.Vector3();
    this.speeds = [1, 20, 200, 2000]; this.speedI = 2;
    this.windows = new OrbitalWindows(); this.gateEls = {};
    this.pack = new Float64Array(3); this.packSpread = 0;            // peloton présent : centre et écartement (vue Ensemble)
  }
  get feed() { return this.c.feed; }
  enter({ t = null, sel = null } = {}) {
    this.on = true; this.sel = sel;
    const sys = this.c.sys(), F = this.feed;
    // par défaut : quelques minutes avant que le premier racer entre dans ce système
    if (t == null) {
      const firsts = F.racers.map((r) => F.tracks[r.id].segs.find((s) => s.kind === 'system' && s.sys.id === sys.id)).filter(Boolean);
      const tp = firsts.length ? Math.min(...firsts.map((s) => s.tp)) : F.etaPeriapsis ? F.etaPeriapsis(sys.id).t : 6 * 3600;   // flux publié : estimation
      t = Math.max(0, tp - 3 * 3600);
    }
    this.c.setTime(t); this.c.setSpeed(this.speeds[this.speedI]);
    this.rebuild(); this._hud(true);
    this.c.hud.hidden = false; this.c.labels.hidden = false; document.body.classList.add('race');
    for (const rc of this.c.fleet()) rc.setPiste(true);              // piste lumineuse en course
  }
  exit() {
    this.on = false; this.c.hud.hidden = true; this.c.labels.hidden = true; document.body.classList.remove('race');
    for (const rc of this.c.fleet()) rc.setPiste(false);
    for (const h of Object.values(this.holos)) h.group.visible = false;
    this.windows.group.visible = false; for (const e of Object.values(this.gateEls)) e.hidden = true;
  }
  // trajectoires du système affiché, converties dans le repère du monde
  rebuild() {
    const sys = this.c.sys(), g = this.c.giant(), q = g.group.quaternion, gp = g.pos, v = this._v;
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(q).toArray();
    for (const r of this.feed.racers) {
      let h = this.holos[r.id];
      if (!h) { h = this.holos[r.id] = new TrajectoryHolo({ color: r.livery, past: r.livery, maxPoints: 1400 }); h.u.uAhead.value = 0; this.c.scene.add(h.group); }   // course : traînée seulement
      const P0 = this.feed.plannedPath(r.id, sys.id);
      const S = (P0.length > 1 ? resample(P0) : P0).map((s) => {
        v.set(...s.p).applyQuaternion(q); const p = [gp[0] + v.x, gp[1] + v.y, gp[2] + v.z];
        v.set(...s.v).applyQuaternion(q); return { t: s.t, p, v: [v.x, v.y, v.z] };
      });
      h.ok = S.length > 1;
      if (h.ok) h.setPath(S, { raw: true, tickEvery: 3600, ringPlane: g.ring ? { center: gp, normal: axis, inner: g.ring.inner * g.R, outer: g.ring.outer * g.R } : null });
    }
    // fenêtres orbitales du système (portes de périapse et des anneaux)
    this.windows.build(this.feed, sys, g); this.windows.group.visible = true;
    this._hud(true);
  }
  // à chaque image, avant le rendu : racers à leur place du flux
  position(t) {
    if (!this.on) return;
    if (this.feed.version !== this._ver) { this._ver = this.feed.version; if (this._ver != null) this.rebuild(); }   // un plan publié : tracés et portes refaits
    const sys = this.c.sys(), g = this.c.giant(), q = g.group.quaternion, gp = g.pos, v = this._v;
    for (const rc of this.c.fleet()) {
      const st = this.feed.stateAt(rc.def.id, t);
      rc.inSys = st.phase === 'system' && st.system === sys.id;
      if (!rc.inSys) continue;
      v.set(...st.p).applyQuaternion(q); rc.pos.set([gp[0] + v.x, gp[1] + v.y, gp[2] + v.z]);
      v.set(...st.v).applyQuaternion(q); rc.vel.set([v.x, v.y, v.z]);
      rc.throttle = st.thrust;
      if (rc._lastT != null && Math.abs(t - rc._lastT) > 600) rc.trail.reset();   // saut dans le temps : traînée remise à zéro
      rc._lastT = t;
    }
    // peloton : centre des racers présents (sinon la géante), écartement = plus grande distance au centre
    const here = this.c.fleet().filter((r) => r.inSys);
    if (here.length) {
      for (let i = 0; i < 3; i++) this.pack[i] = here.reduce((a, r) => a + r.pos[i], 0) / here.length;
      this.packSpread = Math.max(...here.map((r) => Math.hypot(r.pos[0] - this.pack[0], r.pos[1] - this.pack[1], r.pos[2] - this.pack[2])));
    } else { this.pack.set(gp); this.packSpread = g.R * 2; }
  }
  // sujet de la vue : le racer suivi s'il est dans le système, sinon le premier présent
  focusPos() {
    const f = this.c.fleet(), s = f.find((r) => r.def.id === this.sel && r.inSys) || f.find((r) => r.inSys);
    return s ? s.pos : this.c.giant().pos;
  }
  // après le placement de la caméra : tracés, étiquettes, panneau
  update(t, camera, pix, res) {
    if (!this.on) return;
    const frame = this.c.frame;
    for (const r of this.feed.racers) {
      const h = this.holos[r.id]; if (!h) continue;
      h.group.visible = h.ok;
      h.u.uOpacity.value = !this.sel || this.sel === r.id ? 1 : 0.28;
      if (h.ok) h.update(frame.cam, t, pix, 1.3 * (res[2] || 1), res);
    }
    // étiquettes : rang, écart au précédent, vitesse
    const rows = this.feed.standingsAt(t), byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    const W = this.c.labels.clientWidth, H = this.c.labels.clientHeight, v = this._v, placed = [];
    // étiquettes empilées dans l'ordre du classement (ordre stable : plus de clignotement), position amortie
    const fleet = this.c.fleet(), byRc = Object.fromEntries(fleet.map((rc) => [rc.def.id, rc]));
    for (const row of rows) {
      const rc = byRc[row.id]; if (!rc) continue;
      const el = this._label(rc);
      if (!rc.inSys || (this._view === 'follow' && this.sel === rc.def.id)) { el.hidden = true; el._y = null; continue; }   // en poursuite, le panneau dit déjà tout
      v.set(rc.pos[0] - frame.cam[0], rc.pos[1] - frame.cam[1], rc.pos[2] - frame.cam[2]).project(camera);
      if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) { el.hidden = true; el._y = null; continue; }
      el.hidden = false;
      const prev = rows[row.rank - 2], gap = prev ? row.gap - prev.gap : 0, me = this.sel === rc.def.id;
      const txt = `${row.rank} ${rc.def.name}${prev ? ' · ' + (gap < 1 ? 'à égalité' : '+' + dur(gap)) : ''}`;
      const b = el.querySelector('b'); if (b.textContent !== txt) b.textContent = txt;
      const sub = me ? `${(this.feed.stateAt(rc.def.id, t).speed / 1e3).toFixed(1).replace('.', ',')} km/s` : '';
      const sm = el.querySelector('small'); if (sm.textContent !== sub) sm.textContent = sub;
      const x = (v.x * 0.5 + 0.5) * W; let y = (-v.y * 0.5 + 0.5) * H;
      for (let k = 0; k < 6; k++) { const hit = placed.find((q) => Math.abs(q[0] - x) < 150 && Math.abs(q[1] - y) < 22); if (!hit) break; y = hit[1] + 22; }
      placed.push([x, y]);
      el._y = el._y == null ? y : el._y + (y - el._y) * 0.25;            // amorti : l'étiquette glisse au lieu de sauter
      // le point reste exactement sur le racer (donc sur sa ligne) ; seule l'étiquette s'écarte, reliée par un filet
      const dy = Math.max(0, el._y - (-v.y * 0.5 + 0.5) * H) | 0;
      el.style.transform = `translate(${x | 0}px, ${((-v.y * 0.5 + 0.5) * H) | 0}px)`;
      if (el._dy !== dy) { el._dy = dy; el.querySelector('span').style.transform = dy ? `translateY(${dy}px)` : ''; el.querySelector('u').style.height = dy + 'px'; }
      el.classList.toggle('on', me); el.classList.toggle('dim', !!this.sel && !me);
    }
    // étiquettes des portes
    for (const a of this.windows.anchors()) {
      let el = this.gateEls[a.kind];
      if (!el) {
        // repère compact (losange + nom court) posé au-dessus de la porte ; un tap déplie la légende, un autre la referme
        el = this.gateEls[a.kind] = document.createElement('button'); el.type = 'button'; el.className = 'rl-gate';
        el.innerHTML = (a.kind === 'peri' ? '<b>Périapse</b><div class="lg">' + BANDS.map((b) => `<span style="--c:#${new THREE.Color(b.col).getHexString()}">${b.label}</span>`).join('')
          : '<b>Anneaux</b><div class="lg"><span class="grad">vide · raccourci</span><span class="grad hot">dense · risque</span>') + '</div>';
        el.setAttribute('aria-expanded', 'false'); el.setAttribute('aria-label', a.kind === 'peri' ? 'Porte de périapse : afficher la légende' : 'Traversée des anneaux : afficher la légende');
        el.onclick = (e) => { e.stopPropagation(); const o = !el.classList.contains('open'); el.classList.toggle('open', o); el.setAttribute('aria-expanded', String(o)); };
        this.c.labels.appendChild(el);
      }
      const on = (p) => { v.set(p[0] - frame.cam[0], p[1] - frame.cam[1], p[2] - frame.cam[2]).project(camera); return v.z <= 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95; };
      const vis = this._view !== 'follow' && (on(a.p) || (a.alt && on(a.alt)));
      el.hidden = !vis; if (!vis) continue;
      // on garde le repère (et sa légende dépliée) dans l'écran
      const ew = el.offsetWidth, eh = el.offsetHeight + 6;
      const x = Math.min(Math.max((v.x * 0.5 + 0.5) * W, 6), W - ew - 6), y = Math.max((-v.y * 0.5 + 0.5) * H, eh + 6);
      el.style.transform = `translate(${x | 0}px, ${y | 0}px)`;
    }
    this._hud();
  }
  _tele(el, t) {
    const F = this.feed, id = this.sel, st = F.stateAt(id, t), R = F.racers.find((r) => r.id === id);
    const row = F.standingsAt(t).find((r) => r.id === id);
    if (!el.dataset.built) {
      el.dataset.built = 1;
      el.innerHTML = `<div class="tl-head"><b class="tl-rank"></b><span class="tl-name"></span><span class="tl-gap"></span></div>
        <div class="tl-speed"><b></b><span>km/s</span></div>
        <div class="tl-grid">
          <span>Accélération</span><b class="tl-acc"></b>
          <span>Poussée</span><b class="tl-thr"></b>
          <span>Température</span><b class="tl-temp"></b>
          <span>Carburant</span><i class="tl-bar"><u class="tl-fuel"></u></i>
          <span>Intégrité</span><i class="tl-bar"><u class="tl-int"></u></i>
        </div>
        <div class="tl-plan"></div>
        <div class="tl-next"></div>`;
    }
    el.style.setProperty('--livery', R.livery);
    const set = (q, v) => { const n = el.querySelector(q); if (n.textContent !== v) n.textContent = v; };
    const fr = (x, d = 1) => x.toFixed(d).replace('.', ',');
    set('.tl-rank', 'P' + row.rank); set('.tl-name', R.name); set('.tl-gap', row.rank === 1 ? 'en tête' : row.gap < 1 ? 'à égalité' : '+' + dur(row.gap));
    if (st.phase === 'system') {
      set('.tl-speed b', fr(st.speed / 1e3)); set('.tl-acc', fr(st.accel, 2) + ' m/s²'); set('.tl-thr', st.thrust > 0.5 ? 'pleine · périapse' : 'croisière');
      set('.tl-temp', Math.round(st.temp) + ' K');
    }
    el.querySelector('.tl-fuel').style.width = Math.round(st.fuel * 100) + '%';
    el.querySelector('.tl-int').style.width = Math.round(st.integrity * 100) + '%';
    set('.tl-plan', st.phase === 'system' && st.planLabel ? 'Choix du pilote : ' + st.planLabel : '');   // la trajectoire choisie à l'entrée (visible : elle se voit déjà)
    set('.tl-next', st.next ? `Prochain : ${st.next.label} · dans ${dur(st.next.t - t)}` : 'Arrivé');
  }
  _label(rc) {
    if (rc._el) return rc._el;
    const el = rc._el = document.createElement('button'); el.type = 'button'; el.className = 'rl-racer'; el.hidden = true;
    el.style.setProperty('--livery', rc.def.livery); el.innerHTML = '<i></i><u></u><span><b></b><small></small></span>';
    el.onclick = () => this.select(rc.def.id);
    this.c.labels.appendChild(el); return el;
  }
  select(id) {
    this.sel = this.sel === id ? null : id;
    const rc = this.sel && this.c.fleet().find((r) => r.def.id === this.sel);
    if (rc && rc.inSys) { this.c.follow(this.sel); this._view = 'follow'; }
    this._hud(true);
  }
  // instant d'arrivée du racer suivi dans ce système (s'il n'y est pas encore)
  _arrival(t) {
    if (!this.sel) return null;
    const seg = this.feed.tracks[this.sel].segs.find((s) => s.kind === 'system' && s.sys.id === this.c.sys().id);
    return seg && seg.t0 > t ? seg.t0 : null;
  }
  _hud(force = false) {
    const t = this.c.getTime(), F = this.feed, sys = this.c.sys(), el = this.c.hud;
    if (!el.dataset.built) {
      el.dataset.built = 1;
      el.innerHTML = `<div class="rh-top"><a id="rh-back" href="#">← Télébyte</a><button type="button" class="rh-live">en direct</button></div>
        <b id="rh-sys"></b><span id="rh-time" class="rh-time"></span>
        <ol id="rh-list"></ol>
        <div id="rh-tele" hidden></div>
        <div id="rh-win" hidden></div>
        <div id="rh-wait" hidden><span></span><button type="button">Aller à son arrivée</button></div>
        <div id="rh-corr" hidden><span>En voyage interstellaire</span><button type="button">Voir le couloir ›</button></div>
        <div class="rh-clock"><input id="rh-clock" type="range" min="0" step="1" aria-label="Temps de course"><button id="rh-speed" type="button">×200</button></div>
        <div class="rh-views"><button type="button" data-v="overview">Ensemble</button><button type="button" data-v="gates">Portes</button><button type="button" data-v="follow">Suivre</button></div>`;
      for (const b of el.querySelectorAll('.rh-views button')) b.onclick = () => {
        const v = b.dataset.v;
        if (v === 'follow') { const f = this.c.fleet(), rc = f.find((r) => r.def.id === this.sel && r.inSys) || f.find((r) => r.inSys); if (!rc) { if (this.c.corridor) this.c.corridor(); return; } this.sel = rc.def.id; this.c.follow(rc.def.id); }   // personne ici : le couloir
        else this.c.views[v]();
        this._view = v; this._hud(true);
      };
      el.querySelector('#rh-clock').max = String(Math.ceil(F.edition.t1));
      el.querySelector('#rh-clock').oninput = (e) => { this.c.setTime(+e.target.value); };
      el.querySelector('#rh-speed').onclick = (e) => { this.speedI = (this.speedI + 1) % this.speeds.length; this.c.setSpeed(this.speeds[this.speedI]); e.target.textContent = '×' + this.speeds[this.speedI]; };
      // en direct : la pastille dit « en direct » ou « revoir · −x » ; toucher la pastille en revoir ramène au présent
      el.querySelector('.rh-live').onclick = () => { const L = this.feed.live; if (L && !this.liveLock) { this.c.setTime(L.source.now()); this._hud(true); } };
      el.querySelector('#rh-back').onclick = (e) => { e.preventDefault(); this.c.back(); };
      el.querySelector('#rh-corr button').onclick = () => { if (this.c.corridor) this.c.corridor(); };
      el.querySelector('#rh-wait button').onclick = () => { const a = this._arrival(this.c.getTime()); if (a) { const id = this.sel; this.c.setTime(a - 300); this.position(a - 300); const rc = this.c.fleet().find((r) => r.def.id === id); if (rc && rc.inSys) this.c.follow(id); this._hud(true); } };
    }
    el.querySelector('#rh-sys').textContent = `${sys.name} · ${sys.address}`;
    for (const b of el.querySelectorAll('.rh-views button')) b.classList.toggle('on', b.dataset.v === (this._view || 'overview'));
    // télémétrie du racer suivi (vue Suivre) : le classement se replie pour dégager l'écran
    const follow = this._view === 'follow' && this.sel, tele = el.querySelector('#rh-tele');
    el.classList.toggle('follow', !!follow); tele.hidden = !follow;
    if (follow) this._tele(tele, t);
    el.querySelector('#rh-time').textContent = hh(t);
    if (F.live) {
      const lk = !!this.liveLock, now = F.live.source.now(), pill = el.querySelector('.rh-live'), sp = el.querySelector('#rh-speed');
      const txt = now < 0 ? 'avant le départ' : lk ? 'en direct' : `revoir · −${dur(Math.max(0, now - t))} · direct ›`;
      if (pill.textContent !== txt) pill.textContent = txt;
      pill.classList.toggle('replay', !lk && now >= 0);
      const stx = lk ? 'direct' : '×' + this.speeds[this.speedI]; if (sp.textContent !== stx) sp.textContent = stx;
      sp.disabled = lk;
    }
    // le racer suivi n'est pas encore là : on l'annonce, avec un raccourci vers son arrivée
    // le racer suivi (ou tout le monde) voyage entre deux systèmes : le couloir le montre (intégré au Télébyte)
    { const travelling = (id) => F.stateAt(id, t).phase === 'leg';
      const show = !!this.c.corridor && (this.sel ? travelling(this.sel) : F.racers.some((r) => travelling(r.id)) && !this.c.fleet().some((rc) => rc.inSys));
      const cb = el.querySelector('#rh-corr'); if (cb.hidden === show) cb.hidden = !show;
      if (show) { const who = this.sel ? F.racers.find((r) => r.id === this.sel).name : 'La course'; const txt = `${who} : en voyage interstellaire`; const sp = cb.querySelector('span'); if (sp.textContent !== txt) sp.textContent = txt; } }
    const arr = this._arrival(t), w = el.querySelector('#rh-wait');
    w.hidden = !arr;
    if (arr) w.querySelector('span').textContent = `${F.racers.find((r) => r.id === this.sel).name} arrive dans ${dur(arr - t)}`;
    const ck = el.querySelector('#rh-clock'); if (document.activeElement !== ck) ck.value = String(Math.round(t));
    // fenêtres du racer suivi (seulement quand la sélection ou le système change)
    const wsig = this.sel + sys.id;
    if (force || wsig !== this._wsig) {
      this._wsig = wsig;
      const win = el.querySelector('#rh-win'), lines = this.sel ? this.windows.describe(this.sel) : [];
      win.hidden = !lines.length; win.innerHTML = lines.map((l) => `<span>${l}</span>`).join('');
    }
    // classement : une ligne par racer, créée une fois ; on ne change que les textes, et l'ordre quand il change
    // (reconstruire la liste à chaque image empêchait de la toucher aux vitesses rapides)
    const list = el.querySelector('#rh-list'), rows = F.standingsAt(t);
    this._rows = this._rows || {};
    for (const r of rows) {
      let li = this._rows[r.id];
      if (!li) {
        const R = F.racers.find((x) => x.id === r.id);
        li = this._rows[r.id] = document.createElement('li'); li.dataset.id = r.id; li.style.setProperty('--livery', R.livery);
        li.innerHTML = `<span class="rk"></span><i></i><span class="nm">${R.name}<small></small></span><span class="gp"></span>`;
        li.onclick = () => this.select(r.id);
      }
      const st = F.stateAt(r.id, t), here = st.phase === 'system' && st.system === sys.id;
      const where = st.phase === 'system' ? (here ? 'ici' : 'à ' + F.edition.systems.find((x) => x.id === st.system).name)
        : st.phase === 'leg' ? 'en voyage → ' + F.edition.systems.find((x) => x.id === st.legTo).name : 'arrivé';
      const set = (q, v) => { const n = li.querySelector(q); if (n.textContent !== v) n.textContent = v; };
      set('.rk', String(r.rank)); set('small', where);
      set('.gp', r.rank === 1 ? 'en tête' : r.gap < 1 ? 'à égalité' : '+' + dur(r.gap));
      li.classList.toggle('on', this.sel === r.id); li.classList.toggle('away', !here);
    }
    const order = rows.map((r) => r.id).join('|');
    if (order !== this._order) { this._order = order; for (const r of rows) list.appendChild(this._rows[r.id]); }
  }
}
