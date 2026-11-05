// ZoomStreaks — l'effet de « zoom accéléré » de la carte du jeu (labo/carte-v6) : stries radiales et éclair blanc
// centrés sur le point visé, quand on plonge d'un plan à l'autre (Télébyte → système → racer) ou qu'on en remonte.
// Calque canvas 2D au-dessus de la scène, sans interaction. play() joue une montée puis une retombée ;
// onMid est appelé au sommet (moment du changement de plan, ou de page).
// Entre deux pages, la seconde moitié est jouée par la page d'arrivée (sessionStorage 'fronde.fx').
export class ZoomStreaks {
  constructor(parent = document.body) {
    const c = this.cv = document.createElement('canvas');
    c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:50';
    parent.appendChild(c); this.ctx = c.getContext('2d'); this.anim = null;
    const fit = () => { const d = Math.min(devicePixelRatio || 1, 2); c.width = innerWidth * d; c.height = innerHeight * d; this.dpr = d; };
    addEventListener('resize', fit); fit();
  }
  // page d'arrivée, une fois la scène prête : on termine l'effet commencé sur la page précédente
  arrive() {
    try {
      const s = sessionStorage.getItem('fronde.fx'); if (!s) return;
      sessionStorage.removeItem('fronde.fx'); const f = JSON.parse(s);
      if (Date.now() - f.at < 15000) this.play(f.dir, innerWidth / 2, innerHeight / 2, { from: 0.5, dur: 1.2 });
    } catch (e) {}
  }
  get busy() { return !!this.anim; }
  clear() { this.anim = null; this.ctx.clearRect(0, 0, this.cv.width, this.cv.height); }
  // dir : 'in' (on plonge) ou 'out' (on remonte) ; x, y : point visé (px CSS)
  play(dir, x, y, { dur = 0.95, onMid = null, from = 0, hold = false } = {}) {
    // temps réel (pas image par image) : l'effet dure ce qu'il doit même quand l'appareil rend peu d'images (entrée dans un système)
    this.anim = { dir, x, y, dur, onMid, t: from, hold, t0: performance.now() - from * dur * 1000, midDone: from >= 0.5 };
    if (!this._raf) this._raf = requestAnimationFrame(this._tick.bind(this));
  }
  // avant de changer de page : la page suivante jouera la retombée
  handoff(dir) { try { sessionStorage.setItem('fronde.fx', JSON.stringify({ dir, at: Date.now() })); } catch (e) {} }
  _tick(now) {
    this._raf = null; const a = this.anim; if (!a) return;
    a.t = (performance.now() - a.t0) / (a.dur * 1000);
    if (!a.midDone && a.t >= 0.5) { a.midDone = true; if (a.onMid) a.onMid(); if (a.hold) { a.t = 0.5; this._draw(1, a); return; } }   // hold : on reste au sommet (changement de page)
    if (a.t >= 1) { this.anim = null; this._draw(0, a); return; }
    const k = a.t < 0.5 ? (a.t / 0.5) ** 2 : 1 - (a.t - 0.5) / 0.5;
    this._draw(k, a);
    this._raf = requestAnimationFrame(this._tick.bind(this));
  }
  _draw(k, a) {
    const c = this.ctx, W = this.cv.width, H = this.cv.height, d = this.dpr, cx = a.x * d, cy = a.y * d;
    c.clearRect(0, 0, W, H); if (k <= 0) return;
    let s = Math.floor(performance.now() / 40) * 9301 + 49297;
    const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const inward = a.dir === 'in';
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 180; i++) {
      const ang = R() * Math.PI * 2, r0 = (20 + R() * Math.max(W, H) * 0.7) * (inward ? 1 : 0.6), len = (60 + R() * 260) * k * d;
      const x0 = cx + Math.cos(ang) * r0, y0 = cy + Math.sin(ang) * r0, x1 = cx + Math.cos(ang) * (r0 + len), y1 = cy + Math.sin(ang) * (r0 + len);
      const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(160,210,255,0)'); g.addColorStop(1, `rgba(200,230,255,${0.55 * k})`);
      c.strokeStyle = g; c.lineWidth = (1 + R() * 2) * d; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    }
    const rg = c.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.6);
    rg.addColorStop(0, `rgba(230,245,255,${k ** 3 * 0.95})`); rg.addColorStop(0.35, `rgba(120,180,255,${k ** 2 * 0.35})`); rg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = rg; c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'source-over';
  }
}
