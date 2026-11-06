// Plans 3D des faits de course (GDD_PLANS_3D ; règles : .claude/skills/intelligence-cinematique/SKILL.md).
// Un fait = un plan bref et concret, un seul point de vue, lisible sans commentaire, joué en temps d'écran :
//   flare    éruption       caméra immobile ; le vaisseau ralentit dans le brouillard solaire
//   failure  panne          gros plan sur les réacteurs qui crachotent, puis s'éteignent ; dérive, propulseurs
//   beltHit  choc           collé à la coque : une roche arrive, impact, éclats, la coque encaisse
//   repair   réparation     moteurs coupés, soudure sur la coque, la coque remonte
//   failed   surchauffe     en plongée : la coque rougit, braises, la poussée se coupe d'un coup
//   moon     lune           au ras du sol lunaire : il passe au-dessus de la caméra et prend de la vitesse
//   finish   arrivée        la porte d'arrivée : il la traverse, éclair, il freine
// Tout est déterministe (hasard initialisé avec event.key) et repose sur les données du fait (coque, temps perdu…).
// Contrat (lu par player.js) : { ships: [id], duration, giant, setup(ships), frame(τ, ctx) → id du plan,
//   hud(τ), audio(τ), puffs: [[i, dir, t0, durée]], cues, speed(τ) }, ctx = { ships, cam, fx, dt, THREE }.

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const bump = (a, b, x) => (x <= a || x >= b ? 0 : Math.sin(Math.PI * (x - a) / (b - a)));
function rngOf(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pct = (x) => `${Math.round(x * 100)} %`;
const mins = (s) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${String(Math.round(s % 3600 / 60)).padStart(2, '0')}` : `${Math.round(s / 60)} min`);

// ce que disent les données : rang, coque, carburant, lieu
function facts(e, { feed, E }) {
  const id = e.racer, st = feed.stateAt(id, e.t + 1), row = feed.standingsAt(e.t + 1).find((r) => r.id === id) || { rank: 0 };
  const sys = E.systems.find((s) => s.id === e.sys) || E.systems[0];
  const inLeg = ['flare', 'failure', 'beltHit', 'repair', 'belt'].includes(e.kind);
  const from = inLeg ? E.systems[Math.max(0, E.systems.findIndex((s) => s.id === e.sys) - 1)] : null;
  return { id, rank: row.rank, integrity: e.data.integrity != null ? e.data.integrity : st.integrity, fuel: st.fuel, sys,
    where: inLeg ? `${from ? from.name : ''} → ${sys.name}` : sys.name, giant: sys.giant || 'amber' };
}
// mouvement le long de z d'une vitesse v(τ) (intégrée par pas fixes : même résultat à toute fréquence d'images)
function pathOf(v, D, z0 = 0) { const N = 600, zs = new Float32Array(N + 1); let z = z0; zs[0] = z; for (let i = 1; i <= N; i++) { const t = (i - 0.5) * D / N; z += v(t) * D / N; zs[i] = z; } return (τ) => { const f = clamp01(τ / D) * N, i = Math.floor(f); return i >= N ? zs[N] : lerp(zs[i], zs[i + 1], f - i); }; }
const base = (e, f, extra) => ({ ships: [e.racer], giant: f.giant, puffs: [], cues: [], ...extra });
const card = (f, τ, title, note, opts = {}) => ({ title, racer: f.id, pos: opts.pos || (f.rank ? `P${f.rank}` : ''), note, integrity: opts.integrity != null ? opts.integrity : f.integrity, fuel: f.fuel, hideCard: !!opts.hide, done: !!opts.done });

// ── éruption : caméra immobile, le vaisseau ralentit dans le brouillard solaire ──
export function flareScript(e, ctx) {
  const f = facts(e, ctx), d = e.data, R = rngOf(e.key || 'x'), cs = R() < 0.5 ? -1 : 1;
  const fried = !d.prudent && d.lost > 0, D = 6;
  let L = 30, W = 5, Hh = 3, z, camP;
  const v = (τ) => lerp(L * 9, L * 0.9, smooth(0.6, 3.4, τ));        // il arrive vite et ralentit dans le voile
  const s = base(e, f, {
    duration: D,
    setup([a]) { L = a.userData.len; W = a.userData.half.x; Hh = a.userData.half.y;
      z = pathOf(v, D, -L * 22); camP = [cs * (W + Math.max(30, L * 1.9)), Hh * 0.8 + Math.max(5, L * 0.2), z(4.4) + L * 1.6]; },   // à l'écart : il entre entier dans le cadre
    puffs: [[0, 'front', 1.0, 0.5], [0, 'front', 1.7, 0.45], [0, 'front', 2.4, 0.35]],
    speed: () => 0,
    frame(τ, { ships: [a], cam, fx, dt }) {
      const storm = smooth(0, 1.6, τ);
      fx.wind.set(storm, cam, dt); fx.rocks(false); fx.giant(false);   // entre deux étoiles : pas de géante
      a.position.set(0, Math.sin(τ * 0.8) * 0.4, z(τ)); a.rotation.set(0, 0, Math.sin(τ * 1.3) * 0.02);
      const flick = 0.5 + 0.5 * Math.sin(τ * 17) * Math.sin(τ * 5.3);
      a.userData.heat(storm * 0.18 * (0.7 + 0.3 * flick));
      a.userData.thrust(lerp(1.0, d.prudent ? 0.12 : 0.55, smooth(0.8, 2.0, τ)) * (fried && τ > 2.6 ? (τ < 3.1 ? flick : 0) : 1), τ);
      a.userData.lights(fried ? (τ < 2.6 ? 1 : τ < 3.2 ? flick : 0.05) : 1);
      if (fried && τ > 2.6 && τ < 3.2 && Math.sin(τ * 31) > 0.7) fx.sparks.emit(a.position.clone().add({ x: 0, y: Hh, z: 0 }), 4, 6);
      cam.position.set(camP[0], camP[1], camP[2]);
      cam.lookAt(a.position.x * 0.5, a.position.y, lerp(a.position.z, camP[2] - L, 0.15));
      if (cam.fov !== 42) { cam.fov = 42; cam.updateProjectionMatrix(); }
      return 'eruption';
    },
    hud: (τ) => card(f, τ, `Éruption stellaire · ${f.where}`, fried ? `électronique grillée · −${mins(d.lost)}` : d.prudent ? `s'abrite · −${mins(d.lost)}` : `passe en force · coque ${pct(f.integrity)}`, { hide: τ > 0.8 && τ < 3.6 }),
    audio: (τ) => ({ rumble: 0.35 + 0.4 * smooth(0, 1.6, τ), hz: 90 - 40 * smooth(0.8, 2.4, τ), vib: 0.2 * smooth(0, 1.6, τ) }),
  });
  return s;
}

