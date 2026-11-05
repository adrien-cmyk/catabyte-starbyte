// UniverseView — vue univers de Télébyte : le parcours de la course dans le langage des « plans d'existence »
// (labo/carte-v6) : nébuleuse vue d'au-dessus, systèmes en étoiles lumineuses, couloirs de lumière douce pour les
// étapes interstellaires, boucle de fronde autour de chaque géante (entrée → périapse → sortie), racers placés
// d'après le flux de course. Étiquettes et marqueurs en HTML par-dessus (nets, à taille constante, touchables).
import { THREE } from '../sandbox/lib/sb3d-shim.js';

const LY = 230;                                    // unités de scène par année-lumière
const LOOP = 210;                                  // rayon de la boucle de fronde autour d'un système
const STAR_COL = { yellow: 0xffd9a0, white: 0xcfe0ff, red: 0xff9a7a };
const GIANT_COL = { amber: '#d9a066', blue: '#3f95a0', black: '#3a3027' };

const NEB_FS = /* glsl */`
uniform float uT; varying vec2 vP;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 x){ vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++){ s += a * n(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; } return s; }
void main(){
  vec2 p = vP * 0.0011 + vec2(uT * 0.002, 0.0);
  vec2 q = vec2(fbm(p), fbm(p + vec2(5.2, 1.3)));
  vec2 r = vec2(fbm(p + 3.5 * q + vec2(1.7, 9.2) + uT * 0.004), fbm(p + 3.5 * q + vec2(8.3, 2.8)));
  float f = fbm(p + 3.8 * r), dust = smoothstep(0.45, 0.75, fbm(p * 2.3 + 7.1 + r));
  vec3 deep = vec3(0.012, 0.016, 0.04), teal = vec3(0.05, 0.16, 0.22), violet = vec3(0.2, 0.09, 0.3), ember = vec3(0.55, 0.26, 0.1);
  vec3 col = mix(deep, teal, smoothstep(0.3, 0.72, f));
  col = mix(col, violet, smoothstep(0.55, 0.82, f) * smoothstep(0.35, 0.9, r.x));
  float ridge = pow(1.0 - abs(f - 0.62) * 3.2, 6.0) * smoothstep(0.4, 0.8, q.y);
  col += ember * ridge * 0.7;
  col = mix(col, col * 0.2, dust * 0.85);
  float vig = 1.0 - smoothstep(0.2, 1.0, length(vP) * 0.00028);
  gl_FragColor = vec4(col * (0.35 + 0.5 * vig), 1.0);
}`;

function glowTex(inner, mid) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, inner); g.addColorStop(0.22, mid); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const GLOW = { star: null, soft: null };
function sprite(tex, size, color, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size); return s;
}
const bez = (a, b, c, t) => { const u = 1 - t; return [0, 1, 2].map((i) => u * u * a[i] + 2 * u * t * b[i] + t * t * c[i]); };

