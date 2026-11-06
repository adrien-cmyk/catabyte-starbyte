// Plan 3D « dépassement » (GDD_PLANS_3D) : un moment de cinéma d'une dizaine de secondes, lisible sans commentaire :
// « Il revient sur lui… il va passer où ?… ça ne passe pas… OH SI ! ». Une action continue dans un espace cohérent :
//   1. la remontée (0–2 s)   plan arrière trois quarts du poursuivant, l'adversaire devant lui, la poussée monte ;
//   2. la feinte (2–3,5 s)   décalage latéral (impulsions des propulseurs), l'adversaire couvre, le poursuivant
//                            renonce, pique du nez puis plonge sous lui (la rotation précède le déplacement : la masse) ;
//   3. sous la coque (3,5–5,5 s)  caméra trois quarts latérale basse ; la coque adverse traverse le haut du cadre ;
//                            marge de quelques mètres, à l'échelle des modèles ; un très court ralenti au plus près ;
//   4. l'arrachement (5,5–7 s)  creux puis pleine poussée ; il ressort sous le flanc avant, côté caméra, encore désaxé,
//                            se redresse aux propulseurs (rotation et déplacement distincts) ; côte à côte, le nez
//                            passe devant, puis le cockpit, puis toute la coque ;
//   5. la place gagnée (7–10 s)  la caméra s'ouvre : le vainqueur au premier plan, moteurs tendus, l'adversaire qui
//                            recule dans la profondeur ; le classement change quand le dépassement est acquis.
// Mise en scène déterministe (hasard initialisé avec event.key) sur le résultat réel de la course : qui double qui,
// rangs avant/après, coque, carburant. Les vaisseaux sont à leurs vraies dimensions (1 unité = 1 m) ; le lecteur
// vérifie les volumes à chaque image (stage.boxOf) : aucune coque ne traverse l'autre, ni la caméra.
//   overtakeScript(event, { feed, E, racer }) → script (voir player.js : setup, rate, place, thrust, puffs, camera,
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
  const s = R() < 0.5 ? -1 : 1;                 // côté de la feinte (loin de la caméra)
  const cs = -s;                                // côté de la caméra, et de la sortie (le vainqueur vient vers nous)
  const tremble = R() * 100, marginK = 0.85 + R() * 0.35;
  const D = 10;
  // dimensions (posées par setup, à partir des modèles réels)
  let la = 30, lb = 30, wa = 5, wb = 5, ha = 3, hb = 3, S = 30, under = 8, side2 = 10, margin = 2;
  const script = {
    data: d, duration: D, side: s, giant: d.giant,
    setup(a, b) {
      la = a.userData.len; lb = b.userData.len; wa = a.userData.half.x; wb = b.userData.half.x; ha = a.userData.half.y; hb = b.userData.half.y;
      S = Math.max(la, lb);
      margin = +(Math.max(1.2, Math.min(3.2, (ha + hb) * 0.18)) * marginK).toFixed(1);   // marge sous la coque (m)
      under = hb + ha + margin;                 // écart vertical des centres au passage
      side2 = wa + wb + Math.max(2.5, S * 0.06);  // écart latéral, côte à côte
      script.margin = margin;
    },
    // très court ralenti au plus près (≈ 0,4 s de scénario à 0,35 : un peu plus d'1 s réelle)
    rate: (τ) => lerp(1, 0.35, Math.min(smooth(4.2, 4.38, τ), 1 - smooth(4.72, 4.9, τ))),

    // position et attitude de b (le doublé) et a (le poursuivant), dans le repère de b qui file vers +z
    pose(τ) {
      // b : couvre la trajectoire de la feinte (2,5–3,3 s), puis revient doucement ; secoué un instant au passage
      const bx = s * lerp(0, (wa + wb) * 0.55, smooth(2.45, 3.25, τ) * (1 - smooth(5.0, 7.5, τ)));
      const wake = bump(5.4, 6.6, τ), j = (k) => Math.sin(τ * 31 + tremble + k) * wake;
      const B = { x: bx + j(1) * 0.25, y: Math.sin(τ * 0.8) * 0.25 + j(2) * 0.3, z: 0,
        rx: j(3) * 0.008, ry: s * 0.04 * bump(2.45, 3.6, τ), rz: -s * 0.05 * bump(2.45, 3.6, τ) + j(4) * 0.012 };
      // a : le long de z, il remonte, se cale sous b, ressort devant et s'arrache
      const zBehind = -(la / 2 + lb / 2), zStart = zBehind - S * 1.25, zFeint = zBehind - S * 0.18;
      const zOut = lb / 2 - la * 0.5, zSide = lb / 2 + la / 2 + S * 0.12;   // à 5,5 s, son nez arrive au niveau du nez adverse
      let z;
      // (pendant la feinte il reste en retrait ; il n'avance sous la coque qu'une fois descendu)
      const zWait = zBehind - Math.max(2, S * 0.03);
      if (τ < 2) z = lerp(zStart, zFeint - S * 0.17, smoother(0, 2.2, τ));
      else if (τ < 3.5) z = lerp(zFeint - S * 0.17, zWait, smoother(2, 3.5, τ));
      else if (τ < 5.5) z = lerp(zWait, zOut, smooth(3.5, 5.5, τ) * 0.35 + (τ - 3.5) / 2 * 0.65);
      else if (τ < 7) z = lerp(zOut, zSide, smooth(5.5, 7.2, τ) * 0.7 + (τ - 5.5) / 1.5 * 0.3);
      else z = zSide + (τ - 7) * S * 0.35 + (τ - 7) * (τ - 7) * S * 0.28;   // il s'arrache, b recule dans la profondeur
      // latéral : léger décalage, feinte vers s, retour sous b, sortie côté caméra (cs)
      const xFeint = bx + s * (wa + wb + 1.5);
      let x = lerp(s * (wa + wb) * 0.35, xFeint, smooth(2.0, 2.85, τ));
      x = lerp(x, bx, smooth(2.9, 3.55, τ));                                       // il renonce : se recale sous b
      x = lerp(x, bx + cs * side2, smooth(5.55, 6.25, τ));                        // ressort côté caméra
      x = lerp(x, bx + cs * side2 * 0.8, smooth(7.2, 9.5, τ));
      // vertical : légèrement au-dessus, puis plonge sous b (après avoir piqué du nez), remonte côte à côte
      let y = lerp(hb * 0.15, -under, smooth(2.95, 3.38, τ));   // déjà bas quand son nez arrive sous la poupe adverse
      y = lerp(y, B.y, smooth(6.15, 6.85, τ));   // remonte une fois sorti de dessous
      // attitude : roulis de la feinte, piqué avant la plongée, désaxé à la sortie puis redressé (lacet)
      const rz = -s * 0.14 * bump(2.0, 3.05, τ) + cs * 0.1 * bump(5.5, 6.5, τ);
      const rx = 0.16 * bump(2.85, 3.5, τ) - 0.09 * bump(5.95, 6.75, τ);
      const ry = cs * 0.085 * (smooth(5.35, 5.6, τ) * (1 - smooth(5.9, 6.45, τ)));
      return { A: { x, y, z, rx, ry, rz }, B };
    },
    place(τ, a, b) {
      const p = this.pose(τ);
      b.position.set(p.B.x, p.B.y, p.B.z); b.rotation.set(p.B.rx, p.B.ry, p.B.rz);
      a.position.set(p.A.x, p.A.y, p.A.z); a.rotation.set(p.A.rx, p.A.ry, p.A.rz);
    },
    // poussée : monte pendant la remontée, retenue sous la coque, creux, puis pleine poussée
    thrust(τ) {
      let A = lerp(0.45, 1.0, smooth(0, 2.0, τ));
      A = lerp(A, 0.75, smooth(3.3, 3.8, τ));
      A = lerp(A, 0.18, smooth(5.15, 5.4, τ));                                   // le creux avant la pleine poussée
      A = lerp(A, 1.4, smooth(5.45, 5.7, τ));
      return { A, B: 0.8 };
    },
    // propulseurs de manœuvre : [vaisseau, direction (côté qui souffle), début, durée] ; souffler à gauche pousse à droite
    puffs: [
      ['a', s > 0 ? 'left' : 'right', 2.02, 0.16], ['a', s > 0 ? 'left' : 'right', 2.3, 0.1],
      ['b', s > 0 ? 'left' : 'right', 2.5, 0.2],
      ['a', s > 0 ? 'right' : 'left', 2.88, 0.14], ['a', 'up', 3.02, 0.22], ['a', 'down', 3.48, 0.12],
      ['a', cs > 0 ? 'left' : 'right', 5.55, 0.14], ['a', cs > 0 ? 'right' : 'left', 6.12, 0.12],
      ['a', 'down', 6.0, 0.2], ['a', cs > 0 ? 'right' : 'left', 6.32, 0.1],
    ],
    puffAt(τ) { const out = []; for (const [w, dir, t0, du] of this.puffs) { const k = bump(t0, t0 + du, τ); if (k > 0) out.push({ w, dir, k }); } return out; },

    // caméra : un plan continu qui accompagne a, avec une légère inertie. Chaque pose donne une DIRECTION (d'où l'on
    // regarde) et ce qu'il faut garder dans le cadre ; la distance est calculée pour que les deux silhouettes tiennent
    // dans l'écran (portrait compris), quelles que soient leurs tailles réelles.
    camPose(τ, aspect = 0.46, vfov = 44) {
      const p = this.pose(τ), A = p.A, B = p.B;
      const rA = 0.5 * Math.hypot(la, 2 * wa, 2 * ha), rB = 0.5 * Math.hypot(lb, 2 * wb, 2 * hb);
      const dAB = Math.hypot(A.x - B.x, A.y - B.y, A.z - B.z);
      const unionR = (dAB + rA + rB) / 2, uc = (k) => { const t = dAB > 1e-6 ? (unionR - rA) / dAB : 0.5; return [lerp(A.x, B.x, t), lerp(A.y, B.y, t), lerp(A.z, B.z, t)][k]; };
      const U = [uc(0), uc(1), uc(2)];
      const gap = [lerp(A.x, B.x, 0.5), (A.y + ha + B.y - hb) / 2, lerp(A.z, B.z, 0.5)];      // l'espace entre les coques
      const n3 = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
      const keys = [
        // 1–2 : arrière trois quarts et au-dessus du poursuivant, l'adversaire devant lui
        { dir: n3([cs * 0.5, 0.34, -1]), tgt: U, R: unionR, fill: 0.92, fov: 44, port: 0.85 },
        // la feinte : la caméra descend un peu, toujours derrière
        { dir: n3([cs * 0.55, 0.12, -1]), tgt: U, R: unionR, fill: 0.88, fov: 44, port: 0.85 },
        // 3 : sous la coque : trois quarts latéral et bas, un peu en arrière ; on lit les deux silhouettes et la fente
        { dir: n3([cs * 0.85, -0.42, -0.55]), tgt: gap, R: unionR, fill: 0.82, fov: 40, port: 0.85 },
        // 4 : de côté, côte à côte : le nez, puis le cockpit, puis toute la coque passent devant
        { dir: n3([cs * 1, 0.32, -0.25]), tgt: U, R: unionR, fill: 0.95, fov: 38, port: 1 },   // de côté : les coques traversent la largeur, tout doit tenir
        // 5 : devant, trois quarts : le vainqueur au premier plan, moteurs tendus, l'autre qui recule dans la profondeur
        { dir: n3([cs * 0.6, 0.24, 0.8]), tgt: [lerp(A.x, B.x, 0.12), lerp(A.y, B.y, 0.12), lerp(A.z, B.z, 0.12)], R: Math.max(rA * 1.9, Math.min(unionR * 0.75, rA * 4)), fill: 1, fov: 46, port: 1 },
      ];
      let w = [1, smooth(1.9, 2.6, τ), smooth(2.95, 3.6, τ), smooth(5.4, 6.0, τ), smooth(7.0, 7.9, τ)];
      for (let i = 1; i < w.length; i++) for (let j = 0; j < i; j++) w[j] *= 1 - w[i];
      const sum = w.reduce((x, y) => x + y, 0), dir = [0, 0, 0], tgt = [0, 0, 0]; let dist = 0, fov = 0;
      keys.forEach((k, i) => {
        const f = w[i] / sum; if (!f) return;
        const vf = k.fov * Math.PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * aspect), half = Math.min(vf, hf) / 2;
        const dk = (k.R / Math.sin(half)) * k.fill * (aspect < 1 ? k.port : 1);   // portrait : un peu plus serré quand les coques fuient en profondeur
        for (let c = 0; c < 3; c++) { dir[c] += k.dir[c] * f; tgt[c] += k.tgt[c] * f; }
        dist += dk * f; fov += k.fov * f;
      });
      const nd = n3(dir);
      return { pos: [tgt[0] + nd[0] * dist, tgt[1] + nd[1] * dist, tgt[2] + nd[2] * dist], look: tgt, fov };
    },
    camera(τ, a, b, cam) {
      const asp = cam.aspect || 0.46;
      const c = this.camPose(τ, asp), l = this.camPose(Math.max(0, τ - 0.08), asp).look;   // inertie : on regarde un peu en retard
      const thr = this.thrust(τ).A, vib = 0.03 + 0.1 * Math.max(0, thr - 0.9);        // vibrations très discrètes
      const n = (k) => (Math.sin(τ * 37 + tremble + k) * 0.6 + Math.sin(τ * 61 + tremble * 2 + k) * 0.4) * vib;
      cam.position.set(c.pos[0] + n(1), c.pos[1] + n(2), c.pos[2] + n(3)); cam.lookAt(l[0], l[1], l[2]);
      if (Math.abs(cam.fov - c.fov) > 0.01) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
      return τ < 3.3 ? 'remontee' : τ < 5.5 ? 'dessous' : τ < 7.2 ? 'arrachement' : 'place';
    },
    // après placement : contrôle des volumes (aucune interpénétration) et mesure de la marge réelle
    guard(τ, a, b, boxOf) {
      let bA = boxOf(a), bB = boxOf(b);
      if (bA.intersectsBox(bB)) {
        // sous la coque : on descend a ; ailleurs : on l'écarte sur le côté
        if (τ > 3.2 && τ < 6.2 && a.position.y < b.position.y) a.position.y -= bA.max.y - bB.min.y + 0.4;
        else { const dir = Math.sign(a.position.x - b.position.x) || cs; a.position.x += dir * (Math.min(bA.max.x, bB.max.x) - Math.max(bA.min.x, bB.min.x) + 0.4); }
        bA = boxOf(a);
      }
      const overlapZ = bA.max.z > bB.min.z && bA.min.z < bB.max.z, overlapX = bA.max.x > bB.min.x && bA.min.x < bB.max.x;
      const gapY = bB.min.y - bA.max.y;
      return { gap: overlapZ && overlapX && gapY > 0 ? gapY : null, passed: bA.min.z > bB.max.z - la * 0.02 };
    },
    hud(τ, g) {
      const crit = τ > 3.35 && τ < 6.3;                                    // passage critique : presque rien à l'écran
      const done = !!(g && g.passed) || τ > 7.6;
      return {
        title: `Dépassement${d.where ? ' · ' + d.where : ''}`, racer: d.A, other: d.B, done, hideCard: crit,
        pos: done ? `P${d.rankAfter}` : `P${d.rankBefore}`, posFrom: done ? `P${d.rankBefore}` : null,
        gap: done ? { label: 'devant', value: d.gapAfter } : { label: 'derrière', value: d.gapBefore },
        integrity: d.integrity, fuel: d.fuel, lead: d.lead,
        proximity: g && g.gap != null && τ > 3.5 && τ < 5.7 ? g.gap : null,
      };
    },
    // son : grondement de la propulsion, vibration structurelle, impulsions sèches, creux avant la pleine poussée
    audio(τ) { const t = this.thrust(τ).A; return { rumble: Math.min(1, 0.25 + t * 0.55), hz: 70 + t * 160, vib: Math.max(0, t - 0.6) * 0.6 }; },
    cues: [{ τ: 4.4, id: 'proche' }, { τ: 5.75, id: 'passe' }],
  };
  return script;
}
