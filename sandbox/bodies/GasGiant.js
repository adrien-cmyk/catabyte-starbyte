// GasGiant — géante gazeuse procédurale : une sphère partagée, tout le reste dans le matériau.
// Bandes (palette + largeurs tirées de la graine), domaine tordu, rotation différentielle par latitude (deux phases
// fondues pour éviter l'étirement), tempêtes en tourbillon, turbulence dont le détail suit la distance,
// assombrissement du limbe, côté nocturne, ombre des anneaux (analytique), aurores et éclairs facultatifs,
// atmosphère de limbe par diffusion simple (8 échantillons).
// Calculs du shader dans le repère local de la planète, en rayons planétaires : aucune perte de précision float32.
import { THREE } from '../lib/sb3d-shim.js';
import { rngFor } from '../lib/rng.js';
import { NOISE } from '../core/glsl.js';

const hex = (h) => new THREE.Color(h);

function paletteTexture(preset, seed) {
  const N = 512, rng = rngFor('giant-pal:' + seed);
  const pal = preset.palette.map((c) => hex(c));
  // largeurs de bandes : hémisphère nord tiré au sort, sud en miroir légèrement perturbé (les géantes sont quasi symétriques)
  const half = Math.ceil(preset.bands / 2), widths = [];
  for (let i = 0; i < half; i++) widths.push(0.45 + rng() * 1.3 + (i === 0 ? 0.6 : 0));   // bande équatoriale plus large
  const total = widths.reduce((a, b) => a + b, 0);
  const edgesN = [0]; let acc = 0; for (const w of widths) { acc += w / total; edgesN.push(acc); }
  const colIdx = widths.map(() => Math.floor(rng() * pal.length));
  const colIdxS = colIdx.map((c) => (rng() < 0.25 ? Math.floor(rng() * pal.length) : c));
  const data = new Uint8Array(N * 4), c = new THREE.Color(), d = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const v = (i + 0.5) / N * 2 - 1;                 // −1 pôle sud … +1 pôle nord (en sin latitude « tordue »)
    const a = Math.abs(v), north = v >= 0;
    let b = 0; while (b < widths.length - 1 && a > edgesN[b + 1]) b++;
    const t = (a - edgesN[b]) / (edgesN[b + 1] - edgesN[b]);
    const idx = north ? colIdx : colIdxS;
    c.copy(pal[idx[b]]); d.copy(pal[idx[Math.min(b + 1, idx.length - 1)]]);
    // transition douce mais nette en bord de bande, légère variation interne
    const k = THREE.MathUtils.smoothstep(t, 0.82, 1.0);
    c.lerp(d, k * 0.85);
    const inner = 0.92 + 0.16 * Math.sin(t * Math.PI * (2 + (b % 3)) + b);
    c.multiplyScalar(THREE.MathUtils.lerp(1, inner, preset.bandContrast));
    const edge = Math.max(1 - t / 0.12, (t - 0.88) / 0.12, 0);       // proximité d'une frontière : plus de turbulence
    const sc = (x) => Math.round(255 * Math.pow(Math.min(1, Math.max(0, x)), 1 / 2.2));
    data[i * 4] = sc(c.r); data[i * 4 + 1] = sc(c.g); data[i * 4 + 2] = sc(c.b); data[i * 4 + 3] = Math.round(255 * Math.min(1, edge));
  }
  const tex = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
  return tex;
}

