// SpeedLines — stries de poussière autour de la caméra en vue de course : la sensation de vitesse.
// À 30–60 km/s, de la vraie poussière fixe dans l'espace traverserait l'écran en une image (rien de lisible) :
// on montre donc une vitesse « perçue », proportionnelle à la vraie, rapportée à la taille du racer suivi.
// Boîte de stries répétée autour de la caméra (aucune génération), défilement le long de la vitesse, longueur et
// éclat qui croissent avec la vitesse et la poussée.
import { THREE } from '../lib/sb3d-shim.js';

export class SpeedLines {
  constructor(n = 320) {
    const pos = new Float32Array(n * 2 * 3), end = new Float32Array(n * 2);
    let h = 99991;
    const r = () => ((h = (h * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) { const x = r(), y = r(), z = r(); pos.set([x, y, z, x, y, z], i * 6); end[i * 2] = 0; end[i * 2 + 1] = 1; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.u = { uOff: { value: new THREE.Vector3() }, uB: { value: 1000 }, uDir: { value: new THREE.Vector3(0, 0, 1) }, uLen: { value: 50 }, uA: { value: 0 }, uCol: { value: new THREE.Color(0xcfe6f5) } };
    this.mesh = new THREE.LineSegments(g, new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute float aEnd; uniform vec3 uOff, uDir; uniform float uB, uLen; varying float vF, vEnd;
        void main(){
          vec3 p = mod(position * uB + uOff, uB) - 0.5 * uB;            // boîte répétée centrée sur la caméra
          vF = 1.0 - smoothstep(0.25 * uB, 0.5 * uB, length(p));
          vF *= smoothstep(0.02 * uB, 0.08 * uB, length(p));             // rien collé à l'objectif
          p += uDir * uLen * aEnd; vEnd = aEnd;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */`
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform float uA; uniform vec3 uCol; varying float vF, vEnd;
        void main(){
          #include <logdepthbuf_fragment>
          gl_FragColor = vec4(uCol * uA * vF * (1.0 - vEnd * 0.85), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 8; this.mesh.visible = false;
  }
  // vel : vitesse du monde (m/s) ; L : taille du racer suivi (m) ; thrust 0..1 ; dt réel (s)
  update(on, vel, L, thrust, dt) {
    this.mesh.visible = on; if (!on) return;
    const v = Math.hypot(vel[0], vel[1], vel[2]) || 1, B = Math.max(L * 14, 300);
    const perceived = L * (v / 1000) * 0.35 * (1 + 0.6 * thrust);        // m/s à l'écran
    this.u.uB.value = B;
    this.u.uDir.value.set(-vel[0] / v, -vel[1] / v, -vel[2] / v);
    this.u.uOff.value.addScaledVector(this.u.uDir.value, perceived * dt);
    this.u.uOff.value.set(this.u.uOff.value.x % B, this.u.uOff.value.y % B, this.u.uOff.value.z % B);
    this.u.uLen.value = Math.min(B * 0.18, perceived * 0.09);
    this.u.uA.value = Math.min(0.9, 0.15 + v / 90000) * (0.8 + 0.4 * thrust);
    this.mesh.position.set(0, 0, 0);
  }
}
