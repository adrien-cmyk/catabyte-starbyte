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

const hh = (s) => { s = Math.max(0, s); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return (d ? `J+${d} ` : '') + `${String(h).padStart(2, '0')} h ${String(m).padStart(2, '0')}`; };
const dur = (s) => { s = Math.abs(s); if (s < 60) return `${Math.round(s)} s`; const h = Math.floor(s / 3600), m = Math.round(s % 3600 / 60); return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`; };

export class RaceLayer {
  // ctx : { scene, frame, feed, giant(), sys(), fleet() (racers en livrée, avec .def), hud, labels,
  //         setTime(t), getTime(), setSpeed(x), follow(id) }
  constructor(ctx) {
    this.c = ctx; this.on = false; this.sel = null; this.holos = {}; this._q = new THREE.Quaternion(); this._v = new THREE.Vector3();
    this.speeds = [1, 20, 200, 2000]; this.speedI = 2;
  }
  get feed() { return this.c.feed; }
  enter({ t = null, sel = null } = {}) {
    this.on = true; this.sel = sel;
    const sys = this.c.sys(), F = this.feed;
    // par défaut : quelques minutes avant que le premier racer entre dans ce système
    if (t == null) {
      const firsts = F.racers.map((r) => F.tracks[r.id].segs.find((s) => s.kind === 'system' && s.sys.id === sys.id)).filter(Boolean);
      t = Math.min(...firsts.map((s) => s.tp)) - 3 * 3600;
    }
    this.c.setTime(t); this.c.setSpeed(this.speeds[this.speedI]);
    this.rebuild(); this._hud(true);
    this.c.hud.hidden = false; this.c.labels.hidden = false;
  }
  exit() {
    this.on = false; this.c.hud.hidden = true; this.c.labels.hidden = true;
    for (const h of Object.values(this.holos)) h.group.visible = false;
  }
  // trajectoires du système affiché, converties dans le repère du monde
  rebuild() {
    const sys = this.c.sys(), g = this.c.giant(), q = g.group.quaternion, gp = g.pos, v = this._v;
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(q).toArray();
    for (const r of this.feed.racers) {
      let h = this.holos[r.id];
      if (!h) { h = this.holos[r.id] = new TrajectoryHolo({ color: r.livery, past: r.livery, maxPoints: 700 }); this.c.scene.add(h.group); }
      const S = this.feed.plannedPath(r.id, sys.id).map((s) => {
        v.set(...s.p).applyQuaternion(q); const p = [gp[0] + v.x, gp[1] + v.y, gp[2] + v.z];
        v.set(...s.v).applyQuaternion(q); return { t: s.t, p, v: [v.x, v.y, v.z] };
      });
      h.ok = S.length > 1;
      if (h.ok) h.setPath(S, { tickEvery: 3600, ringPlane: g.ring ? { center: gp, normal: axis, inner: g.ring.inner * g.R, outer: g.ring.outer * g.R } : null });
    }
    this._hud(true);
  }
  // à chaque image, avant le rendu : racers à leur place du flux
  position(t) {
    if (!this.on) return;
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
    for (const rc of this.c.fleet()) {
      const el = this._label(rc), row = byId[rc.def.id];
      if (!rc.inSys) { el.hidden = true; continue; }
      v.set(rc.pos[0] - frame.cam[0], rc.pos[1] - frame.cam[1], rc.pos[2] - frame.cam[2]).project(camera);
      if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) { el.hidden = true; continue; }
      el.hidden = false;
      const prev = rows[row.rank - 2], gap = prev ? row.gap - prev.gap : 0, st = this.feed.stateAt(rc.def.id, t);
      el.querySelector('b').textContent = `${row.rank}. ${rc.def.name}`;
      el.querySelector('small').textContent = `${prev ? (gap < 1 ? 'à égalité' : '+' + dur(gap)) + ' · ' : ''}${(st.speed / 1e3).toFixed(1)} km/s`;
      // étiquettes proches : on les décale vers le bas pour qu'elles restent lisibles
      const x = (v.x * 0.5 + 0.5) * W; let y = (-v.y * 0.5 + 0.5) * H;
      for (let k = 0; k < 4; k++) { const hit = placed.find((q) => Math.abs(q[0] - x) < 130 && Math.abs(q[1] - y) < 30); if (!hit) break; y = hit[1] + 30; }
      placed.push([x, y]);
      el.style.transform = `translate(${x | 0}px, ${y | 0}px)`;
      el.classList.toggle('on', this.sel === rc.def.id); el.classList.toggle('dim', !!this.sel && this.sel !== rc.def.id);
    }
    this._hud();
  }
  _label(rc) {
    if (rc._el) return rc._el;
    const el = rc._el = document.createElement('button'); el.type = 'button'; el.className = 'rl-racer'; el.hidden = true;
    el.style.setProperty('--livery', rc.def.livery); el.innerHTML = '<i></i><span><b></b><small></small></span>';
    el.onclick = () => this.select(rc.def.id);
    this.c.labels.appendChild(el); return el;
  }
  select(id) {
    this.sel = this.sel === id ? null : id;
    const rc = this.sel && this.c.fleet().find((r) => r.def.id === this.sel);
    if (rc && rc.inSys) this.c.follow(this.sel);
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
      el.innerHTML = `<div class="rh-top"><a id="rh-back" href="#">← Télébyte</a><span class="rh-live">en direct</span></div>
        <b id="rh-sys"></b><span id="rh-time" class="rh-time"></span>
        <ol id="rh-list"></ol>
        <div id="rh-wait" hidden><span></span><button type="button">Aller à son arrivée</button></div>
        <div class="rh-clock"><input id="rh-clock" type="range" min="0" step="1" aria-label="Temps de course"><button id="rh-speed" type="button">×200</button></div>`;
      el.querySelector('#rh-clock').max = String(Math.ceil(F.edition.t1));
      el.querySelector('#rh-clock').oninput = (e) => { this.c.setTime(+e.target.value); };
      el.querySelector('#rh-speed').onclick = (e) => { this.speedI = (this.speedI + 1) % this.speeds.length; this.c.setSpeed(this.speeds[this.speedI]); e.target.textContent = '×' + this.speeds[this.speedI]; };
      el.querySelector('#rh-back').onclick = (e) => { e.preventDefault(); this.c.back(); };
      el.querySelector('#rh-wait button').onclick = () => { const a = this._arrival(this.c.getTime()); if (a) { const id = this.sel; this.c.setTime(a - 300); this.position(a - 300); const rc = this.c.fleet().find((r) => r.def.id === id); if (rc && rc.inSys) this.c.follow(id); this._hud(true); } };
    }
    el.querySelector('#rh-sys').textContent = `${sys.name} · ${sys.address}`;
    el.querySelector('#rh-time').textContent = hh(t);
    // le racer suivi n'est pas encore là : on l'annonce, avec un raccourci vers son arrivée
    const arr = this._arrival(t), w = el.querySelector('#rh-wait');
    w.hidden = !arr;
    if (arr) w.querySelector('span').textContent = `${F.racers.find((r) => r.id === this.sel).name} arrive dans ${dur(arr - t)}`;
    const ck = el.querySelector('#rh-clock'); if (document.activeElement !== ck) ck.value = String(Math.round(t));
    const rows = F.standingsAt(t), sig = rows.map((r) => r.id + r.cp).join('|') + this.sel + sys.id + Math.floor(t / 60);
    if (!force && sig === this._sig) return; this._sig = sig;
    el.querySelector('#rh-list').innerHTML = rows.map((r) => {
      const R = F.racers.find((x) => x.id === r.id), st = F.stateAt(r.id, t);
      const where = st.phase === 'system' ? (st.system === sys.id ? 'ici' : 'à ' + F.edition.systems.find((s) => s.id === st.system).name)
        : st.phase === 'leg' ? 'en voyage → ' + F.edition.systems.find((s) => s.id === st.legTo).name : 'arrivé';
      return `<li data-id="${r.id}" class="${this.sel === r.id ? 'on' : ''}${st.phase === 'system' && st.system === sys.id ? '' : ' away'}" style="--livery:${R.livery}">
        <span class="rk">${r.rank}</span><i></i><span class="nm">${R.name}<small>${where}</small></span><span class="gp">${r.rank === 1 ? 'en tête' : r.gap < 1 ? 'à égalité' : '+' + dur(r.gap)}</span></li>`;
    }).join('');
    for (const li of el.querySelectorAll('#rh-list li')) li.onclick = () => this.select(li.dataset.id);
  }
}