// ── panne : gros plan sur les réacteurs qui crachotent, puis s'éteignent ──
export function failureScript(e, ctx) {
  const f = facts(e, ctx), d = e.data, R = rngOf(e.key || 'x'), cs = R() < 0.5 ? -1 : 1, ph = R() * 10, D = 5.4;
  let L = 30, W = 5, Hh = 3, noz = [];
  const sput = (τ) => {                                                 // la poussée qui hoquette (déterministe)
    if (τ < 0.9) return 1.05;
    if (τ > 3.3) return 0;
    const g = Math.sin(τ * 23 + ph) * Math.sin(τ * 9.7 + ph * 2) + Math.sin(τ * 41);
    return g > 0.25 ? lerp(1, 0.4, smooth(0.9, 3.3, τ)) : 0.02;
  };
  return base(e, f, {
    duration: D,
    setup([a]) { L = a.userData.len; W = a.userData.half.x; Hh = a.userData.half.y; noz = a.userData.nozzles; },
    puffs: [[0, cs > 0 ? 'left' : 'right', 3.7, 0.18], [0, cs > 0 ? 'right' : 'left', 4.25, 0.15], [0, 'up', 4.0, 0.2]],
    speed: (τ) => lerp(420, 60, smooth(1.0, 4.0, τ)),
    frame(τ, { ships: [a], cam, fx, THREE }) {
      fx.rocks(true); fx.giant(false); fx.sparks.size(0.3);
      const drift = smooth(3.3, 5.4, τ);
      a.position.set(0, -drift * 1.2, -drift * L * 0.15);
      a.rotation.set(drift * 0.03, 0, cs * (0.05 * drift - 0.03 * smooth(3.7, 4.5, τ)));
      const th = sput(τ); a.userData.thrust(th, τ);
      a.userData.lights(τ < 2.2 ? 1 : τ < 3.4 ? (Math.sin(τ * 29) > 0 ? 0.9 : 0.15) : 0.25);
      // à chaque hoquet, la tuyère crache des étincelles
      if (τ > 0.9 && τ < 3.4 && th < 0.1) for (const n of noz) { const p = a.localToWorld(n.clone()); fx.sparks.emit(p, 2, 9, new THREE.Vector3(0, 0, -1)); }
      // derrière les tuyères, de trois quarts : on voit les flammes, l'extinction, le silence
      const back = Math.max(10, L * 0.42);
      cam.position.set(cs * (W * 0.85 + 3), Hh * 0.55 + 2, -L / 2 - back);
      const nc = noz.length ? noz.reduce((s2, n) => s2.add(n), new THREE.Vector3()).multiplyScalar(1 / noz.length) : new THREE.Vector3(0, 0, -L / 2);
      cam.lookAt(lerp(nc.x, 0, 0.3), nc.y, nc.z + L * 0.25 - drift * L * 0.1);
      if (cam.fov !== 46) { cam.fov = 46; cam.updateProjectionMatrix(); }
      return 'reacteurs';
    },
    hud: (τ) => card(f, τ, `Panne de propulsion · ${f.where}`, `à l'arrêt · −${mins(d.lost)}`, { hide: τ > 0.7 && τ < 3.6 }),
    audio: (τ) => { const th = sput(τ); return { rumble: 0.15 + th * 0.6, hz: 60 + th * 150, vib: th * 0.4 }; },
  });
}

