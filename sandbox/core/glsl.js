// Fragments GLSL partagés par les astres (bruit, fBm, utilitaires). Bruit de valeur 3D : stable sur GPU mobile,
// sans texture, sans discontinuité sur la sphère (on échantillonne toujours en 3D, jamais en lat/lon).
export const NOISE = /* glsl */`
float h13(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p, int oct){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 11; i++){ if (i >= oct) break; s += a * vnoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s;
}
vec3 rotY(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
// rotation de p autour d'un axe unitaire k (Rodrigues)
vec3 rotAxis(vec3 p, vec3 k, float a){ float c = cos(a), s = sin(a); return p * c + cross(k, p) * s + k * dot(k, p) * (1.0 - c); }
// intersection rayon / sphère centrée en c : renvoie (t0, t1), t0 > t1 si aucune
vec2 raySphere(vec3 ro, vec3 rd, vec3 c, float r){
  vec3 oc = ro - c; float b = dot(oc, rd); float h = b * b - (dot(oc, oc) - r * r);
  if (h < 0.0) return vec2(1e30, -1e30);
  h = sqrt(h); return vec2(-b - h, -b + h);
}
`;
