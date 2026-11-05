// RacerMarker — balise holographique du racer : un repère écran de taille fixe (cercle fin et point), visible quand le
// racer devient trop petit pour être lu (vue système, plans d'ensemble), qui s'efface dès qu'il redevient visible.
import { THREE } from '../lib/sb3d-shim.js';

export class RacerMarker {
  constructor(color = 0x9fe6ff) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    this.u = { uCol: { value: new THREE.Color(color) }, uA: { value: 0 }, uSize: { value: 18 } };
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`uniform float uSize; void main(){ gl_PointSize = uSize; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform vec3 uCol; uniform float uA;
        void main(){
          float r = length(gl_PointCoord - 0.5) * 2.0;
          float ring = 1.0 - smoothstep(0.0, 0.08, abs(r - 0.82));          // cercle fin
          float dot = 1.0 - smoothstep(0.12, 0.24, r);                      // point central
          gl_FragColor = vec4(uCol * (ring * 0.8 + dot) * uA, 1.0);
        }`,
    }));
    this.points.frustumCulled = false; this.points.renderOrder = 10;
  }
  // px : taille du racer à l'écran (pixels) ; la balise apparaît sous ~5 px
  update(px, on, dpr = 1) {
    this.u.uA.value = on ? 1 - THREE.MathUtils.smoothstep(px, 2, 6) : 0;
    this.u.uSize.value = 18 * dpr;
    this.points.visible = this.u.uA.value > 0.01;
  }
}