// ── choc : collé à la coque, une roche arrive, impact, éclats ──
export function beltHitScript(e, ctx) {
  const f = facts(e, ctx), d = e.data, R = rngOf(e.key || 'x'), cs = R() < 0.5 ? -1 : 1, D = 4.6, TP = 1.7;
  let L = 30, W = 5, Hh = 3, hit = [0, 0, 0], camP = [0, 0, 0], rr = 2;
  const before = Math.min(1, f.integrity + (d.dmg || 0));
  return base(e, f, {
    duration: D,
    setup([a]) { L = a.userData.len; W = a.userData.half.x; Hh = a.userData.half.y;
      hit = [cs * W * 0.92, Hh * 0.25, L * (0.05 + R() * 0.15)]; rr = Math.max(0.8, Math.min(W, Hh) * 0.35);
      camP = [cs * (W + Math.max(7, L * 0.45)), Hh * 0.5 + 1, -L * 0.5 - Math.max(6, L * 0.3)]; },   // trois quarts arrière, à l'écart : la coque se lit, la roche arrive de face
    speed: () => 420,
    frame(τ, { ships: [a], cam, fx, THREE }) {
      fx.rocks(true); fx.giant(false);
      const k = τ > TP ? Math.exp(-(τ - TP) * 3) : 0, j = (n) => Math.sin(τ * 53 + n) * k;
      a.position.set(-cs * k * 0.6 + j(1) * 0.3, j(2) * 0.3, 0); a.rotation.set(j(3) * 0.03, -cs * 0.05 * k, j(4) * 0.05);
      a.userData.thrust(1.0, τ); fx.sparks.size(0.22);
      // la roche vient de l'avant, en biais, et frappe le flanc à TP
      if (τ < TP) { const u = (TP - τ); fx.rock.set(new THREE.Vector3(hit[0] + cs * u * 18, hit[1] + u * 6, hit[2] + u * 420), rr, τ * 2); }
      else fx.rock.set(null);
      if (τ >= TP && !this._hit) { this._hit = true; const p = a.localToWorld(new THREE.Vector3(...hit)); fx.sparks.emit(p, 80, 18); fx.rock.burst(p, 18, 22, rr * 0.12); }
      fx.flash.set(a.localToWorld(new THREE.Vector3(...hit)), Math.exp(-Math.pow((τ - TP) / 0.06, 2)) * 0.7, rr * 3.5);
      const sh = k * 0.35;
      cam.position.set(camP[0] + Math.sin(τ * 47) * sh, camP[1] + Math.sin(τ * 59) * sh, camP[2]);
      cam.lookAt(hit[0] * 0.7, hit[1], hit[2] + L * 0.1);
      if (cam.fov !== 50) { cam.fov = 50; cam.updateProjectionMatrix(); }
      return 'choc';
    },
    hud: (τ) => card(f, τ, `Choc dans la ceinture · ${f.where}`, τ < TP ? 'coque' : `coque ${pct(before)} → ${pct(f.integrity)}`, { integrity: τ < TP ? before : lerp(before, f.integrity, smooth(TP, TP + 0.6, τ)), hide: τ > 0.7 && τ < TP + 0.4 }),
    audio: (τ) => ({ rumble: 0.45 + (τ > TP ? Math.exp(-(τ - TP) * 2.5) * 0.5 : 0), hz: 120 + (τ > TP ? Math.exp(-(τ - TP) * 4) * 400 : 0), vib: τ > TP ? Math.exp(-(τ - TP) * 3) : 0.1 }),
    cues: [{ τ: TP, id: 'click' }],
  });
}

