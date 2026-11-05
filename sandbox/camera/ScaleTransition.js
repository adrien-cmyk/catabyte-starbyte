// ScaleTransition — zoom continu de l'échelle du système jusqu'au racer (test n° 7), sous forme de plan cinématique.
// · distance interpolée en logarithme (log d linéaire dans le temps, départ et arrivée adoucis) : chaque décade
//   d'échelle prend la même durée, de 8·10⁹ m à 150 m ;
// · visée : de la géante vers le racer, au moment où la distance devient comparable à leur écart ;
// · direction : de la vue haute (carte) vers la poursuite derrière le racer (slerp) ;
// · focale qui s'élargit à mi-parcours (sensation de plongée) ;
// · temps de course : rapide au départ, il ralentit jusqu'au temps réel à l'arrivée (horloge posée à chaque image).
import { THREE } from '../lib/sb3d-shim.js';

const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);

export function zoomShot(ctx, { title = 'Du système au racer', dur = 12, from = 8e9, to = 150, span = 4 * 3600, arriveBefore = 30 } = {}) {
  return {
    title, dur, fade: true,
    setup() {
      ctx.setRacer(true);
      const tEnd = ctx.race.tp - arriveBefore;
      ctx.setTime(tEnd - span); ctx.setTimeScale(0);
      const top = new THREE.Vector3(0.25, 1, 0.35).normalize();          // vue de carte, légèrement inclinée
      return { tEnd, top };
    },
    frame(s, u) {
      const e = smoother(u);
      // horloge : dτ/du s'annule à l'arrivée (le temps « ralentit » jusqu'au temps réel)
      ctx.setClock(s.tEnd - span * Math.pow(1 - u, 3));
      const r = ctx.racer, g = ctx.giant;
      const dist = Math.exp(Math.log(from) + (Math.log(to) - Math.log(from)) * e);
      const sep = Math.hypot(r.pos[0] - g.pos[0], r.pos[1] - g.pos[1], r.pos[2] - g.pos[2]);
      const wt = 1 / (1 + Math.pow(dist / (sep * 0.35), 2));              // la visée passe de la géante au racer
      const look = [0, 1, 2].map((i) => g.pos[i] + (r.pos[i] - g.pos[i]) * wt);
      // direction : vue haute → poursuite (derrière le racer, un peu au-dessus, côté soleil)
      const v = new THREE.Vector3(...r.vel).normalize(), n = new THREE.Vector3(...g.axis);
      const chase = v.clone().negate().addScaledVector(n, 0.22).addScaledVector(ctx.sun, 0.25).normalize();
      const qa = new THREE.Quaternion(), qb = new THREE.Quaternion().setFromUnitVectors(s.top, chase);
      const dir = s.top.clone().applyQuaternion(qa.slerp(qb, THREE.MathUtils.smoothstep(e, 0.45, 1.0)));
      const pos = look.map((c, i) => c + dir.getComponent(i) * dist);
      // haut de l'image : l'axe de la géante projeté ; en vue presque polaire, la direction du soleil projetée
      let up = n.clone().addScaledVector(dir, -n.dot(dir));
      if (up.length() < 0.15) up = ctx.sun.clone().addScaledVector(dir, -ctx.sun.dot(dir));
      return { pos, look, fov: 46 + 14 * Math.sin(Math.PI * e), up: up.normalize() };
    },
  };
}
