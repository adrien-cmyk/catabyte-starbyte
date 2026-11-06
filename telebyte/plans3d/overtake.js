// Plan 3D « dépassement » (GDD_PLANS_3D) : un gros plan bref. On ne voit presque pas le dépassement, on le SENT :
//   1. (0–1,7 s)  gros plan sur le flanc du vaisseau doublé ; sa coque se teinte de bleu : quelque chose arrive derrière ;
//   2. (1,7–2,1 s) le poursuivant déchire le cadre à quelques mètres de la caméra, la caméra tremble ;
//   3. (2,1–4,6 s) elle le suit des yeux : il n'est plus qu'un trait de flamme ; le classement change, retour au schéma.
// Mise en scène déterministe (hasard initialisé avec event.key) sur le résultat réel de la course (qui double qui,
// rangs avant/après, coque, carburant). Vaisseaux à leurs vraies dimensions (1 unité = 1 m).
//   overtakeScript(event, { feed, E, racer }) → script (voir player.js : setup, rate, place, thrust, puffAt, camera,
//                                                       guard, hud, audio, cues, duration)

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const smoother = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); };
const lerp = (a, b, t) => a + (b - a) * t;
const bump = (a, b, x) => (x <= a || x >= b ? 0 : Math.sin(Math.PI * (x - a) / (b - a)));   // 0 → 1 → 0
function rngOf(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ce que disent les données au moment du dépassement
export function overtakeData(e, { feed, E }) {
  const A = e.racer, B = (e.data.passed || [])[0];
  const before = feed.standingsAt(e.t - 0.5), after = feed.standingsAt(e.t + 0.5);
  const ra = (rows, id) => rows.find((r) => r.id === id) || { rank: 0, gap: 0 };
  const cp = feed.tracks[A].cps.find((c) => Math.abs(c.t - e.t) < 0.5);
  const st = feed.stateAt(A, e.t);
  const sys = E.systems.find((s) => s.id === (cp ? cp.sys : st.system)) || E.systems[0];
  // un dépassement simple fait gagner une place (même si le fait en compte plusieurs, on met en scène le premier)
  const rb = ra(before, A).rank, rAfter = ra(after, A).rank;
  return {
    A, B, rankBefore: rb, rankAfter: Math.max(rAfter, rb - 1), lead: !!e.data.lead && rb - 1 === 1,
    gapBefore: Math.max(0, ra(before, A).gap - ra(before, B).gap), gapAfter: Math.max(0, ra(after, B).gap - ra(after, A).gap),
    where: cp ? cp.label : sys.name, giant: sys.giant || 'amber', integrity: st.integrity, fuel: st.fuel,
  };
}

export function overtakeScript(e, ctx) {
  const d = overtakeData(e, ctx), R = rngOf(e.key || 'x');
  const cs = R() < 0.5 ? -1 : 1;               // flanc filmé, et côté où le poursuivant passe
  const tremble = R() * 100, frac = 0.3 + R() * 0.15;   // caméra vers la poupe : toute la coque devant elle
  const D = 4.6, TP = 1.85;                     // durée, instant où il passe à hauteur de la caméra
  let la = 30, lb = 30, wa = 5, wb = 5, ha = 3, hb = 3, cam0 = [0, 0, 0], laneX = 12;
  const script = {
    data: d, duration: D, side: cs, giant: d.giant,
    setup(a, b) {
      la = a.userData.len; lb = b.userData.len; wa = a.userData.half.x; wb = b.userData.half.x; ha = a.userData.half.y; hb = b.userData.half.y;
      // caméra de trois quarts arrière, à l'écart du flanc de b : on le lit comme un vaisseau qui file (pas « dressé »
      // dans l'écran) ; le poursuivant passera entre lui et la caméra
      const gapC = Math.max(6, lb * 0.35, wa * 2 + 4);
      cam0 = [cs * (wb + gapC), hb * 0.2, -lb * 0.5 - Math.max(8, lb * 0.35)];
      laneX = cs * (wb + gapC * 0.5);
    },
    rate: () => 1,
    pose(τ) {
      const sh = Math.exp(-Math.max(0, τ - TP) * 3.2) * (τ > TP ? 1 : 0), j = (k) => Math.sin(τ * 43 + tremble + k) * sh;
      const B = { x: j(1) * 0.15, y: Math.sin(τ * 0.9) * 0.15 + j(2) * 0.2, z: 0, rx: 0, ry: 0, rz: j(3) * 0.01 };
      // a : vient de loin derrière, passe la caméra à TP, puis file (vitesse relative énorme, en accélération)
      const v = Math.max(260, la * 9), z = cam0[2] + v * (τ - TP) + (τ > TP ? 120 * (τ - TP) * (τ - TP) : 0);
      const A = { x: laneX - cs * Math.max(0, τ - TP) * 2, y: cam0[1] + ha * 0.4, z, rx: 0, ry: -cs * 0.02, rz: cs * 0.05 };
      return { A, B };
    },
    place(τ, a, b) {
      const p = this.pose(τ);
      b.position.set(p.B.x, p.B.y, p.B.z); b.rotation.set(p.B.rx, p.B.ry, p.B.rz);
      a.position.set(p.A.x, p.A.y, p.A.z); a.rotation.set(p.A.rx, p.A.ry, p.A.rz);
    },
    thrust: (τ) => ({ A: 1.35, B: 0.75 }),
    puffAt: () => [],
    camera(τ, a, b, cam) {
      const p = this.pose(τ), A = p.A;
      const sh = τ > TP - 0.05 ? Math.exp(-(τ - TP + 0.05) * 3) : 0, n = (k) => (Math.sin(τ * 47 + tremble + k) * 0.6 + Math.sin(τ * 71 + k * 2) * 0.4) * (0.02 + sh * 0.5);
      cam.position.set(cam0[0] + n(1), cam0[1] + n(2), cam0[2] + n(3));
      // regard : le long de la coque, puis il accroche le poursuivant qui s'éloigne (avec retard : on « le cherche »)
      // le long de la coque, légèrement tourné vers elle : la coque d'un côté, le vide (où il va passer) de l'autre
      const hull = [cs * wb * 0.3, 0, lb * 0.15], follow = smooth(TP + 0.05, TP + 0.75, τ);
      const az = Math.min(A.z, cam0[2] + 1600), ax = lerp(cam0[0], A.x, 0.9);
      cam.lookAt(lerp(hull[0], ax, follow), lerp(hull[1], A.y, follow), lerp(hull[2], az, follow));
      const fov = lerp(46, 38, smooth(TP + 0.3, D, τ));
      if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
      return τ < TP - 0.15 ? 'flanc' : τ < TP + 0.3 ? 'passage' : 'fuite';
    },
    guard(τ, a, b, boxOf) { const bA = boxOf(a), bB = boxOf(b); return { gap: null, passed: bA.min.z > bB.max.z || τ > TP + 0.6 }; },
    hud(τ, g) {
      const done = !!(g && g.passed);
      return {
        title: `Dépassement${d.where ? ' · ' + d.where : ''}`, racer: d.A, other: d.B, done, hideCard: τ > 0.9 && τ < TP + 0.7,
        pos: done ? `P${d.rankAfter}` : `P${d.rankBefore}`, posFrom: done ? `P${d.rankBefore}` : null,
        gap: done ? { label: 'devant', value: d.gapAfter } : { label: 'derrière', value: d.gapBefore },
        integrity: d.integrity, fuel: d.fuel, lead: d.lead, proximity: null,
      };
    },
    // son : la poussée qui monte derrière, le souffle au passage, puis elle s'éloigne
    audio(τ) { const near = Math.exp(-Math.pow((τ - TP) / 0.35, 2)), app = smooth(0.3, TP, τ) * (τ < TP ? 1 : Math.exp(-(τ - TP) * 1.2));
      return { rumble: Math.min(1, 0.2 + app * 0.5 + near * 0.6), hz: 60 + app * 120 + near * 260, vib: near * 0.8 }; },
    cues: [{ τ: TP + 0.25, id: 'passe' }],
  };
  return script;
}