// ── réparation : moteurs coupés, soudure sur la coque, la coque remonte ──
export function repairScript(e, ctx) {
  const f = facts(e, ctx), d = e.data, R = rngOf(e.key || 'x'), cs = R() < 0.5 ? -1 : 1, D = 5.2;
  let L = 30, W = 5, Hh = 3, spot = [0, 0, 0];
  const after = f.integrity, before = Math.max(0.3, after - (d.gain || 0.15));
  return base(e, f, {
    duration: D,
    setup([a]) { L = a.userData.len; W = a.userData.half.x; Hh = a.userData.half.y; spot = [cs * W * 0.95, Hh * 0.45, L * (R() * 0.3 - 0.1)]; },
    puffs: [[0, 'up', 0.6, 0.12], [0, cs > 0 ? 'left' : 'right', 2.2, 0.1], [0, 'down', 3.6, 0.12]],
    speed: () => 25,
    frame(τ, { ships: [a], cam, fx, THREE }) {
      fx.rocks(true); fx.giant(false); fx.sparks.size(0.18);
      a.position.set(0, Math.sin(τ * 0.6) * 0.3, 0); a.rotation.set(0, Math.sin(τ * 0.4) * 0.01, Math.sin(τ * 0.5) * 0.015);
      a.userData.thrust(0.04, τ); a.userData.lights(0.6);
      const weld = Math.sin(τ * 37) * Math.sin(τ * 13.1) > 0.15 && τ > 0.4 && τ < 4.6;
      const p = a.localToWorld(new THREE.Vector3(...spot));
      if (weld) fx.sparks.emit(p, 3, 7, new THREE.Vector3(cs, 0.5, 0), 0xbfe0ff);
      fx.flash.set(p, weld ? 0.85 : 0, Math.max(1.2, W * 0.35), 0xcfe6ff);
      cam.position.set(cs * (W + Math.max(4, L * 0.16)), Hh * 0.9 + 2, spot[2] - Math.max(6, L * 0.25));
      cam.lookAt(spot[0], spot[1], spot[2] + 2);
      if (cam.fov !== 44) { cam.fov = 44; cam.updateProjectionMatrix(); }
      return 'soudure';
    },
    hud: (τ) => card(f, τ, `Arrêt réparation · ${f.where}`, `−${mins(d.lost || 0)} · coque ${pct(lerp(before, after, smooth(0.5, 4.5, τ)))}`, { integrity: lerp(before, after, smooth(0.5, 4.5, τ)) }),
    audio: (τ) => ({ rumble: 0.1, hz: 50, vib: 0 }),
  });
}

