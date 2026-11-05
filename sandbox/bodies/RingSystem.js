// RingSystem — anneaux planétaires vus de loin : disque transparent porté par un profil radial tiré de la graine
// (densité, couleur, divisions). Ombre de la planète sur les anneaux et des anneaux sur la planète : analytiques,
// sans carte d'ombre. Face éclairée (rétrodiffusion) et face sombre (lumière transmise : les zones fines s'allument
// en contre-jour, les zones denses restent noires). Profondeur optique corrigée par l'angle de vue.
// densityAt(r) est la même donnée que lira la simulation (passages dangereux, raccourcis) : une seule vérité.
import { THREE } from '../lib/sb3d-shim.js';
import { rngFor } from '../lib/rng.js';
import { NOISE } from '../core/glsl.js';

const RING_COLORS = {
  amber: ['#d2bc9c', '#8f7558', '#e8dcc6'],
  blue: ['#a9b4ba', '#5f6c75', '#c9d2d6'],
  black: ['#6e655b', '#37322d', '#8b8178'],
};

export class RingSystem {
  constructor({ seed = 'r1', palette = 'amber', inner = 1.24, outer = 2.32, tiltLocal = 0 } = {}) {
    this.inner = inner; this.outer = outer; this.N = 2048;
    const rng = rngFor('ring:' + seed);
    const N = this.N, dens = new Float32Array(N), tint = new Float32Array(N);
    const at = (r) => (r - inner) / (outer - inner);
    const j = (x, a) => x + (rng() - 0.5) * a;
    // grandes structures (en rayons planétaires) : anneau intérieur ténu, anneau principal dense, grande division,
    // anneau extérieur avec une division étroite, anneau fin isolé au bord
    const parts = [
      { a: inner, b: j(1.52, 0.04), d: 0.10 + rng() * 0.06, t: 0.2 },
      { a: j(1.53, 0.03), b: j(1.94, 0.03), d: 0.78 + rng() * 0.15, t: 0.9 },
      { a: j(2.03, 0.02), b: j(2.26, 0.02), d: 0.45 + rng() * 0.15, t: 0.6 },
      { a: j(2.305, 0.005), b: j(2.316, 0.003), d: 0.5, t: 1.0 },
    ];
    const gaps = [{ c: j(2.205, 0.01), w: 0.006 + rng() * 0.004 }, { c: j(1.75, 0.05), w: 0.002 }];
    // ondulations : somme de sinusoïdes aux fréquences tirées au sort + bruit de valeur (annelets)
    const waves = Array.from({ length: 9 }, () => ({ f: 40 + rng() * 900, p: rng() * 6.283, a: 0.04 + rng() * 0.12 }));
    const vals = Array.from({ length: 400 }, () => rng());
    const vn = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return vals[i % 400] * (1 - u) + vals[(i + 1) % 400] * u; };
    for (let i = 0; i < N; i++) {
      const r = inner + (i + 0.5) / N * (outer - inner);
      let d = 0, t = 0;
      for (const p of parts) {
        const e = Math.min(r - p.a, p.b - r);
        if (e > -0.004) { const k = THREE.MathUtils.smoothstep(e, -0.004, 0.006); if (k * p.d > d) { d = k * p.d; t = p.t; } }
      }
      for (const g of gaps) d *= THREE.MathUtils.smoothstep(Math.abs(r - g.c), g.w * 0.5, g.w);
      let w = 1; for (const s of waves) w += s.a * Math.sin(r * s.f + s.p);
      w *= 0.75 + 0.5 * vn(r * 220);
      dens[i] = Math.min(1, Math.max(0, d * w));
      tint[i] = Math.min(1, Math.max(0, t * (0.7 + 0.6 * vn(r * 60 + 50))));
    }
    this.dens = dens;
    const cols = (RING_COLORS[palette] || RING_COLORS.amber).map((h) => new THREE.Color(h));
    const data = new Uint8Array(N * 4), c = new THREE.Color();
    this.colLin = new Float32Array(N * 3);                // couleurs linéaires (fragments instanciés)
    for (let i = 0; i < N; i++) {
      c.copy(cols[1]).lerp(cols[0], tint[i]).lerp(cols[2], Math.max(0, dens[i] - 0.75) * 1.5);
      this.colLin.set([c.r, c.g, c.b], i * 3);
      c.convertLinearToSRGB();
      data[i * 4] = Math.round(c.r * 255); data[i * 4 + 1] = Math.round(c.g * 255); data[i * 4 + 2] = Math.round(c.b * 255);
      data[i * 4 + 3] = Math.round(dens[i] * 255);
    }
    const tex = this.texture = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  }
  // densité (0..1) à un rayon donné en rayons planétaires : donnée de jeu (simulation, risques de traversée)
  colorAt(r) {
    const i = Math.max(0, Math.min(this.N - 1, Math.floor((r - this.inner) / (this.outer - this.inner) * this.N)));
    return [this.colLin[i * 3], this.colLin[i * 3 + 1], this.colLin[i * 3 + 2]];
  }
  densityAt(r) {
    if (r < this.inner || r > this.outer) return 0;
    return this.dens[Math.min(this.N - 1, Math.floor((r - this.inner) / (this.outer - this.inner) * this.N))];
  }
  attach(giant) {
    this.giant = giant;
    const geo = new THREE.RingGeometry(this.inner, this.outer, 512, 8);
    geo.rotateX(-Math.PI / 2);                       // plan équatorial local (XZ)
    this.uniforms = {
      uRing: { value: this.texture }, uIn: { value: this.inner }, uOut: { value: this.outer },
      uSunL: { value: new THREE.Vector3() }, uCamL: { value: new THREE.Vector3() },
      uSunCol: { value: new THREE.Color() }, uSunI: { value: 1.6 }, uFine: { value: 0 }, uNear: { value: 0 }, uRm: { value: giant.R },
    };
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        #include <common>
        #include <logdepthbuf_pars_vertex>
        varying vec3 vP;
        void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */`
        #include <common>
        #include <logdepthbuf_pars_fragment>
        ${NOISE}
        uniform sampler2D uRing; uniform float uIn, uOut, uSunI, uFine, uNear, uRm;
        uniform vec3 uSunL, uCamL, uSunCol;
        varying vec3 vP;
        void main(){
          #include <logdepthbuf_fragment>
          float r = length(vP.xz);
          vec4 s = texture2D(uRing, vec2((r - uIn) / (uOut - uIn), 0.5));
          float dens = s.a;
          // annelets fins quand on s'approche (au-delà de la résolution du profil)
          dens *= mix(1.0, 0.7 + 0.6 * vnoise(vec3(r * 9000.0, 0.0, 0.0)), uFine);
          vec3 rd = normalize(vP - uCamL);
          float cv = max(abs(rd.y), 0.015);
          float alpha = 1.0 - pow(1.0 - min(dens, 0.985), 1.0 / cv);
          // près de la caméra, le disque cède la place aux fragments instanciés (fondu sur la portée des fragments)
          if (uNear > 0.0) alpha *= smoothstep(0.3, 1.0, length(vP - uCamL) * uRm / uNear);
          // ombre de la planète (rayon vers le soleil coupé par la sphère unité), pénombre douce
          float shadow = 1.0;
          float along = dot(vP, uSunL);
          if (along < 0.0){ float d = length(vP - uSunL * along); shadow = smoothstep(0.985, 1.015, d); }
          float sunUp = abs(uSunL.y);
          bool sameSide = (uCamL.y > 0.0) == (uSunL.y > 0.0);
          float c = dot(rd, uSunL);
          vec3 col;
          if (sameSide){
            float back = 1.0 + 0.6 * pow(max(-c, 0.0), 6.0);            // effet d'opposition
            col = s.rgb * (0.12 + 0.88 * sqrt(sunUp)) * back;
          } else {
            float fwd = 0.25 + 2.5 * pow(max(c, 0.0), 8.0);              // diffusion vers l'avant en contre-jour
            col = s.rgb * (1.0 - dens) * 1.6 * sqrt(sunUp) * fwd;
          }
          col *= uSunCol * uSunI * shadow;
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    this.mesh.scale.setScalar(giant.R);
    this.mesh.renderOrder = 1;
    giant.group.add(this.mesh);
  }
  update(camL, sunL, sunColor, sunI) {
    this.uniforms.uCamL.value.copy(camL); this.uniforms.uSunL.value.copy(sunL);
    this.uniforms.uSunCol.value.copy(sunColor); this.uniforms.uSunI.value = sunI;
    const alt = Math.abs(camL.y);
    this.uniforms.uFine.value = THREE.MathUtils.clamp(1 - Math.log10(Math.max(alt, 1e-6) * 1e3) / 2, 0, 1);
  }
}
