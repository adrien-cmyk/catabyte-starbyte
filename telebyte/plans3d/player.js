// Lecteur des plans 3D du Télébyte (GDD_PLANS_3D). Un seul lecteur, une seule scène, un seul plan à la fois : une
// toile plein écran par-dessus le schéma, un bandeau (nom, position, écart, coque, carburant), un bouton « Passer ».
// Le plan se joue en temps d'écran (8 à 12 s), quelle que soit la vitesse de la course.
//   const p3d = createPlayer({ racer, dur })
//   await p3d.play(script)     → résolu à la fin (ou au « Passer ») ; false si la 3D n'est pas disponible
//   p3d.playing, p3d.state (essais : τ, plan, images/s), p3d.seek(τ) (essais : image figée)
import { THREE } from '../../sandbox/lib/sb3d-shim.js';
import { svg } from '../icons.js';
import { names } from '../narrator.js';

const CSS = `
#p3d { position: fixed; inset: 0; z-index: 43; background: #020308; opacity: 0; transition: opacity .45s; }
#p3d.on { opacity: 1; } #p3d[hidden] { display: none; }
#p3d canvas { display: block; width: 100%; height: 100%; }
#p3d .p3-bar { position: absolute; left: max(14px, env(safe-area-inset-left)); right: max(14px, env(safe-area-inset-right)); bottom: calc(env(safe-area-inset-bottom) + 18px); display: grid; gap: 6px; pointer-events: none; }
#p3d .p3-title { font: 700 10px 'Space Grotesk', system-ui, sans-serif; letter-spacing: .22em; text-transform: uppercase; color: #ffd27a; }
#p3d .p3-card { display: grid; grid-template-columns: 6px auto 1fr auto; gap: 4px 10px; align-items: center; background: rgba(4, 7, 12, .78); border: 1px solid rgba(200, 214, 224, .16); border-radius: 10px; padding: 9px 12px; backdrop-filter: blur(6px); }
#p3d .p3-card i { grid-row: 1 / 3; width: 6px; height: 100%; border-radius: 3px; background: var(--livery); }
#p3d .p3-pos { grid-row: 1 / 3; font: 700 22px 'JetBrains Mono', ui-monospace, monospace; color: #fff; min-width: 2.4em; }
#p3d .p3-pos small { display: block; font-size: 10px; font-weight: 600; color: #8b9aa6; } #p3d .p3-pos.up { color: #7fe08a; }
#p3d .p3-name { font: 700 15px 'Space Grotesk', system-ui, sans-serif; color: #e6eef3; }
#p3d .p3-gap { font: 600 12px 'JetBrains Mono', ui-monospace, monospace; color: #e6eef3; text-align: right; }
#p3d .p3-gap small.note { font: 600 12px 'Space Grotesk', system-ui, sans-serif; color: #ffd27a; text-align: right; }
#p3d .p3-gap small { display: block; font: 500 10px 'Space Grotesk', system-ui, sans-serif; color: #8b9aa6; }
#p3d .p3-tele { grid-column: 3 / 5; display: flex; flex-wrap: wrap; gap: 4px 14px; white-space: nowrap; font: 10px 'JetBrains Mono', ui-monospace, monospace; color: #8b9aa6; }
#p3d .p3-tele span { display: flex; align-items: center; gap: 6px; } #p3d .p3-tele u { display: block; width: 56px; height: 4px; border-radius: 2px; background: rgba(255,255,255,.12); overflow: hidden; } #p3d .p3-tele u b { display: block; height: 100%; background: var(--c, #e6eef3); }
#p3d .p3-skip { position: absolute; top: calc(env(safe-area-inset-top) + 14px); right: max(14px, env(safe-area-inset-right)); display: flex; align-items: center; gap: 6px; font: 600 12px 'Space Grotesk', system-ui, sans-serif; color: #9fd4ec; background: rgba(4, 7, 12, .7); border: 1px solid rgba(159, 212, 236, .4); border-radius: 999px; padding: 7px 12px; cursor: pointer; }
#p3d .p3-skip svg { width: 14px; height: 14px; }
#p3d .p3-tag { position: absolute; top: calc(env(safe-area-inset-top) + 18px); left: max(14px, env(safe-area-inset-left)); font: 700 10px 'Space Grotesk', system-ui, sans-serif; letter-spacing: .2em; text-transform: uppercase; color: #e6eef3; display: flex; align-items: center; gap: 7px; }
#p3d .p3-tag::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: #ff5a4f; }
#p3d .p3-slow { position: absolute; top: calc(env(safe-area-inset-top) + 44px); left: max(14px, env(safe-area-inset-left)); font: 700 10px 'Space Grotesk', system-ui, sans-serif; letter-spacing: .2em; text-transform: uppercase; color: #05080c; background: #ffd27a; border-radius: 4px; padding: 3px 7px; }
#p3d .p3-slow[hidden] { display: none; }
#p3d .p3-call { position: absolute; left: 50%; top: 22%; translate: -50% 0; text-align: center; pointer-events: none; transition: opacity .2s; }
#p3d .p3-call[hidden] { display: none; }
#p3d .p3-card { transition: opacity .35s, transform .35s; } #p3d .p3-card.dim { opacity: 0; transform: translateY(10px); }
#p3d .p3-prox { position: absolute; left: 50%; bottom: calc(env(safe-area-inset-bottom) + 22px); translate: -50% 0; font: 600 12px 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .06em; color: #ff8a6a; background: rgba(4, 7, 12, .55); border: 1px solid rgba(255, 138, 106, .35); border-radius: 999px; padding: 4px 10px; }
#p3d .p3-prox[hidden] { display: none; }
#p3d .p3-call b { display: block; font: 700 54px/1 'JetBrains Mono', ui-monospace, monospace; color: #fff; text-shadow: 0 0 18px rgba(255, 90, 79, .65), 0 2px 4px #000; letter-spacing: -.02em; }
#p3d .p3-call span { display: block; margin-top: 6px; font: 700 11px 'Space Grotesk', system-ui, sans-serif; letter-spacing: .24em; text-transform: uppercase; color: #ff8a6a; text-shadow: 0 1px 3px #000; }
`;
const fmtGap = (s, dur) => (s < 1 ? 'au contact' : dur(s));

