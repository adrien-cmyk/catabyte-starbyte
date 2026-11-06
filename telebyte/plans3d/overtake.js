// Plan 3D « dépassement » (GDD_PLANS_3D, étape 2). Fonction pure : un fait `overtake` de la chronologie et le flux
// → une séquence de ~12 s (temps d'écran, quelle que soit la vitesse de la course), toujours la même pour le même
// fait (hasard initialisé avec event.key). Le dépassement est MIS EN SCÈNE : dans les données c'est un ordre de passage
// à un point de contrôle (les vaisseaux sont en réalité à des milliers de km) ; l'écart réel devient une distance.
//   overtakeScript(event, { feed, E, racer }) → { duration, rate(τ), place(τ, a, b), camera(τ, a, b, cam), hud(τ) }
// Repère : les deux vaisseaux filent vers +z ; b (le doublé) sur l'axe, a (le poursuivant) sur le côté `side`.

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
function rngOf(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ce que disent les données au moment du dépassement
export function overtakeData(e, { feed, E }) {
  const A = e.racer, B = (e.data.passed || [])[0];
  const before = feed.standingsAt(e.t - 0.5), after = feed.standingsAt(e.t + 0.5);
  const ra = (rows, id) => rows.find((r) => r.id === id) || { rank: 0, gap: 0 };
  const cp = feed.tracks[A].cps.find((c) => Math.abs(c.t - e.t) < 0.5);
  const st = feed.stateAt(A, e.t), stB = feed.stateAt(B, e.t);
  const sys = E.systems.find((s) => s.id === (cp ? cp.sys : st.system));
  return {
    A, B, rankBefore: ra(before, A).rank, rankAfter: ra(after, A).rank, lead: !!e.data.lead,
    gapBefore: Math.max(0, ra(before, A).gap - ra(before, B).gap), gapAfter: Math.max(0, ra(after, B).gap - ra(after, A).gap),
    where: cp ? cp.label : sys ? sys.name : '', integrity: st.integrity, fuel: st.fuel, speed: st.speed || null, speedB: stB.speed || null,
  };
}

export function overtakeScript(e, ctx) {
  const d = overtakeData(e, ctx), R = rngOf(e.key || 'x');
  const side = R() < 0.5 ? -1 : 1, bob = R() * 6.28, shakeS = R() * 100;
  const L = 30, V = 260;                                          // longueur d'un vaisseau, vitesse d'écran (unités/s)
  // écart à l'écran : 2 à 4 longueurs derrière au départ (selon l'écart réel), 1,5 devant à la fin
  const back = L * (2.2 + Math.min(1.6, d.gapBefore / 300)), ahead = L * 1.5;
  const tPass = 5.1, D = 10.2;
  const rel = (τ) => lerp(-back, ahead, smooth(1.0, 7.8, τ));      // position de a par rapport à b, le long de z
  const passing = (τ) => Math.exp(-Math.pow((rel(τ)) / (L * 1.4), 2));   // 1 au moment du passage
  const shots = [
    { id: 'embarquee', from: 0, to: 4.4 },
    { id: 'exterieur', from: 4.4, to: 7.9 },
    { id: 'arriere', from: 7.9, to: D },
  ];
  return {
    data: d, duration: D, side, shots,
    // ralenti au passage (temps d'écran plus lent entre 4,7 et 6,1 s)
    rate: (τ) => (τ > 4.7 && τ < 6.1 ? 0.42 : 1),
    shotAt: (τ) => shots.find((s) => τ >= s.from && τ < s.to) || shots[shots.length - 1],
    // a et b : groupes three.js (vaisseaux) ; on les place dans le repère qui file à V
    place(τ, a, b) {
      const z0 = V * τ;
      b.position.set(0, Math.sin(τ * 0.9 + bob) * 1.2, z0);
      b.rotation.set(0, 0, Math.sin(τ * 0.7 + bob) * 0.04);
      const p = passing(τ);
      a.position.set(side * (L * 0.78 + p * L * 0.22), 2 + Math.sin(τ * 1.1 + bob + 1) * 1.4 + p * 2.5, z0 + rel(τ));
      a.rotation.set(-0.02 * p, side * 0.03 * p, -side * (0.05 + 0.22 * p));   // il s'incline en passant
    },
    // caméra (THREE.PerspectiveCamera) : position, cible, focale
    camera(τ, a, b, cam) {
      const s = this.shotAt(τ), sh = (k) => Math.sin(τ * 23 + shakeS + k) * 0.08 + Math.sin(τ * 37 + shakeS * 2 + k) * 0.05;
      let px, py, pz, lx, ly, lz, fov;
      if (s.id === 'embarquee') {
        // derrière et au-dessus du poursuivant, le regard vers l'avant et vers celui qu'il chasse
        const ap = a.position, bp = b.position, w = 0.35 + 0.35 * smooth(0, 4.4, τ);
        px = ap.x - side * L * 0.08 + sh(1); py = ap.y + L * 0.46 + sh(2); pz = ap.z - L * 1.05;
        lx = lerp(ap.x, bp.x, w); ly = lerp(ap.y + L * 0.12, bp.y, w); lz = lerp(ap.z + L * 4, bp.z, w * 0.6);
        fov = 58;
      } else if (s.id === 'exterieur') {
        // longue focale, sur le côté du passage, la caméra file un peu moins vite : ils glissent dans le cadre
        const u = (τ - s.from) / (s.to - s.from), bp = b.position, ap = a.position;
        // trois quarts avant, sur le côté du passage : on voit les deux coques côte à côte, le poursuivant qui passe
        px = side * L * lerp(2.6, 3.1, u); py = bp.y + L * lerp(0.9, 0.6, u); pz = bp.z + L * lerp(3.4, 2.2, u);
        lx = lerp(bp.x, ap.x, 0.5); ly = (ap.y + bp.y) / 2; lz = (ap.z + bp.z) / 2 - L * 0.2;
        fov = 38;
      } else {
        // plan arrière : le nouvel ordre, a devant
        const u = (τ - s.from) / (s.to - s.from), bp = b.position, ap = a.position;
        px = bp.x - side * L * 0.4; py = bp.y + L * 0.55 + u * L * 0.2; pz = bp.z - L * (3.2 + u * 0.8);
        lx = (ap.x + bp.x) / 2; ly = (ap.y + bp.y) / 2; lz = ap.z + L;
        fov = 46;
      }
      cam.position.set(px, py, pz); cam.lookAt(lx, ly, lz); if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
      return s.id;
    },
    // bandeau : ce qui s'affiche à l'instant τ
    hud(τ) {
      const done = τ > tPass + 0.4;
      return {
        title: `Dépassement${d.where ? ' · ' + d.where : ''}`,
        racer: d.A, other: d.B, done,
        pos: done ? `P${d.rankAfter}` : `P${d.rankBefore}`, posFrom: done ? `P${d.rankBefore}` : null,
        gap: done ? { label: 'devant', value: d.gapAfter } : { label: 'derrière', value: d.gapBefore },
        integrity: d.integrity, fuel: d.fuel, lead: d.lead,
      };
    },
  };
}