const SURFACE_VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vP;
void main(){
  vP = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;

const SURFACE_FRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
${NOISE}
uniform sampler2D uPal, uRing;
uniform vec3 uSunL, uCamL, uStormColor, uNight, uSunCol;
uniform float uPhase, uDiffT, uDiffP, uJets, uJetCount, uWarp, uTurb, uSunI, uAurora, uLightning, uFlashT;
uniform float uRingIn, uRingOut, uHasRing;
uniform int uOct;
uniform vec4 uStorms[4];
uniform int uStormCount;
varying vec3 vP;

float diffRate(float lat){ return uJets * 0.035 * cos(lat * uJetCount * 2.0) + uJets * 0.02 * cos(lat * 2.0); }

vec4 pattern(vec3 p){
  // tempêtes : enroulement local autour de chaque centre, ovale aplati en longitude
  float stormMask = 0.0, stormRing = 0.0;
  for (int k = 0; k < 4; k++){
    if (k >= uStormCount) break;
    vec4 s = uStorms[k];
    vec3 c = vec3(cos(s.x) * cos(s.y), sin(s.x), cos(s.x) * sin(s.y));
    float cd = dot(p, c);
    if (cd < 0.5) continue;
    vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), c)), north = cross(c, east);
    vec3 e = p - c * cd;
    float d = length(vec2(dot(e, east) * 0.62, dot(e, north))) / s.z;
    float sw = s.w * exp(-d * d * 1.3);
    p = rotAxis(p, c, sw);
    stormMask = max(stormMask, exp(-d * d * 2.2));
    stormRing = max(stormRing, exp(-pow((d - 0.75) * 4.0, 2.0)));
  }
  // bandes : latitude tordue par un bruit étiré en longitude (stries) et un bruit plus large (méandres)
  float lat = asin(clamp(p.y, -1.0, 1.0));
  float w1 = fbm(p * vec3(1.6, 9.0, 1.6) + 3.1, max(uOct - 2, 2));
  float w2 = fbm(p * vec3(4.0, 26.0, 4.0) + vec3(w1 * 1.5), max(uOct - 1, 2));
  float v = sin(lat + uWarp * ((w1 - 0.5) * 2.2 + (w2 - 0.5) * 0.9));
  vec4 band = texture2D(uPal, vec2(v * 0.5 + 0.5, 0.5));
  vec3 col = band.rgb;
  // turbulence fine, plus forte aux frontières de bande
  float t = fbm(p * vec3(7.0, 40.0, 7.0) + vec3(w2 * 2.0, 0.0, w1 * 2.0), uOct);
  float tk = uTurb * (0.45 + 0.9 * band.a);
  col *= mix(1.0, 0.72 + 0.56 * t, tk);
  col = mix(col, col * vec3(1.06, 1.0, 0.94) * (0.8 + 0.4 * w2), 0.35 * tk);
  // couleur des tempêtes : cœur teinté, couronne claire
  col = mix(col, uStormColor * (0.75 + 0.5 * t), stormMask * 0.85);
  col = mix(col, col * 1.35 + 0.03, stormRing * 0.35);
  return vec4(col, stormMask);
}

