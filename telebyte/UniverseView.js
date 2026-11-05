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
  constructor(host, overlay, feed, { onSelect = () => {}, onEnter = () => {} } = {}) {
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
  _route() {
    const sys = this.feed.edition.systems, S = this.scene;
    this.nodes = sys.map((s) => ({ sys: s, p: [s.galPos[0] * LY, 0, s.galPos[2] * LY] }));
    const N = this.nodes;
    N.forEach((n, i) => {
      const prev = N[i - 1], next = N[i + 1];
      const dirTo = (q) => { const d = [q.p[0] - n.p[0], q.p[2] - n.p[2]], l = Math.hypot(...d); return [d[0] / l, d[1] / l]; };
      const din = prev ? dirTo(prev) : [-1, 0.25], dout = next ? dirTo(next) : [1, -0.25];
      // entrée côté précédent, sortie côté suivant, périapse de l'autre côté de l'étoile (le crochet de la fronde)
      const perp = [-(din[1] + dout[1]), din[0] + dout[0]], pl = Math.hypot(...perp) || 1;
      const side = [perp[0] / pl, perp[1] / pl];
      n.entry = [n.p[0] + din[0] * LOOP, 0, n.p[2] + din[1] * LOOP];
      n.exit = [n.p[0] + dout[0] * LOOP, 0, n.p[2] + dout[1] * LOOP];
      n.peri = [n.p[0] + side[0] * LOOP * 0.55, 0, n.p[2] + side[1] * LOOP * 0.55];
      n.ctrlA = [n.p[0] + (din[0] + side[0] * 1.4) * LOOP, 0, n.p[2] + (din[1] + side[1] * 1.4) * LOOP];
      n.ctrlB = [n.p[0] + (dout[0] + side[0] * 1.4) * LOOP, 0, n.p[2] + (dout[1] + side[1] * 1.4) * LOOP];
      n.last = !next;
      const sc = STAR_COL[n.sys.star] || 0xffffff;
      const g = new THREE.Group(); g.position.set(...n.p); S.add(g);
      g.add(sprite(GLOW.star, 60, sc, 0.95)); g.add(sprite(GLOW.soft, 260, sc, 0.35)); g.add(sprite(GLOW.soft, 900, sc, 0.08));
      // la géante maîtresse en minuscule disque à côté de l'étoile
      const gd = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(GIANT_COL[n.sys.giant]) }));
      gd.rotation.x = -Math.PI / 2; gd.position.set(side[0] * 34, 1, side[1] * 34); g.add(gd);
      // boucle de fronde : trait fin
      const pts = [];
      for (let k = 0; k <= 48; k++) { const t = k / 48; pts.push(new THREE.Vector3(...(t < 0.5 ? bez(n.entry, n.ctrlA, n.peri, t * 2) : bez(n.peri, n.ctrlB, n.exit, t * 2 - 1))).sub(new THREE.Vector3(...n.p))); }
      if (n.last) pts.splice(25);
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x9fd4ec, transparent: true, opacity: 0.45 })));
    });
    // couloirs interstellaires : bande de lumière douce + trait pointillé
    this.legs = [];
    for (let i = 0; i < N.length - 1; i++) {
      const a = N[i].exit, b = N[i + 1].entry, m = [(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2 - 0.12 * Math.hypot(b[0] - a[0], b[2] - a[2])];
      const leg = { a, m, b }; this.legs.push(leg);
      const pts = []; for (let k = 0; k <= 80; k++) pts.push(new THREE.Vector3(...bez(a, m, b, k / 80)));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xffc9a0, dashSize: 14, gapSize: 10, transparent: true, opacity: 0.5 }));
      line.computeLineDistances(); S.add(line);
      for (let k = 1; k < 14; k++) { const q = bez(a, m, b, k / 14); const s = sprite(GLOW.soft, 260, 0xff9a6a, 0.07); s.position.set(q[0], -4, q[2]); S.add(s); }
    }
  }
  // position (scène) d'un racer d'après son état dans le flux
  _placeOf(id, t) {
    const st = this.feed.stateAt(id, t), tr = this.feed.tracks[id];
    if (st.phase === 'leg') {
      const k = this.feed.edition.systems.findIndex((s) => s.id === st.legFrom), L = this.legs[k];
      return bez(L.a, L.m, L.b, st.f);
    }
    const sysId = st.phase === 'done' ? this.feed.edition.systems[this.feed.edition.systems.length - 1].id : st.system;
    const k = this.feed.edition.systems.findIndex((s) => s.id === sysId), n = this.nodes[k];
    const seg = tr.segs.find((s) => s.kind === 'system' && s.sys.id === sysId);
    const tp = seg.tp, tc = Math.min(Math.max(t, seg.t0), n.last ? tp : seg.t1);
    const u = tc < tp ? 0.5 * (tc - seg.t0) / (tp - seg.t0) : 0.5 + 0.5 * (tc - tp) / Math.max(seg.t1 - tp, 1);
    return u < 0.5 ? bez(n.entry, n.ctrlA, n.peri, u * 2) : bez(n.peri, n.ctrlB, n.exit, u * 2 - 1);
  }
  _markers() {
    const ov = this.overlay; ov.innerHTML = '';
    this.sysLabels = this.nodes.map((n) => {
      const el = document.createElement('button'); el.type = 'button'; el.className = 'tb-sys';
      el.innerHTML = `<b>${n.sys.name}</b><span>${n.sys.address}</span>`; el.setAttribute('aria-label', 'Entrer dans le système ' + n.sys.name);
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
  _bind() {
    const d = this.renderer.domElement, pts = new Map(); let pinch0 = 0, zoom0 = 1;
    d.addEventListener('pointerdown', (e) => { d.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); zoom0 = this.zoom; } });
    d.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return; const p = pts.get(e.pointerId), dx = e.clientX - p[0], dy = e.clientY - p[1]; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) { const k = this.span * this.zoom / this.host.clientWidth; this.pan[0] -= dx * k; this.pan[1] -= dy * k * 1.4; }
      else if (pts.size === 2) { const [a, b] = [...pts.values()]; this.zoom = THREE.MathUtils.clamp(zoom0 * pinch0 / Math.hypot(a[0] - b[0], a[1] - b[1]), 0.18, 1.6); }
    });
    const up = (e) => pts.delete(e.pointerId); d.addEventListener('pointerup', up); d.addEventListener('pointercancel', up);
    d.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom = THREE.MathUtils.clamp(this.zoom * Math.exp(e.deltaY * 0.0012), 0.18, 1.6); }, { passive: false });
  }
  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight; this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  // centrer la vue sur un racer (sélection) ou sur tout le parcours
  update(t, dt) {
    this.nebU.uT.value = t / 3600;
    const c = this.camera, aspect = c.aspect;
    // sur grand écran, le classement occupe la droite : on décale le parcours vers la gauche
    const wide = this.host.clientWidth > 720;
    let focus = [this.center[0] + this.pan[0] + (wide ? this.span * 0.06 : 0), 0, this.center[2] + this.pan[1]];
    if (this.sel) { const p = this._placeOf(this.sel, t); focus = [p[0] + this.pan[0] * 0.2, 0, p[2] + this.pan[1] * 0.2]; }
    this._f = this._f || focus.slice();
    for (let i = 0; i < 3; i++) this._f[i] += (focus[i] - this._f[i]) * (1 - Math.exp(-dt * 4));
    const fit = this.span / Math.min(aspect, 1.6) * (aspect < 0.8 ? 1.25 : 1);
    const dist = fit * (wide ? 1.5 : 1.15) * this.zoom * (this.sel ? 0.45 : 1);
    this._d = this._d ? this._d + (dist - this._d) * (1 - Math.exp(-dt * 3)) : dist;
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
      el.classList.toggle('on', this.sel === r.id); el.classList.toggle('dim', !!this.sel && this.sel !== r.id);
      this.racerGlows[i].position.set(p[0], 2, p[2]); this.racerGlows[i].material.opacity = this.sel && this.sel !== r.id ? 0.25 : 0.85;
    });
    this.renderer.render(this.scene, c);
  }
}