// ── surchauffe : en plongée, la coque rougit, braises, la poussée se coupe ──
export function overheatScript(e, ctx) {
  const f = facts(e, ctx), R = rngOf(e.key || 'x'), cs = R() < 0.5 ? -1 : 1, D = 5, TC = 2.7;
  let L = 30, W = 5, Hh = 3;
  return base(e, f, {
    duration: D,
    setup([a]) { L = a.userData.len; W = a.userData.half.x; Hh = a.userData.half.y; },
    speed: (τ) => (τ < TC ? 520 : 380),
    frame(τ, { ships: [a], cam, fx, THREE }) {
      fx.rocks(false);
      const heat = smooth(0, TC, τ) * (1 - 0.35 * smooth(TC + 0.5, D, τ)), cut = τ > TC;
      const j = (n) => Math.sin(τ * 41 + n) * 0.15 * heat;
      a.position.set(j(1), j(2), 0); a.rotation.set(j(3) * 0.1, 0, cs * 0.04 + j(4) * 0.08);
      a.userData.heat(heat); a.userData.thrust(cut ? (τ < TC + 0.15 ? 0.6 : 0.05) : 1.3, τ);
      a.userData.lights(cut && τ < TC + 0.8 ? (Math.sin(τ * 33) > 0 ? 1 : 0.1) : 1);
      // braises arrachées au nez et aux bords d'attaque
      if (Math.sin(τ * 47) > 0.2) fx.sparks.emit(a.localToWorld(new THREE.Vector3(cs * W * 0.6 * Math.sin(τ * 7), Hh * 0.5, L * 0.45)), Math.round(2 + heat * 4), 14, new THREE.Vector3(0, 0, -3), 0xff7a30);
      fx.flash.set(a.localToWorld(new THREE.Vector3(0, 0, -L * 0.5)), Math.exp(-Math.pow((τ - TC) / 0.07, 2)) * 0.7, Math.max(W, 6) * 2.5, 0xffb070);
      // devant, de trois quarts : la coque qui rougit, la géante tout près derrière
      cam.position.set(cs * (W + L * 0.55), Hh + L * 0.12, L * 0.75);
      cam.lookAt(0, 0, -L * 0.05);
      if (cam.fov !== 44) { cam.fov = 44; cam.updateProjectionMatrix(); }
      return 'surchauffe';
    },
    hud: (τ) => card(f, τ, `Surchauffe · ${f.where}`, τ < TC ? 'température critique' : 'poussée coupée', { hide: τ > 0.8 && τ < TC + 0.6 }),
    audio: (τ) => (τ < TC ? { rumble: 0.6 + 0.3 * smooth(0, TC, τ), hz: 140 + 120 * smooth(0, TC, τ), vib: 0.5 * smooth(0, TC, τ) } : { rumble: 0.15, hz: 60, vib: 0 }),
  });
}

// ── lune : au ras du sol lunaire, il passe au-dessus de la caméra et prend de la vitesse ──
export function moonScript(e, ctx) {
  const f = facts(e, ctx), d = e.data, R = rngOf(e.key || 'x'), cs = R() < 0.5 ? -1 : 1, D = 5.2, TP = 2.4;
  let L = 30, W = 5, Hh = 3, Rm = 4000, clear = 30, z;
  const v = (τ) => lerp(L * 7, L * 12, smooth(TP - 0.3, D, τ));      // il prend de la vitesse en passant (l'assistance)
  return base(e, f, {
    duration: D, giant: f.giant,
    setup([a]) { L = a.userData.len; W = a.userData.half.x; Hh = a.userData.half.y; Rm = Math.max(2500, L * 120); clear = Math.max(12, L * 0.5);
      // la position à TP est 0 : on intègre depuis le début
      const zp = pathOf(v, D, 0), z0 = zp(TP); z = (τ) => zp(τ) - z0; },
    speed: () => 0,
    frame(τ, { ships: [a], cam, fx, THREE }) {
      fx.rocks(false); fx.moon.set(new THREE.Vector3(0, -Rm - Hh - clear, 0), Rm);
      const zz = z(τ), y = Math.sqrt(Math.max(0, (Rm + Hh + clear) ** 2 - zz * zz)) - Rm - Hh - clear + 0;   // il suit la courbure
      a.position.set(0, y, zz); a.rotation.set(Math.atan2(zz, Rm) * 1, 0, 0);
      a.userData.thrust(lerp(0.8, 1.3, smooth(TP - 0.4, TP + 0.4, τ)), τ);
      // caméra posée au sol, à côté de la trajectoire, un peu devant le point le plus bas : il passe au-dessus d'elle
      cam.position.set(cs * (W + Math.max(10, L * 0.5)), -Hh - clear + 3, Math.max(20, L * 0.8));
      cam.lookAt(a.position.x * 0.4, a.position.y, a.position.z);
      if (cam.fov !== 50) { cam.fov = 50; cam.updateProjectionMatrix(); }
      return 'lune';
    },
    hud: (τ) => card(f, τ, `Assistance de ${d.moon || 'la lune'} · ${f.where}`, `+${d.gain || 0} m/s${d.dmg ? ' · débris' : ''}`, { hide: τ > 1.2 && τ < TP + 0.8 }),
    audio: (τ) => ({ rumble: 0.3 + 0.6 * bump(TP - 1, TP + 1, τ), hz: 80 + 200 * bump(TP - 0.8, TP + 0.8, τ), vib: 0.6 * bump(TP - 0.5, TP + 0.5, τ) }),
    cues: [{ τ: TP, id: 'click' }],
  });
}

