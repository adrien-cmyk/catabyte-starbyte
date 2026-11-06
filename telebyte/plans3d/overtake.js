// Plan 3D « dépassement » (GDD_PLANS_3D, étape 2) : un dépassement « blast ». Le poursuivant surgit à une vitesse
// folle et frôle la coque de l'autre à quelques mètres ; le ralenti est fait pour ÇA : la caméra dans la fente entre
// les deux coques, l'écart affiché en mètres, « regardez comme cette course est dangereuse ». Puis le sillage secoue
// le vaisseau doublé et le poursuivant file jusqu'à n'être plus qu'un point.
// Fonction pure : un fait `overtake` de la chronologie et le flux → une séquence d'environ 11 s en temps d'écran,
// toujours la même pour le même fait (hasard initialisé avec event.key). Le dépassement est MIS EN SCÈNE (dans les
// données, c'est un ordre de passage à un point de contrôle ; les vaisseaux y sont à des milliers de km).
//   overtakeScript(event, { feed, E, racer }) →
//     { data, duration, rate(τ), shotAt(τ), place(τ, a, b), camera(τ, a, b, cam), fx(τ, a, b), hud(τ), cues }
// Repère : les deux vaisseaux filent vers +z ; b (le doublé) sur l'axe, a (le poursuivant) le frôle sur le côté `side`.

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
function rngOf(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ce que disent les données au moment du dépassement
export function overtakeData(e, { feed, E }) {
  const A = e.racer, B = (e.data.passed || [])[0];
  const before = feed.standingsAt(e.t - 0.5), after = feed.standingsAt(e.t + 0.5);
  const ra = (rows, id) => rows.find((r) => r.id === id) || { rank: 0, gap: 0 };
  const cp = feed.tracks[A].cps.find((c) => Math.abs(c.t - e.t) < 0.5);
  const st = feed.stateAt(A, e.t);
  const sys = E.systems.find((s) => s.id === (cp ? cp.sys : st.system));
  return {
    A, B, rankBefore: ra(before, A).rank, rankAfter: ra(after, A).rank, lead: !!e.data.lead,
    gapBefore: Math.max(0, ra(before, A).gap - ra(before, B).gap), gapAfter: Math.max(0, ra(after, B).gap - ra(after, A).gap),
    where: cp ? cp.label : sys ? sys.name : '', integrity: st.integrity, fuel: st.fuel,
  };
}

export function overtakeScript(e, ctx) {
  const d = overtakeData(e, ctx), R = rngOf(e.key || 'x');
  const side = R() < 0.5 ? -1 : 1, bob = R() * 6.28, shakeS = R() * 100;
  const clearance = +(1.6 + R() * 2.6).toFixed(1);               // mètres entre les coques (1 unité = 1 m à l'écran)
  const L = 30, V = 420, CLOSE = 420;                              // longueur, vitesse d'écran, vitesse d'approche (unités/s)
  const TP = 3.05, D = 8.4;                                        // instant du passage, durée (temps du scénario)
  // position de a par rapport à b le long de z : surgit de loin, frôle, puis s'arrache (accélération après le passage)
  const rel = (τ) => CLOSE * (τ - TP) + (τ > TP ? 160 * (τ - TP) * (τ - TP) : 0);
  const shots = [
    { id: 'approche', from: 0, to: 2.62 },
    { id: 'fente', from: 2.62, to: 3.5 },
    { id: 'sillage', from: 3.5, to: 6.0 },
    { id: 'face', from: 6.0, to: D },
  ];
  let wA = 4, wB = 4, hA = 2;                                       // demi-largeurs (posées au premier placement)
  const latOf = () => side * (wA + wB + clearance);
  return {
    data: d, duration: D, side, clearance, shots,
    // ralenti quasi figé au plus près (≈ 4 s réelles pour 0,26 s de scénario), entrée et sortie progressives
    rate(τ) {
      const k = Math.min(smooth(2.78, 2.96, τ), 1 - smooth(3.2, 3.36, τ));
      return lerp(1, 0.065, k);
    },
    shotAt: (τ) => shots.find((s) => τ >= s.from && τ < s.to) || shots[shots.length - 1],
    cues: [{ τ: 2.9, id: 'proche' }],
    place(τ, a, b) {
      if (a.userData.half) { wA = a.userData.half.x; hA = a.userData.half.y; } if (b.userData.half) wB = b.userData.half.x;
      const z0 = V * τ;
      // le sillage : b secoué juste après le passage, de plus en plus faiblement
      const w = τ > TP ? Math.exp(-(τ - TP) * 2.4) : 0, j = (k) => Math.sin(τ * 47 + k) * w;
      b.position.set(j(1) * 0.9, Math.sin(τ * 0.9 + bob) * 0.6 + j(2) * 0.7, z0);
      b.rotation.set(j(3) * 0.05, j(4) * 0.03, Math.sin(τ * 0.7 + bob) * 0.03 + j(5) * 0.09 - side * 0.12 * w);
      // a : sur sa trajectoire de passage, à `clearance` mètres de la coque de b au plus près
      const near = Math.exp(-Math.pow(rel(τ) / (L * 1.6), 2));
      a.position.set(latOf() + side * (1 - near) * L * 0.25, hA * 0.25 + Math.sin(τ * 1.3 + bob) * 0.3, z0 + rel(τ));
      a.rotation.set(0, side * 0.015 * near, -side * 0.08 * near);
    },
    camera(τ, a, b, cam) {
      const s = this.shotAt(τ), ap = a.position, bp = b.position;
      const shake = τ > TP && τ < TP + 1.6 ? Math.exp(-(τ - TP) * 2.2) * 0.9 : 0;
      const sh = (k) => (Math.sin(τ * 31 + shakeS + k) * 0.6 + Math.sin(τ * 53 + shakeS * 2 + k) * 0.4) * (0.08 + shake);
      let px, py, pz, lx, ly, lz, fov;
      if (s.id === 'approche') {
        // de face, trois quarts : b vient vers nous, derrière lui une lueur qui grossit à toute vitesse
        const u = (τ - s.from) / (s.to - s.from);
        px = bp.x + side * L * lerp(0.75, 0.55, u) + sh(1); py = bp.y + L * 0.28 + sh(2); pz = bp.z + L * lerp(2.6, 2.0, u);
        lx = bp.x + side * L * 0.25; ly = bp.y; lz = bp.z - L * 1.2; fov = 48;
      } else if (s.id === 'fente') {
        // dans la fente : entre les deux coques, juste devant le point de passage, regard vers l'arrière le long de la fente
        const gx = side * (wB + clearance * 0.5);
        px = bp.x + gx + sh(1) * 0.3; py = bp.y + hA * 0.25 + 0.9 + sh(2) * 0.3; pz = bp.z + L * 0.62;
        lx = bp.x + gx; ly = bp.y + hA * 0.2; lz = bp.z - L * 0.6; fov = 74;
      } else if (s.id === 'sillage') {
        // sur le côté de b, secoué par le sillage : a s'arrache et devient un point dans son panache
        px = bp.x - side * L * 0.9 + sh(1); py = bp.y + L * 0.4 + sh(2); pz = bp.z - L * 1.6 + sh(3);
        lx = lerp(bp.x, ap.x, 0.55); ly = lerp(bp.y, ap.y, 0.55); lz = Math.min(ap.z, bp.z + L * 5); fov = 56;   // b reste au premier plan
      } else {
        // de face sur a, qui fonce vers la caméra : le nouveau rang
        const u = (τ - s.from) / (s.to - s.from);
        px = ap.x + side * L * 0.45; py = ap.y + L * 0.18; pz = ap.z + L * lerp(2.2, 1.6, u);
        lx = ap.x; ly = ap.y; lz = ap.z; fov = 46;
      }
      cam.position.set(px, py, pz); cam.lookAt(lx, ly, lz); if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
      return s.id;
    },
    // effets : éclair et étincelles au plus près, point de contact (entre les coques), vitesse ressentie
    fx(τ, a, b) {
      const near = Math.exp(-Math.pow(rel(τ) / (L * 0.9), 2));
      return {
        flash: Math.exp(-Math.pow((τ - TP) / 0.06, 2)) * 0.9, sparks: near * (τ > 2.7 && τ < 3.6 ? 1 : 0),
        at: [b.position.x + side * (wB + clearance * 0.5), b.position.y + hA * 0.2, b.position.z + Math.max(-L * 0.4, Math.min(L * 0.4, rel(τ)))],
        speed: (this.shotAt(τ).id === 'fente' ? 0.35 : 1) * V * this.rate(τ),
        bow: smooth(0.1, 2.7, τ) * (1 - smooth(2.9, 3.1, τ)),          // la lueur de a qui arrive
      };
    },
    hud(τ) {
      const done = τ > TP + 0.15, slow = this.rate(τ) < 0.5;
      return {
        title: `Dépassement${d.where ? ' · ' + d.where : ''}`,
        racer: d.A, other: d.B, done,
        pos: done ? `P${d.rankAfter}` : `P${d.rankBefore}`, posFrom: done ? `P${d.rankBefore}` : null,
        gap: done ? { label: 'devant', value: d.gapAfter } : { label: 'derrière', value: d.gapBefore },
        integrity: d.integrity, fuel: d.fuel, lead: d.lead,
        callout: slow ? { value: `${String(clearance).replace('.', ',')} m`, label: 'entre les coques' } : null,
      };
    },
  };
}
