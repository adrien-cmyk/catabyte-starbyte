// Star — étoile source principale : sphère à granulation et assombrissement du limbe (visible de près),
// halo et aigrettes discrètes sur un panneau toujours face caméra, à la position réelle de l'étoile
// (une géante passe devant : éclipse et contre-jour naturels). La couleur suit la température.
import { THREE } from '../lib/sb3d-shim.js';
import { NOISE } from '../core/glsl.js';

export const STAR_TYPES = {
  yellow: { name: 'Étoile jaune', T: 5800, radius: 6.96e8, intensity: 1.0 },
  red: { name: 'Naine rouge', T: 3200, radius: 2.8e8, intensity: 0.55 },
  white: { name: 'Étoile blanche', T: 9500, radius: 1.2e9, intensity: 1.35 },
};

// couleur approchée d'un corps noir (Tanner Helland), normalisée
export function blackbody(T) {
  const t = T / 100; let r, g, b;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
  else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255; }
  const c = new THREE.Color().setRGB(Math.min(255, Math.max(0, r)) / 255, Math.min(255, Math.max(0, g)) / 255, Math.min(255, Math.max(0, b)) / 255, THREE.SRGBColorSpace);
  const m = Math.max(c.r, c.g, c.b); return c.multiplyScalar(1 / m);
}

const VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vP; varying vec2 vUv;
void main(){ vP = position; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;

export class Star {
  constructor(type = STAR_TYPES.yellow) {
    this.type = type; this.R = type.radius; this.pos = new Float64Array(3);
    this.color = blackbody(type.T);
    this.group = new THREE.Group();
    this.uniforms = { uCol: { value: this.color }, uT: { value: 0 }, uCamDir: { value: new THREE.Vector3() } };
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT,
      fragmentShader: /* glsl */`
        #include <common>
        #include <logdepthbuf_pars_fragment>
        ${NOISE}
        uniform vec3 uCol, uCamDir; uniform float uT; varying vec3 vP;
        void main(){
          #include <logdepthbuf_fragment>
          vec3 n = normalize(vP);
          float mu = max(dot(n, -uCamDir), 0.0);
          float limb = 0.35 + 0.65 * pow(mu, 0.55);
          float gran = fbm(n * 160.0 + uT * 0.002, 4);
          float spots = smoothstep(0.72, 0.8, fbm(n * 9.0 + 4.0, 4));
          vec3 col = uCol * (3.2 * limb * (0.85 + 0.3 * gran)) * (1.0 - 0.55 * spots);
          col = mix(col, col * vec3(1.0, 0.7, 0.45), 1.0 - mu);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    this.sphere.scale.setScalar(this.R);
    this.group.add(this.sphere);
    // halo : panneau construit directement en espace écran autour du centre projeté de l'étoile (aucun grand triangle
    // à 10¹¹ m) ; le test de profondeur garde l'éclipse par une géante. Rayon angulaire réglé à chaque image.
    this.glowU = { uCol: { value: this.color }, uK: { value: 0.05 }, uI: { value: type.intensity }, uSize: { value: new THREE.Vector2(0.1, 0.1) } };
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: this.glowU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        #include <common>
        #include <logdepthbuf_pars_vertex>
        uniform vec2 uSize; varying vec2 vUv;
        void main(){
          vUv = uv;
          vec4 c = projectionMatrix * modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          // position normalisée (w = 1) : évite l'interpolation sur un w de 10¹¹ ; profondeur logarithmique réécrite
          gl_Position = vec4(c.xy / c.w + position.xy * uSize, clamp(c.z / c.w, -1.0, 0.999999), 1.0);
          #include <logdepthbuf_vertex>
          #ifdef USE_LOGDEPTHBUF
            vFragDepth = 1.0 + c.w;
          #endif
        }`,
      fragmentShader: /* glsl */`
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform vec3 uCol; uniform float uK, uI; varying vec2 vUv;
        void main(){
          #include <logdepthbuf_fragment>
          vec2 p = vUv * 2.0 - 1.0; float r = length(p);
          float x = max(r, uK) / uK;                         // distance en rayons du disque
          float halo = 0.9 / (x * x) + 0.18 * exp(-r * 5.0) + 0.05 * exp(-r * 1.6);
          float a = atan(p.y, p.x);
          float rays = pow(abs(cos(a * 2.0)), 180.0) * 0.6 + pow(abs(cos(a * 2.0 + 0.785)), 300.0) * 0.25;
          halo += rays * exp(-r * 3.0) * 0.6;
          halo *= 1.0 - smoothstep(0.6, 1.0, r);
          gl_FragColor = vec4(uCol * halo * uI * 1.4, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    this.glow.frustumCulled = false;
    this.glow.renderOrder = 5;
    this.group.add(this.glow);
  }
  update(frame, timeS, camera) {
    const rel = frame.rel(this.pos), D = Math.hypot(rel[0], rel[1], rel[2]);
    this.uniforms.uT.value = timeS % 10000;
    this.uniforms.uCamDir.value.set(rel[0] / D, rel[1] / D, rel[2] / D);
    // halo : au moins 1,6° de rayon, ou 2,4 fois le disque quand on est proche
    const ad = this.R / D, ag = Math.max(ad * 2.4, 0.028);
    const k = Math.tan(Math.min(ag, 1.2)) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    this.glowU.uSize.value.set(k / camera.aspect, k);
    this.glowU.uK.value = Math.min(ad / ag, 1);
  }
}