export class UniverseView {
  constructor(host, overlay, feed, { onSelect = () => {}, onEnter = () => {}, onDive = null } = {}) {
    this.onDive = onDive;                                       // (sysId, x, y) : pincer à fond sur un système = y plonger
    this.host = host; this.overlay = overlay; this.feed = feed; this.onSelect = onSelect; this.onEnter = onEnter; this.sel = null;
    GLOW.star = GLOW.star || glowTex('rgba(255,255,255,1)', 'rgba(255,230,200,.35)');
    GLOW.soft = GLOW.soft || glowTex('rgba(255,255,255,.55)', 'rgba(255,255,255,.08)');
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.toneMapping = THREE.ACESFilmicToneMapping; host.appendChild(r.domElement);
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x020306);
    this.camera = new THREE.PerspectiveCamera(40, 1, 10, 40000);
    this.nebU = { uT: { value: 0 } };
    const neb = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), new THREE.ShaderMaterial({ uniforms: this.nebU, depthWrite: false,
      vertexShader: 'varying vec2 vP; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }', fragmentShader: NEB_FS }));
    neb.rotation.x = -Math.PI / 2; neb.position.y = -60; this.scene.add(neb);
    this._stars();
    this._route();
    this._markers();
    // caméra : survol incliné ; glisser = se déplacer, molette / pincement = zoom
    const xs = this.nodes.map((n) => n.p[0]), zs = this.nodes.map((n) => n.p[2]);
    this.center = [(Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...zs) + Math.max(...zs)) / 2];
    this.span = Math.max(...xs) - Math.min(...xs) + 900; this.zoom = 1; this.pan = [0, 0];
    this._bind(); this.resize();
  }
  _stars() {
    const n = 7000, p = new Float32Array(n * 3), c = new Float32Array(n * 3);
    let s = 7; const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < n; i++) { p.set([(R() - 0.5) * 14000, -20 - R() * 30, (R() - 0.5) * 9000], i * 3); const w = 0.3 + R() * 0.7; c.set([w, w * 0.96, w * (R() < 0.3 ? 0.85 : 1)], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    this.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.3, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false })));
  }
  // nœuds (systèmes), boucles de fronde, couloirs ; points de contrôle placés sur ces courbes
  // le parcours : une seule courbe lisse (Catmull-Rom centripète) qui arrive dans chaque système, contourne l'étoile
  // au plus près (côté intérieur du virage, comme une fronde) et repart vers le suivant — sans coin ni épingle.
  // Points de passage par système : entrée, périapse, sortie (le dernier système s'arrête à la périapse : l'arrivée).
  _route() {
    const sys = this.feed.edition.systems, S = this.scene;
    this.nodes = sys.map((s) => ({ sys: s, p: [s.galPos[0] * LY, 0, s.galPos[2] * LY] }));
    const N = this.nodes, pts = [];
    N.forEach((n, i) => {
      const prev = N[i - 1], next = N[i + 1];
      const dirTo = (q) => { const d = [q.p[0] - n.p[0], q.p[2] - n.p[2]], l = Math.hypot(...d); return [d[0] / l, d[1] / l]; };
      const din = prev ? dirTo(prev) : (() => { const d = dirTo(next); return [-d[0], -d[1]]; })();
      const dout = next ? dirTo(next) : [-din[0], -din[1]];
      // côté de la périapse : à l'intérieur du virage (là où la trajectoire se replie), à défaut perpendiculaire
      let side = [-(din[0] + dout[0]), -(din[1] + dout[1])];
      if (Math.hypot(...side) < 0.2) side = [-dout[1], dout[0]];
      const sl = Math.hypot(...side); side = [side[0] / sl, side[1] / sl];
      n.entry = [n.p[0] + din[0] * LOOP, 0, n.p[2] + din[1] * LOOP];
      n.peri = [n.p[0] + side[0] * LOOP * 0.42, 0, n.p[2] + side[1] * LOOP * 0.42];
      n.exit = [n.p[0] + dout[0] * LOOP, 0, n.p[2] + dout[1] * LOOP];
      n.last = !next; n.side = side;
      n.iE = pts.length; pts.push(n.entry); n.iP = pts.length; pts.push(n.peri);
      if (!n.last) { n.iX = pts.length; pts.push(n.exit); }
      const sc = STAR_COL[n.sys.star] || 0xffffff;
      const g = new THREE.Group(); g.position.set(...n.p); S.add(g);
      g.add(sprite(GLOW.star, 60, sc, 0.95)); g.add(sprite(GLOW.soft, 260, sc, 0.35)); g.add(sprite(GLOW.soft, 900, sc, 0.08));
      const gd = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(GIANT_COL[n.sys.giant]) }));
      gd.rotation.x = -Math.PI / 2; gd.position.set(-side[0] * 34, 1, -side[1] * 34); g.add(gd);
    });
    this.curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
    this.nPts = pts.length;
    const seg = (a, b, n) => { const out = []; for (let k = 0; k <= n; k++) out.push(this.curve.getPoint((a + (b - a) * k / n) / (this.nPts - 1))); return out; };
    // passages dans les systèmes : trait fin continu ; étapes interstellaires : pointillé et couloir de lumière douce
    for (const n of N) {
      const a = n.iE, b = n.last ? n.iP : n.iX;
      S.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(seg(a, b, 60)), new THREE.LineBasicMaterial({ color: 0x9fd4ec, transparent: true, opacity: 0.55 })));
    }
    for (let i = 0; i < N.length - 1; i++) {
      const pts2 = seg(N[i].iX, N[i + 1].iE, 80);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts2), new THREE.LineDashedMaterial({ color: 0xffc9a0, dashSize: 14, gapSize: 10, transparent: true, opacity: 0.5 }));
      line.computeLineDistances(); S.add(line);
      for (let k = 1; k < 14; k++) { const q = pts2[Math.round(k / 14 * 80)]; const sp = sprite(GLOW.soft, 260, 0xff9a6a, 0.07); sp.position.set(q.x, -4, q.z); S.add(sp); }
    }
  }
  // position (scène) d'un racer d'après son état dans le flux : abscisse sur la courbe du parcours
  _placeOf(id, t) {
    const st = this.feed.stateAt(id, t), tr = this.feed.tracks[id], E = this.feed.edition;
    let u;
    if (st.phase === 'leg') {
      const k = E.systems.findIndex((s) => s.id === st.legFrom);
      u = this.nodes[k].iX + (this.nodes[k + 1].iE - this.nodes[k].iX) * st.f;
    } else {
      const sysId = st.phase === 'done' ? E.systems[E.systems.length - 1].id : st.system;
      const k = E.systems.findIndex((s) => s.id === sysId), n = this.nodes[k];
      const seg = tr.segs.find((s) => s.kind === 'system' && s.sys.id === sysId), tp = seg.tp;
      const tc = Math.min(Math.max(t, seg.t0), n.last ? tp : seg.t1);
      u = tc < tp ? n.iE + (n.iP - n.iE) * (tc - seg.t0) / Math.max(tp - seg.t0, 1) : n.iP + ((n.last ? n.iP : n.iX) - n.iP) * (tc - tp) / Math.max(seg.t1 - tp, 1);
    }
    const v = this.curve.getPoint(Math.min(1, Math.max(0, u / (this.nPts - 1))));
    return [v.x, v.y, v.z];
  }
  _markers() {
    const ov = this.overlay; ov.innerHTML = '';
    this.sysLabels = this.nodes.map((n) => {
      const el = document.createElement('button'); el.type = 'button'; el.className = 'tb-sys';
      el.innerHTML = `<b>${n.sys.name}</b><span>${n.sys.address}</span><i>voir en 3D ▸</i>`; el.setAttribute('aria-label', 'Entrer dans le système ' + n.sys.name);
      el.onclick = (e) => { e.stopPropagation(); this.onEnter(n.sys.id); };
      ov.appendChild(el); return el;
    });
    this.racerEls = this.feed.racers.map((r) => {
      const el = document.createElement('button'); el.className = 'tb-racer'; el.type = 'button';
      el.style.setProperty('--livery', r.livery); el.innerHTML = `<i></i><span>${r.name}</span>`;
      el.setAttribute('aria-label', 'Suivre ' + r.name);
      el.onclick = (e) => { e.stopPropagation(); this.select(r.id); };
      ov.appendChild(el); return el;
    });
    this.racerGlows = this.feed.racers.map((r) => { const s = sprite(GLOW.soft, 70, new THREE.Color(r.livery), 0.8); this.scene.add(s); return s; });
  }
  select(id) { this.sel = this.sel === id ? null : id; this.onSelect(this.sel); }
  // zoom continu avec la vue système : plonger vers un système, ou en ressortir (la caméra repart de tout près)
  diveTo(sysId) { const n = this.nodes.find((x) => x.sys.id === sysId); if (n) this.diving = { p: n.p.slice(), t: 0 }; }
  surfaceFrom(sysId) {
    this.diving = null; const n = this.nodes.find((x) => x.sys.id === sysId); if (!n) return;
    this._f = n.p.slice(); this._d = this.span * 0.02;               // puis l'amorti normal ramène au cadrage du parcours
  }
  _bind() {
    const d = this.renderer.domElement, pts = new Map(); let pinch0 = 0, zoom0 = 1;
    // les gestes commencés sur une étiquette de la scène comptent aussi (sinon pincer sur un vaisseau ne zoome pas)
    const ok = (e) => e.target === d || !!(e.target.closest && e.target.closest('.tb-racer, .tb-sys'));
    let movedPx = 0;                                       // un glissé ou un pincement commencé sur une étiquette n'est pas un tap
    addEventListener('click', (e) => { if (movedPx > 8 && e.target !== d && ok(e)) { e.stopPropagation(); e.preventDefault(); } }, true);
    addEventListener('pointerdown', (e) => { if (!pts.size) movedPx = 0; if (!ok(e)) return; if (e.target === d) d.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); zoom0 = this.zoom; } });
    addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return; { const q = pts.get(e.pointerId); movedPx += Math.abs(e.clientX - q[0]) + Math.abs(e.clientY - q[1]) + (pts.size > 1 ? 99 : 0); } const p = pts.get(e.pointerId), dx = e.clientX - p[0], dy = e.clientY - p[1]; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) { const k = this.span * this.zoom / this.host.clientWidth; this.pan[0] -= dx * k; this.pan[1] -= dy * k * 1.4; }
      else if (pts.size === 2) { const [a, b] = [...pts.values()], dd = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0) this.zoomBy(pinch0 / dd, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); pinch0 = dd; }
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0; }; addEventListener('pointerup', up); addEventListener('pointercancel', up);
    addEventListener('wheel', (e) => { if (!ok(e)) return; e.preventDefault(); this.zoomBy(Math.exp(e.deltaY * 0.0012), e.clientX, e.clientY); }, { passive: false });
  }
  // zoom vers le doigt (comme la carte du jeu) ; à la butée, continuer à pincer vers un système = y plonger
  zoomBy(f, x, y) {
    const now = performance.now(); if (now - (this._zl || 0) > 2500 || (f > 1 && this._acc < 1)) this._acc = 1; this._zl = now; this._acc *= f;   // pincements successifs cumulés ; reculer remet à zéro
    const z0 = this.zoom, z1 = THREE.MathUtils.clamp(z0 * f, 0.18, 1.6), q = z1 / z0;
    if (f < 1 && this.onDive) {
      const n = this._nearSys(x, y);
      if (n && n.px < 110 && (z0 <= 0.2 || this._acc < 0.3)) { this._acc = 1; this.onDive(n.id, n.x, n.y); return; }
    }
    if (q < 1 && x != null) {                                  // le point sous les doigts glisse vers le centre
      const g = this._ground(x, y); if (g) { const f0 = this._f || [this.center[0], 0, this.center[2]]; this.pan[0] += (g[0] - f0[0]) * (1 - q); this.pan[1] += (g[2] - f0[2]) * (1 - q); }
    } else if (q > 1) { this.pan[0] /= q; this.pan[1] /= q; }
    this.zoom = z1;
  }
  _ground(x, y) {
    const r = this.renderer.domElement.getBoundingClientRect(), c = this.camera, v = new THREE.Vector3(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1, 0.5).unproject(c).sub(c.position).normalize();
    if (Math.abs(v.y) < 1e-6) return null; const s = -c.position.y / v.y; return s > 0 ? [c.position.x + v.x * s, 0, c.position.z + v.z * s] : null;
  }
  _nearSys(x, y) {
    const r = this.renderer.domElement.getBoundingClientRect(), v = new THREE.Vector3(); let best = null;
    for (const n of this.nodes) { v.set(n.p[0], n.p[1], n.p[2]).project(this.camera); const sx = (v.x * 0.5 + 0.5) * r.width + r.left, sy = (-v.y * 0.5 + 0.5) * r.height + r.top, px = Math.hypot(sx - x, sy - y); if (!best || px < best.px) best = { id: n.sys.id, px, x: sx, y: sy }; }
    return best;
  }
  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight; this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  // centrer la vue sur un racer (sélection) ou sur tout le parcours
  update(t, dt) {
    // définition qui s'adapte : sous ~40 i/s durables (nébuleuse plein écran sur un téléphone), on baisse la densité de pixels
    this._fa = (this._fa || 0) + dt; this._fn = (this._fn || 0) + 1;
    if (this._fa > 2) { const fps = this._fn / this._fa; this._fa = this._fn = 0;
      const pr = this.renderer.getPixelRatio();
      if (fps < 40 && pr > 1) { this.renderer.setPixelRatio(Math.max(1, pr - 0.5)); this.resize(); } }
    this.nebU.uT.value = t / 3600;
    const c = this.camera, aspect = c.aspect;
    // sur grand écran, le classement occupe la droite : on décale le parcours vers la gauche
    const wide = this.host.clientWidth > 720;
    let focus = [this.center[0] + this.pan[0] + (wide ? this.span * 0.06 : 0), 0, this.center[2] + this.pan[1]];
    if (this.sel) { const p = this._placeOf(this.sel, t); focus = [p[0] + this.pan[0] * 0.2, 0, p[2] + this.pan[1] * 0.2]; }
    this._f = this._f || focus.slice();
    const fit = this.span / Math.min(aspect, 1.6) * (aspect < 0.8 ? 1.25 : 1) * (aspect < 0.6 ? 1.25 : 1);   // portrait étroit : marge pour les systèmes extrêmes
    const dist = fit * (wide ? 1.5 : 1.15) * this.zoom * (this.sel ? 0.45 : 1);
    if (this.diving) {
      // plongée vers un système : visée qui file sur lui, distance qui fond de plus en plus vite (zoom accéléré)
      const dv = this.diving; dv.t += dt;
      for (let i = 0; i < 3; i++) this._f[i] += (dv.p[i] - this._f[i]) * (1 - Math.exp(-dt * 9));
      this._d = Math.max(this._d * Math.exp(-dt * (1.5 + 14 * dv.t)), this.span * 0.004);   // plancher : pas de caméra confondue avec sa cible
    } else {
      for (let i = 0; i < 3; i++) this._f[i] += (focus[i] - this._f[i]) * (1 - Math.exp(-dt * 4));
      this._d = this._d ? this._d + (dist - this._d) * (1 - Math.exp(-dt * 3)) : dist;
    }
    c.position.set(this._f[0], this._d * Math.sin(1.0), this._f[2] + this._d * Math.cos(1.0)); c.lookAt(this._f[0], 0, this._f[2]);
    c.updateMatrixWorld();
    // étiquettes et marqueurs HTML
    const W = this.host.clientWidth, H = this.host.clientHeight, v = new THREE.Vector3();
    const proj = (p) => { v.set(p[0], p[1], p[2]).project(c); return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H, v.z < 1]; };
    this.nodes.forEach((n, i) => { const [x, y] = proj(n.p); this.sysLabels[i].style.transform = `translate(${x | 0}px, ${(y + 18) | 0}px)`; });
    const placed = [];
    this.feed.racers.forEach((r, i) => {
      const p = this._placeOf(r.id, t), [x, y] = proj(p), el = this.racerEls[i];
      // décalage vertical des étiquettes qui se chevauchent
      let oy = 0; for (const q of placed) if (Math.abs(q[0] - x) < 90 && Math.abs(q[1] - (y + oy)) < 18) oy += 18;
      placed.push([x, y + oy]);
      el.style.transform = `translate(${x | 0}px, ${(y + oy) | 0}px)`;
      el.classList.toggle('left', x > W - (el._w || (el._w = el.offsetWidth)) - 8);
      el.classList.toggle('on', this.sel === r.id); el.classList.toggle('dim', !!this.sel && this.sel !== r.id);
      this.racerGlows[i].position.set(p[0], 2, p[2]); this.racerGlows[i].material.opacity = this.sel && this.sel !== r.id ? 0.25 : 0.85;
    });
    this.renderer.render(this.scene, c);
  }
}