// ── arrivée : il traverse la porte, éclair, il freine ──
export function finishScript(e, ctx) {
  const f = facts(e, ctx), d = e.data, R = rngOf(e.key || 'x'), cs = R() < 0.5 ? -1 : 1, D = 5.6, TP = 2.2;
  let L = 30, W = 5, Hh = 3, z, gateR = 20;
  const v = (τ) => (τ < TP ? L * 10 : lerp(L * 10, L * 1.2, smooth(TP, TP + 1.6, τ)));
  const first = ctx.feed.standingsAt(e.t + 1)[0], place = d.place || f.rank;
  return base(e, f, {
    duration: D,
    setup([a]) { L = a.userData.len; W = a.userData.half.x; Hh = a.userData.half.y; gateR = Math.max(W, Hh) * 2.6 + 6;
      const zp = pathOf(v, D, 0), z0 = zp(TP); z = (τ) => zp(τ) - z0; },
    puffs: [[0, 'front', TP + 0.3, 0.5], [0, 'front', TP + 0.9, 0.4]],
    speed: () => 0,
    frame(τ, { ships: [a], cam, fx, THREE }) {
      fx.rocks(false);
      fx.gate.set(new THREE.Vector3(0, 0, 0), gateR, 1 + Math.exp(-Math.pow((τ - TP) / 0.15, 2)));
      a.position.set(0, 0, z(τ)); a.rotation.set(0, 0, 0);
      a.userData.thrust(τ < TP ? 1.3 : 0.25, τ);
      fx.flash.set(new THREE.Vector3(0, 0, 0), Math.exp(-Math.pow((τ - TP) / 0.1, 2)) * 0.9, gateR * 2.2, 0xffe0a0);
      if (τ > TP && !this._sp) { this._sp = true; for (let i = 0; i < 6; i++) fx.sparks.emit(new THREE.Vector3(Math.cos(i) * gateR, Math.sin(i) * gateR, 0), 15, 18, null, 0xffd27a); }
      // loin derrière la porte, de trois quarts : il la traverse, arrive vers nous et freine devant la caméra
      const zc = z(D) + Math.max(L * 1.6, 25);
      cam.position.set(cs * (gateR * 0.9 + W), gateR * 0.25, zc);
      cam.lookAt(0, 0, lerp(0, a.position.z, 0.75));
      if (cam.fov !== 48) { cam.fov = 48; cam.updateProjectionMatrix(); }
      return 'arrivee';
    },
    hud: (τ) => card(f, τ, `Arrivée · ${f.sys.name}`, τ < TP ? 'la porte d\'arrivée' : place === 1 ? 'vainqueur de la Grande Fronde' : `${place}e · à ${mins(Math.max(0, e.t - (ctx.feed.tracks[first.id] || { finish: e.t }).finish))} du vainqueur`,
      { hide: τ > 1.0 && τ < TP + 0.3, done: τ >= TP, pos: `P${place}` }),
    audio: (τ) => ({ rumble: τ < TP ? 0.7 : 0.2, hz: τ < TP ? 220 : 70, vib: τ < TP ? 0.4 : 0 }),
    cues: [{ τ: TP, id: 'click' }],
  });
}

export const SCRIPTS = { flare: flareScript, failure: failureScript, beltHit: beltHitScript, repair: repairScript, failed: overheatScript, moon: moonScript, finish: finishScript };
