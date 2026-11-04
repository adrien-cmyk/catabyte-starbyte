// Backdrop — fond spatial cuit UNE fois dans un cube (méthode de station3d.js : coût nul par image).
// Étoiles en loi de puissance (beaucoup de faibles, très peu de brillantes), couleur selon la température,
// bande galactique discrète, une nébuleuse localisée et sombre : elle ne doit jamais brouiller la lecture de la course.
import { THREE } from '../lib/sb3d-shim.js';
import { rngFor } from '../lib/rng.js';
import { NOISE } from '../core/glsl.js';
import { blackbody } from '../bodies/Star.js';

export function bakeBackdrop(renderer, { seed = 'sky1', quality = 0, nebulaDir = [-0.55, 0.25, -0.8], nebulaTint = [0.35, 0.18, 0.42] } = {}) {
  const rng = rngFor('backdrop:' + seed);
  const scene = new THREE.Scene();
  const bandN = new THREE.Vector3(0.18, 1, 0.3).normalize();
  // nébuleuse et bande galactique : un shader sur une sphère
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uNeb: { value: new THREE.Vector3(...nebulaDir).normalize() }, uTint: { value: new THREE.Vector3(...nebulaTint) }, uBand: { value: bandN } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      ${NOISE}
      uniform vec3 uNeb, uTint, uBand; varying vec3 vD;
      void main(){
        vec3 d = normalize(vD);
        float band = exp(-pow(dot(d, uBand) * 4.0, 2.0));
        float m = fbm(d * 3.0 + 2.0, 6), g = fbm(d * 9.0 + m * 2.0, 5);
        vec3 col = vec3(0.0025, 0.003, 0.005);
        col += vec3(0.020, 0.018, 0.016) * band * smoothstep(0.35, 0.75, m) * (0.6 + 0.8 * g);
        col *= 1.0 - 0.8 * smoothstep(0.5, 0.75, fbm(d * 6.0 + 9.0, 5)) * band;   // poussières sombres
        float c = max(dot(d, uNeb), 0.0);
        float neb = pow(c, 6.0) * smoothstep(0.38, 0.8, fbm(d * 4.0 + vec3(m), 6));
        col += uTint * neb * 0.07 + uTint.zyx * pow(c, 30.0) * g * 0.025;
        gl_FragColor = vec4(col, 1.0);
      }`,
  })));
  // étoiles : points, magnitude en loi de puissance, concentration douce vers la bande galactique
  const count = quality >= 2 ? 9000 : 16000;
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), size = new Float32Array(count);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
    if (v.lengthSq() > 1 || v.lengthSq() < 1e-4) { i--; continue; }
    v.normalize();
    if (rng() < 0.45) { v.addScaledVector(bandN, -v.dot(bandN) * (0.6 + rng() * 0.4)).normalize(); }
    pos.set([v.x * 90, v.y * 90, v.z * 90], i * 3);
    const mag = Math.pow(rng(), 7);                                // 0 = très faible … 1 = brillante (rare)
    const T = 2800 + Math.pow(rng(), 1.6) * 11000;
    const c = blackbody(T).lerp(new THREE.Color(1, 1, 1), 0.45).multiplyScalar(0.05 + mag * 2.2);
    col.set([c.r, c.g, c.b], i * 3);
    size[i] = 1.0 + mag * 2.6;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  scene.add(new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute float size; attribute vec3 color; varying vec3 vC; void main(){ vC = color; gl_PointSize = size; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vC; void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; float a = exp(-r * r * 3.5); gl_FragColor = vec4(vC * a, 1.0); }',
  })));
  const res = quality >= 2 ? 1024 : 2048;
  const rt = new THREE.WebGLCubeRenderTarget(res, { type: THREE.HalfFloatType, generateMipmaps: false });
  new THREE.CubeCamera(1, 1000, rt).update(renderer, scene);
  scene.traverse((o) => { if (o.material) o.material.dispose(); if (o.geometry) o.geometry.dispose(); });
  return rt.texture;
}