export function createPlayer({ racer, dur }) {
  let el = null, stage = null, cam = null, ships = {}, raf = 0, P = { playing: false, state: {} };
  async function ensure() {
    if (stage) return true;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    el = document.createElement('div'); el.id = 'p3d'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Plan 3D');
    el.innerHTML = `<canvas></canvas><span class="p3-tag">Revoir</span><span class="p3-slow" hidden>Ralenti</span><div class="p3-call" hidden><b></b><span></span></div><span class="p3-prox" hidden></span>
      <button type="button" class="p3-skip">${svg('play')} Passer</button>
      <div class="p3-bar"><b class="p3-title"></b><div class="p3-card"><i></i><span class="p3-pos"></span><span class="p3-name"></span><span class="p3-gap"></span><span class="p3-tele"></span></div></div>`;
    document.body.appendChild(el);
    try {
      const { createStage } = await import('./stage.js');
      stage = await createStage(el.querySelector('canvas'));
    } catch (e) { console.warn('[plans 3D] indisponible', e); el.remove(); el = null; return false; }
    cam = new THREE.PerspectiveCamera(60, 1, 0.5, 12000);
    addEventListener('resize', () => { if (P.playing) size(); });
    return true;
  }
  const size = () => { const w = innerWidth, h = innerHeight; stage.resize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  async function shipOf(id) {
    if (!ships[id]) ships[id] = await stage.ship(id);
    return ships[id];
  }
  function hud(h) {
    const R = racer[h.racer], q = (s) => el.querySelector(s);
    q('.p3-card').classList.toggle('dim', !!h.hideCard);
    const px = q('.p3-prox'); px.hidden = h.proximity == null; if (h.proximity != null) px.textContent = `marge ${h.proximity.toFixed(1).replace('.', ',')} m`;
    const px0 = q('.p3-prox'); if (h.proximity === undefined) px0.hidden = true;
    const c = q('.p3-call'); c.hidden = !h.callout; if (h.callout) { c.querySelector('b').textContent = h.callout.value; c.querySelector('span').textContent = h.callout.label; }
    q('.p3-title').textContent = h.title;
    q('.p3-card').style.setProperty('--livery', R.livery);
    const pos = q('.p3-pos'); pos.innerHTML = h.pos ? `${h.pos}${h.posFrom ? `<small>${h.posFrom} → ${h.pos}</small>` : '<small>position</small>'}` : ''; pos.classList.toggle('up', !!h.done && !!h.posFrom);
    q('.p3-name').textContent = R.name;
    q('.p3-gap').innerHTML = h.gap ? `${fmtGap(h.gap.value, dur)}<small>${h.gap.label}${racer[h.other] ? ' ' + names(racer[h.other]).le : ''}</small>` : `<small class="note">${h.note || ''}</small>`;
    const bar = (v, c) => `<u style="--c:${c}"><b style="width:${Math.round(v * 100)}%"></b></u>`;
    q('.p3-tele').innerHTML = `<span>coque ${bar(h.integrity, h.integrity < 0.6 ? '#ff8a6a' : '#e6eef3')} ${Math.round(h.integrity * 100)} %</span><span>carburant ${bar(h.fuel, '#ffd27a')} ${Math.round(h.fuel * 100)} %</span>`;
  }

  // son (Web Audio, si un contexte a été ouvert par le geste du joueur) : grondement, vibration, impulsions sèches
  function makeAudio(ac) {
    if (!ac) return null;
    try {
      const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), ch = buf.getChannelData(0);
      let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; ch[i] = last * 3.5; }   // bruit brun
      const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 120;
      const g = ac.createGain(); g.gain.value = 0; src.connect(lp).connect(g).connect(ac.destination);
      const osc = ac.createOscillator(); osc.frequency.value = 34; const og = ac.createGain(); og.gain.value = 0; osc.connect(og).connect(ac.destination);
      src.start(); osc.start();
      const white = ac.createBuffer(1, ac.sampleRate * 0.12, ac.sampleRate); { const w = white.getChannelData(0); for (let i = 0; i < w.length; i++) w[i] = (Math.random() * 2 - 1) * (1 - i / w.length); }
      return {
        set(a) { const t = ac.currentTime; g.gain.setTargetAtTime(a.rumble * 0.5, t, 0.05); lp.frequency.setTargetAtTime(a.hz, t, 0.08); og.gain.setTargetAtTime(a.vib * 0.25, t, 0.05); },
        click() { const s2 = ac.createBufferSource(); s2.buffer = white; const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.9; const g2 = ac.createGain(); g2.gain.value = 0.35; s2.connect(bp).connect(g2).connect(ac.destination); s2.start(); },
        stop() { const t = ac.currentTime; g.gain.setTargetAtTime(0, t, 0.15); og.gain.setTargetAtTime(0, t, 0.1); setTimeout(() => { try { src.stop(); osc.stop(); } catch (e) {} }, 900); },
      };
    } catch (e) { return null; }
  }

  // joue un scénario ; opts.freeze (essais) : image figée à τ donné ; opts.onCue : moments clés ; opts.audio : AudioContext
  P.play = async (script, opts = {}) => (script.frame ? playGeneric(script, opts) : playPair(script, opts));
  // plan à un (ou plusieurs) vaisseaux : le scénario décide de tout (events.js)
  async function playGeneric(script, { freeze = null, onCue = null, audio = null } = {}) {
    if (P.playing) return false;
    if (!(await ensure())) return false;
    P.playing = true;
    const ships = []; for (const id of script.ships) ships.push(await shipOf(id));
    stage.fx.reset(); if (script.giant) stage.setGiant(script.giant);
    if (script.setup) script.setup(ships);
    stage.scene.add(...ships);
    el.hidden = false; size(); void el.offsetWidth; el.classList.add('on');
    const snd = freeze == null ? makeAudio(audio) : null;
    let τ = 0, last = performance.now(), skip = false, frames = 0, fpsT = 0, pr = Math.min(devicePixelRatio || 1, 2), lastHud = '', puffOn = new Set();
    const onSkip = () => { skip = true; };
    el.querySelector('.p3-skip').onclick = onSkip; el.onclick = (e) => { if (!e.target.closest('.p3-skip')) onSkip(); };
    const v = new THREE.Vector3();
    await new Promise((done) => {
      const frame = (now) => {
        const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
        const τ0 = τ; if (freeze != null) τ = freeze; else τ += dt;
        if (script.cues) for (const c of script.cues) if (τ0 < c.τ && τ >= c.τ) { if (c.id === 'click' && snd) snd.click(); if (onCue) onCue(c, script); }
        for (const s2 of ships) { s2.userData.clearPuffs(); s2.userData.lights(1); s2.userData.heat(0); }
        const pf = []; for (const [i, dir, t0, du] of script.puffs || []) { const k = τ <= t0 || τ >= t0 + du ? 0 : Math.sin(Math.PI * (τ - t0) / du); if (k > 0) { pf.push(i + dir); ships[i].userData.puff(dir, k); } }
        const shot = script.frame(τ, { ships, cam, fx: stage.fx, dt: freeze != null ? 1 / 60 : dt, THREE });
        if (snd) { for (const k of pf) if (!puffOn.has(k)) snd.click(); puffOn = new Set(pf); snd.set(script.audio(τ)); }
        // la caméra n'entre jamais dans une coque
        for (const s2 of ships) { const bx = stage.boxOf(s2).expandByScalar(1.5); if (bx.containsPoint(cam.position)) { const c = bx.getCenter(v); const out = cam.position.clone().sub(c); const h = bx.getSize(new THREE.Vector3()).multiplyScalar(0.5);
          const k = ['x', 'y', 'z'].map((ax) => h[ax] - Math.abs(out[ax])); const ax = ['x', 'y', 'z'][k.indexOf(Math.min(...k))]; cam.position[ax] = c[ax] + Math.sign(out[ax] || 1) * h[ax]; } }
        stage.render(cam, { speed: script.speed ? script.speed(τ) : 0, dt: freeze != null ? 1 / 60 : dt, avoid: ships.map((s2) => stage.boxOf(s2).expandByScalar(4)) });
        const h = script.hud(τ), sig = JSON.stringify(h);
        if (sig !== lastHud) { lastHud = sig; hud(h); }
        el.querySelector('.p3-slow').hidden = true;
        frames++; fpsT += dt; if (fpsT > 1) { const fps = frames / fpsT; P.state.fps = Math.round(fps); frames = 0; fpsT = 0; if (fps < 50 && pr > 1) { pr = Math.max(1, pr - 0.5); stage.setPixelRatio(pr); size(); } }
        P.state.τ = τ; P.state.shot = shot;
        if (freeze == null && (skip || τ >= script.duration)) return done();
        if (freeze != null && skip) return done();
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    });
    if (snd) snd.stop();
    el.classList.remove('on');
    await new Promise((r) => setTimeout(r, 450));
    el.hidden = true; for (const s2 of ships) { stage.scene.remove(s2); s2.userData.heat(0); s2.userData.lights(1); } stage.fx.reset(); P.playing = false;
    return true;
  }
  // le dépassement (deux vaisseaux, contrat d'origine)
  async function playPair(script, { freeze = null, onCue = null, audio = null } = {}) {
    if (P.playing) return false;
    if (!(await ensure())) return false;
    P.playing = true;
    stage.fx.reset();
    const d = script.data, a = await shipOf(d.A), b = await shipOf(d.B);
    if (stage.setGiant && script.giant) stage.setGiant(script.giant);
    if (script.setup) script.setup(a, b);
    stage.scene.add(a, b);
    el.hidden = false; size(); void el.offsetWidth; el.classList.add('on');
    const snd = freeze == null ? makeAudio(audio) : null;
    let τ = 0, last = performance.now(), skip = false, frames = 0, fpsT = 0, pr = Math.min(devicePixelRatio || 1, 2), lastHud = '', puffOn = new Set();
    const onSkip = () => { skip = true; };
    el.querySelector('.p3-skip').onclick = onSkip; el.onclick = (e) => { if (!e.target.closest('.p3-skip')) onSkip(); };
    const v = new THREE.Vector3();
    await new Promise((done) => {
      const frame = (now) => {
        const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
        const τ0 = τ; if (freeze != null) τ = freeze; else τ += dt * script.rate(τ);
        if (onCue && script.cues) for (const c of script.cues) if (τ0 < c.τ && τ >= c.τ) onCue(c, script);
        script.place(τ, a, b);
        const g = script.guard ? script.guard(τ, a, b, stage.boxOf) : null;     // volumes : jamais d'interpénétration
        const th = script.thrust ? script.thrust(τ) : { A: 0.8, B: 0.8 };
        a.userData.thrust(th.A, τ); b.userData.thrust(th.B, τ + 3.1);
        a.userData.clearPuffs(); b.userData.clearPuffs();
        const pf = script.puffAt ? script.puffAt(τ) : [];
        for (const p of pf) (p.w === 'a' ? a : b).userData.puff(p.dir, p.k);
        if (snd) { const keys = new Set(pf.map((p) => p.w + p.dir)); for (const k of keys) if (!puffOn.has(k)) snd.click(); puffOn = keys; snd.set(script.audio(τ)); }
        const shot = script.camera(τ, a, b, cam);
        // la caméra n'entre jamais dans une coque : repoussée hors des volumes (marge de 1,5 m)
        for (const s2 of [a, b]) { const bx = stage.boxOf(s2).expandByScalar(1.5); if (bx.containsPoint(cam.position)) { const c = bx.getCenter(v); const out = cam.position.clone().sub(c); const h = bx.getSize(new THREE.Vector3()).multiplyScalar(0.5);
          const k = ['x', 'y', 'z'].map((ax) => h[ax] - Math.abs(out[ax])); const ax = ['x', 'y', 'z'][k.indexOf(Math.min(...k))]; cam.position[ax] = c[ax] + Math.sign(out[ax] || 1) * h[ax]; } }
        const boxes = [stage.boxOf(a).expandByScalar(4), stage.boxOf(b).expandByScalar(4)];
        stage.render(cam, { speed: 420 * script.rate(τ), dt, avoid: boxes });
        const h = script.hud(τ, g), sig = JSON.stringify(h);
        if (sig !== lastHud) { lastHud = sig; hud(h); }
        el.querySelector('.p3-slow').hidden = !(script.rate(τ) < 0.9);
        // densité de pixels adaptée : sous 50 i/s, on descend (2 → 1,5 → 1)
        frames++; fpsT += dt; if (fpsT > 1) { const fps = frames / fpsT; P.state.fps = Math.round(fps); frames = 0; fpsT = 0; if (fps < 50 && pr > 1) { pr = Math.max(1, pr - 0.5); stage.setPixelRatio(pr); size(); } }
        P.state.τ = τ; P.state.shot = shot; P.state.gap = g && g.gap; P.state.passed = g && g.passed;
        if (freeze == null && (skip || τ >= script.duration)) return done();
        if (freeze != null && skip) return done();
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    });
    if (snd) snd.stop();
    el.classList.remove('on');
    await new Promise((r) => setTimeout(r, 450));
    el.hidden = true; stage.scene.remove(a, b); P.playing = false;
    return true;
  }
  return P;
}