void main(){
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vP);
  float lat = asin(clamp(n.y, -1.0, 1.0));
  // rotation différentielle : deux phases décalées d'une demi-période, fondues en triangle
  float dr = diffRate(lat);
  float f1 = fract(uDiffT / uDiffP), f2 = fract(uDiffT / uDiffP + 0.5);
  float wt = abs(f1 * 2.0 - 1.0);
  vec4 A = pattern(rotY(n, -(uPhase + dr * f1 * uDiffP)));
  #ifdef CROSSFADE
    vec4 B = pattern(rotY(n, -(uPhase + dr * f2 * uDiffP)));
    vec4 P = mix(A, B, wt);
  #else
    vec4 P = A;
  #endif
  vec3 albedo = P.rgb;

  // éclairage : Lambert enveloppé, rougeoiement au terminateur, limbe assombri
  float ndl = dot(n, uSunL);
  float diff = clamp((ndl + 0.05) / 1.05, 0.0, 1.0);
  diff = diff * diff * (3.0 - 2.0 * diff) * 0.35 + diff * 0.65;
  vec3 vdir = normalize(uCamL - n);
  float mu = max(dot(n, vdir), 0.0);
  float limb = 0.22 + 0.78 * pow(mu, 0.5);
  vec3 term = mix(vec3(1.0, 0.62, 0.42), vec3(1.0), smoothstep(0.0, 0.3, ndl));

  // ombre des anneaux : rayon surface → soleil coupé par le plan équatorial
  float shadow = 1.0;
  if (uHasRing > 0.5 && ndl > -0.05 && abs(uSunL.y) > 1e-4){
    float tt = -n.y / uSunL.y;
    if (tt > 0.0){
      vec3 h = n + uSunL * tt; float r = length(h.xz);
      if (r > uRingIn && r < uRingOut){
        float dens = texture2D(uRing, vec2((r - uRingIn) / (uRingOut - uRingIn), 0.5)).a;
        float slant = 1.0 / max(abs(uSunL.y), 0.02);
        shadow = 1.0 - (1.0 - pow(1.0 - dens * 0.97, slant)) * 0.95;
      }
    }
  }
  vec3 col = albedo * uSunCol * uSunI * diff * limb * term * shadow;
  // côté nuit : presque noir, teinte propre à la géante
  float night = 1.0 - smoothstep(-0.12, 0.05, ndl);
  col += uNight * 0.015 * night;

  // aurores : ovale polaire animé, visible seulement côté nuit
  if (uAurora > 0.0){
    float al = abs(lat);
    float oval = exp(-pow((al - 1.22) * 14.0, 2.0));
    float cur = fbm(vec3(n.x * 18.0, uFlashT * 0.15, n.z * 18.0), 3);
    col += vec3(0.15, 0.9, 0.65) * oval * smoothstep(0.45, 0.8, cur) * 0.9 * uAurora * night;
  }
  // éclairs internes : cellules qui s'allument très rarement sous les nuages
  if (uLightning > 0.0){
    vec3 q = rotY(n, -uPhase) * 38.0;
    vec3 cell = floor(q);
    float hz = h13(cell + floor(uFlashT * 3.0));
    float pulse = step(0.9975, hz) * (0.5 + 0.5 * sin(uFlashT * 60.0 + hz * 40.0));
    float fall = exp(-dot(fract(q) - 0.5, fract(q) - 0.5) * 14.0);   // lueur diffuse sous les nuages, pas un point
    col += vec3(0.45, 0.55, 0.9) * pulse * fall * 0.35 * uLightning * night;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const ATMO_FRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
${NOISE}
uniform vec3 uSunL, uCamL, uRay, uMie, uSunCol;
uniform float uRa, uH, uDensity, uSunI;
varying vec3 vP;
void main(){
  #include <logdepthbuf_fragment>
  vec3 ro = uCamL, rd = normalize(vP * uRa - uCamL);
  vec2 ta = raySphere(ro, rd, vec3(0.0), uRa);
  if (ta.x > ta.y) discard;
  vec2 tp = raySphere(ro, rd, vec3(0.0), 1.0);
  float t0 = max(ta.x, 0.0), t1 = ta.y;
  if (tp.x < tp.y && tp.x > 0.0) t1 = min(t1, tp.x);
  if (t1 <= t0) discard;
  float ds = (t1 - t0) / 8.0, sum = 0.0, od = 0.0;
  for (int i = 0; i < 8; i++){
    vec3 p = ro + rd * (t0 + ds * (float(i) + 0.5));
    float r = length(p), h = (r - 1.0) / uH;
    float dens = exp(-max(h, 0.0));
    float lit = smoothstep(-0.18, 0.12, dot(p / r, uSunL));
    sum += dens * lit * ds; od += dens * ds;
  }
  sum /= uH; od /= uH;
  float c = dot(rd, uSunL);
  float pr = 0.75 * (1.0 + c * c);
  float g = 0.76, pm = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5) * 0.08;
  vec3 ext = exp(-od * 0.06 * (vec3(1.0) - uRay * 0.6));
  vec3 col = (uRay * pr + uMie * pm) * sum * 0.02 * uDensity * ext * uSunCol * uSunI;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class GasGiant {
  constructor(preset, { seed = 'g1', quality = 0, ring = null } = {}) {
    this.preset = preset; this.R = preset.radius; this.ring = ring;
    this.pos = new Float64Array(3);
    this.group = new THREE.Group();                  // repère incliné (axe de rotation) ; position = origine flottante
    this.group.rotation.set(0, 0, preset.tilt);
    this.group.updateMatrixWorld();
    this._inv = new THREE.Matrix4();
    const detail = quality >= 2 ? 48 : quality >= 1 ? 72 : 112;
    const geo = new THREE.SphereGeometry(1, detail * 2, detail);
    const storms = (preset.storms || []).slice(0, 4).map((s) => new THREE.Vector4(...s));
    while (storms.length < 4) storms.push(new THREE.Vector4());
    const u = this.uniforms = {
      uPal: { value: paletteTexture(preset, seed) },
      uRing: { value: ring ? ring.texture : null }, uRingIn: { value: ring ? ring.inner : 0 }, uRingOut: { value: ring ? ring.outer : 0 },
      uHasRing: { value: ring ? 1 : 0 },
      uSunL: { value: new THREE.Vector3(1, 0, 0) }, uCamL: { value: new THREE.Vector3(0, 0, 5) },
      uSunCol: { value: new THREE.Color(1, 1, 1) }, uSunI: { value: 1.6 },
      uStormColor: { value: hex(preset.stormColor) }, uNight: { value: hex(preset.nightTint) },
      uPhase: { value: 0 }, uDiffT: { value: 0 }, uDiffP: { value: 6 * 3600 * (2 * Math.PI / preset.spinPeriod) },
      uJets: { value: preset.jets }, uJetCount: { value: preset.jetCount }, uWarp: { value: preset.warp * 2.6 }, uTurb: { value: preset.turbulence },
      uAurora: { value: preset.aurora || 0 }, uLightning: { value: preset.lightning || 0 }, uFlashT: { value: 0 },
      uOct: { value: 5 }, uStorms: { value: storms }, uStormCount: { value: (preset.storms || []).length },
    };
    this.quality = quality;
    this.surface = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: u, vertexShader: SURFACE_VERT, fragmentShader: SURFACE_FRAG,
      defines: quality <= 1 ? { CROSSFADE: 1 } : {},
    }));
    this.surface.scale.setScalar(this.R);
    this.group.add(this.surface);

    const A = preset.atmo, Ra = 1 + A.height * 7;
    this.Ra = Ra;
    this.atmoU = {
      uSunL: u.uSunL, uCamL: u.uCamL, uSunCol: u.uSunCol, uSunI: u.uSunI,
      uRay: { value: new THREE.Vector3(...A.rayleigh) }, uMie: { value: new THREE.Vector3(...A.mie) },
      uRa: { value: Ra }, uH: { value: A.height }, uDensity: { value: A.density },
    };
    this.atmo = new THREE.Mesh(new THREE.SphereGeometry(1, detail * 2, detail), new THREE.ShaderMaterial({
      uniforms: this.atmoU, vertexShader: SURFACE_VERT, fragmentShader: ATMO_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.atmo.scale.setScalar(this.R * Ra);
    this.atmo.renderOrder = 2;
    this.group.add(this.atmo);
    if (ring) { ring.attach(this); }
  }
  get radius() { return this.R; }
  // camRel : vecteur caméra → centre (mètres, float64) ; sunDirW : direction monde vers l'étoile depuis la planète
  update(frame, timeS, sunDirW, sunColor, sunI) {
    const rel = frame.rel(this.pos);
    this._inv.copy(this.group.matrixWorld).setPosition(0, 0, 0).invert();
    const camL = new THREE.Vector3(-rel[0], -rel[1], -rel[2]).applyMatrix4(this._inv).divideScalar(this.R);
    this.uniforms.uCamL.value.copy(camL);
    this.uniforms.uSunL.value.copy(sunDirW).applyMatrix4(this._inv).normalize();
    this.uniforms.uSunCol.value.copy(sunColor); this.uniforms.uSunI.value = sunI;
    const w = 2 * Math.PI / this.preset.spinPeriod;
    this.uniforms.uPhase.value = (timeS * w) % (2 * Math.PI);
    this.uniforms.uDiffT.value = timeS % (6 * 3600);
    this.uniforms.uDiffP.value = 6 * 3600 * w;
    this.uniforms.uFlashT.value = timeS % 3600;
    // détail : plus on s'approche, plus il y a d'octaves (limité par le niveau de qualité)
    const alt = Math.max(camL.length() - 1, 1e-6);
    const oct = Math.round(5.5 + Math.log2(1 / alt) * 1.25);
    this.uniforms.uOct.value = Math.max(4, Math.min(this.quality >= 2 ? 6 : 10, oct));
    // atmosphère : faces avant de l'extérieur, faces arrière de l'intérieur
    this.atmo.material.side = camL.length() < this.Ra ? THREE.BackSide : THREE.FrontSide;
    if (this.ring) this.ring.update(camL, this.uniforms.uSunL.value, sunColor, sunI, timeS);
  }
}
