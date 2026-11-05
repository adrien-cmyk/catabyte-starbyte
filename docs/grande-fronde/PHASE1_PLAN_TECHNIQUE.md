# La Grande Fronde — Phase 1 : Race World Visual Sandbox

**Plan technique et inventaire des fichiers** · v0.1 · 4 novembre 2026
Rédigé à partir de la lecture du dépôt `adrien-cmyk/starbyte` (branche `main`), sans rien y modifier.

> Rien de ce document ne touche aux systèmes actuels du jeu. La Phase 1 se développe dans ce dépôt
> (`catabyte-starbyte`), sur le moteur partagé du jeu, et n'est branchée dans `github_upload/` qu'après validation.
> Ni la simulation complète, ni Télébyte, ni les paris ne sont commencés ici. Le §12 fixe seulement les choix
> de serveur pour que la Phase 1 ne les rende pas impossibles plus tard.

---

## 0. Ce que contient Starbyte aujourd'hui (état des lieux)

| Élément | Fichier(s) | Ce qu'on en retient pour la Fronde |
|---|---|---|
| **Moteur 3D partagé** | `github_upload/assets/planet3d.js` (877 Ko, minifié) | Embarque **three.js r186** et publie `window.SB3D = { THREE, GLTFLoader, MapControls, RoomEnvironment, EffectComposer, RenderPass, UnrealBloomPass, OutputPass }`. Règle du jeu : **pas de seconde copie de three.js**. La sandbox utilise ce même objet. |
| Planète du joueur | `planet3d.js` → `window.Planet3D` (`scene`, `renderer`, `_frame`, `ready`) | Exemple d'écran 3D complet avec bloom, ciel jour/nuit (`sky.js`) et éclairage architectural (`lumiere.js`). |
| **Carte spatiale (niveau A)** | `assets/spacemap.js` (194 Ko) + secours SVG `spacemap2d.js` | Plateau hexagonal (kit `sb_kit.glb`, parcelles de 50 m), caméra quasi isométrique 28°/48°, `MapControls`, positions déterministes `_hashSeed` + `_mulberry32`. Elle sert à la stratégie et n'a pas d'échelle physique. |
| **Diorama système (niveau B)** | `assets/system3d.js` (`SBSystem`, écran `scr-system`) | Étoile, orbites, planètes par classe (`type4` = géante gazeuse : sphère + texture canvas de bandes 8×256). C'est le point d'entrée naturel de la future « vue système » de course. La géante actuelle est trop simple pour la Fronde : on la remplace par une nouvelle, sans modifier l'ancienne. |
| Fiches 3D vaisseaux | `assets/ship3d.js` (`Ship3D.mount`) + skill *starbyte-ship-showcase* | Profils KV-01 / SR-01 / TK-07, panaches de tuyère, bulle de choc plasma, queue de comète, caméra lissée. **Le racer témoin et les effets de propulsion partent d'ici.** |
| Stations 3D | `assets/station3d.js` (`Station3D.mount`) | Ciel procédural (nébuleuse fBm cuite une fois dans un cube, coût nul par image), champ d'étoiles, trafic. Niveaux `LITE` / `MOBILE`. On reprend la méthode (ciel cuit), pas le code. |
| Fond orbital | `assets/3d/sky/orbitsky.js` + `orbit_pano.jpg` (cuit dans Blender : `tools/sky/*.py`) | Panorama équirectangulaire pré-compensé ACES, `sunDir` aligné sur la lumière clé. Le même principe sert pour les fonds stellaires de course. |
| **Qualité automatique** | `assets/perf.js` (`window.SBPerf`) | Quatre niveaux (Haute / Moyenne / Économe / Minimale). Il intercepte `WebGLRenderer.setPixelRatio` et `render`, si bien que tout nouveau moteur est pris en charge **automatiquement**. À partir d'Économe : ni MSAA, ni bloom, ni ombres. La sandbox lit `SBPerf.level` pour choisir ses LOD. |
| Navigation multi-échelles (labo) | `labo/carte-v6/index.html` (« plans d'existence ») | Zoom continu par plans imbriqués, effet de zoom accéléré, étiquettes à taille constante. **C'est le modèle UX du zoom système → racer.** |
| Tests navigateur | `tools/explore/lib.js` | Playwright + SwiftShader, rendu image par image (`_frame`) pour les captures. Les tests visuels de la sandbox reprennent ce harnais. |
| **Serveur** | `github_upload/server/` | **Supabase** : schémas SQL versionnés (`schema_mp_v18…v40`) et fonctions Deno (`resolve-raids`, `bm-checkout`, `bm-webhook`, `logo-upload`). Le moteur de combat est une **copie générée** depuis `index.html` (`tools/sync_combat_engine.py`), ce qui donne le même code côté client et côté serveur. On réutilise ce modèle pour le moteur de course (§12). |
| Économie | `G.credits` (« Crédits galactiques ») | Monnaie des paris. Elle doit rester **strictement séparée** du Blackmarket (achats en argent réel, tables `bm_*`). |

**Conclusion.** Aucun moteur ne gère aujourd'hui de très grandes distances : la carte et le diorama sont des
maquettes sans échelle physique. Il n'existe ni shader de géante gazeuse, ni anneaux, ni lunes, ni astéroïdes
instanciés. Le socle (three r186, bloom, qualité auto, chargement glTF/meshopt, effets de vaisseau, Supabase) est
en revanche solide et se réutilise tel quel.

---

## 1. Composants et scènes à créer

Une page autonome **`sandbox/index.html`** (*Race World Visual Sandbox*). Elle s'organise en modules ES ; chacun
exporte une fabrique `create…(lib, params)` qui reçoit `window.SB3D` et ne touche aucun global du jeu.
Ce choix permet de les brancher plus tard dans `github_upload/assets/` comme `ship3d.js` ou `station3d.js`.

```
RaceWorld (racine)
├── WorldFrame          origine flottante, unités, conversion monde ↔ rendu (§7)
├── StarSystem          données : étoile, corps, orbites (JSON déterministe par graine)
│   ├── Star            disque + granulation + couronne + éruptions, lumière directionnelle
│   ├── GasGiant        sphère + shader de bandes + atmosphère de limbe (§3)
│   │   └── RingSystem  disque transparent + fragments instanciés + ombres croisées (§3.2)
│   ├── Moon ×3         rocheuse cratérisée, glacée fracturée, volcanique (§4)
│   └── AsteroidField   instanciation GPU par cellules, 3 LOD (§5)
├── Backdrop            ciel cuit dans un cube (étoiles, nébuleuse localisée), fixe à l'infini
├── Racer               racer témoin (glTF existant) + propulsion + traînée
├── TrajectoryHolo      trajectoire holographique (ruban écran, prévu / réel)
├── CameraRig           libre, cinématique, transition système ↔ rapproché (§8)
├── LodManager          choix des LOD et budgets selon distance écran + SBPerf.level (§6)
├── PostFX              RenderPass → UnrealBloom → OutputPass (ACES), sans bloom en Économe
└── DevPanel            curseurs de paramètres, préréglages des 7 tests, capture PNG
```

Préréglages livrés : `amber.json`, `blue.json` et `black.json` pour les géantes ; trois familles de lunes ;
un champ d'astéroïdes ; un système complet `sandbox_system.json`.

---

## 2. Réutilisation des systèmes existants

| Réutilisé tel quel | Repris comme méthode (code neuf) | Non utilisé en Phase 1 |
|---|---|---|
| `window.SB3D` (three r186, GLTFLoader, MapControls, EffectComposer, bloom, OutputPass) | Ciel cuit en cube (`station3d.js`) | `spacemap.js` (plateau hexagonal) |
| `meshopt_decoder.module.js` | Pré-compensation ACES des fonds (`orbitsky.js`) | `G`, sauvegarde et cloud |
| `SBPerf` (lecture du niveau ; l'interception des renderers est automatique) | Plans d'existence et zoom accéléré (`labo/carte-v6`) | Supabase (Phase 3 et suivantes) |
| Modèles de vaisseaux : `sb_sr01_lod.glb` (frégate) et `sb_ships_v3.glb` pour le racer témoin | Panache, bulle de choc et caméra lissée (`ship3d.js`, skill *starbyte-ship-showcase*) | |
| Harnais Playwright `tools/explore/lib.js` | Graine déterministe `_hashSeed` + `_mulberry32` (recopiés dans `rng.js`, avec le même algorithme) | |

Hors du jeu, la sandbox remplit `window.SB3D` avec un petit **shim** (`sandbox/lib/sb3d-shim.js`) qui importe
**three@0.186.0** depuis jsDelivr, la même révision que le jeu. Le code de la sandbox est donc identique dans le
labo et dans le jeu.

---

## 3. Rendu des géantes gazeuses

**Géométrie.** Une seule sphère haute résolution (icosphère subdivisée, environ 20 000 triangles en LOD0), partagée
par toutes les géantes. Aucune sculpture : tout passe par le matériau.

**Matériau `GasGiantMaterial`** (ShaderMaterial r186, éclairage calculé dans le shader) :

1. **Bandes** : profil 1D par latitude (rampe de couleurs à 4–6 arrêts + largeurs). Il est déformé par un bruit fBm
   3D dont le domaine est tordu (*domain warping*). La déformation est plus forte aux frontières de bande.
2. **Rotation différentielle** : décalage en longitude `φ' = φ + t·ω(lat)`, avec un profil de vents zonaux
   paramétrable (jets alternés). Pour éviter l'étirement au fil du temps, deux phases de bruit sont décalées puis
   fondues en boucle (*flow-map crossfade*).
3. **Tempêtes** : jusqu'à 4 vortex définis analytiquement (centre lat/lon, rayon, sens). Ils tordent les coordonnées
   d'échantillonnage localement (enroulement en spirale) et ajoutent un anneau de couleur. La grande tempête de la
   géante ambre est le vortex 0.
4. **Turbulence** : octaves fBm supplémentaires, dont l'amplitude dépend de la distance (LOD par shader).
5. **Éclairage** : Lambert enveloppé (*wrap*) pour un terminateur doux, assombrissement du limbe, côté nuit à
   ~0,5 % d'albédo et ombre des anneaux (§3.2) calculée analytiquement dans le shader de la planète.
6. **Émissifs nocturnes facultatifs** : aurores (bande polaire animée, additive) et éclairs internes pour la géante
   noire (cellules de Voronoï qui clignotent rarement sous la couche nuageuse, visibles seulement côté nuit).

**Atmosphère.** Une coque légèrement plus grande (×1,015) en `BackSide` additif. Elle fait une diffusion
Rayleigh/Mie approximée (8 échantillons le long du rayon de vue, intégrale analytique de la densité
exponentielle) et donne le liseré de limbe et le halo en contre-jour. En Minimale, on passe à une version
« fresnel + couleur ».

**Cache de texture (performances mobiles).** Le fBm complet est coûteux. Le champ de bandes, de turbulence et de
tempêtes est donc cuit dans une **texture équirectangulaire** (2048×1024 en Haute, 1024×512 en Économe), via un
render-to-texture de quelques millisecondes. On la recuit par tranches (1/16 de la texture par image) pour animer
les tempêtes. Le shader de surface ne fait plus que : lire le cache, appliquer la rotation différentielle (décalage
d'UV), ajouter le détail fin de près et éclairer. C'est le point qui rend une géante premium tenable sur iPhone.

**Variantes livrées** (fichiers de paramètres, pas de code) :
- **Ambre** : ocre, crème et rouge brique ; grande tempête permanente ; 3 jets marqués.
- **Bleue** : bleu pétrole et cyan sombre ; bandes larges et lisses ; brume de haute altitude ; aurores.
- **Noire** : nuages presque noirs, éclairs internes, liseré atmosphérique fin et lumineux (seule la diffusion la révèle).

---

## 3.2 Anneaux

- **Loin : disque** (`RingGeometry` en 256 segments, UV radiales). Un profil radial 1D (texture 2048×1 RGBA) porte
  la densité, la couleur, les divisions et la diffusion vers l'avant. Rendu transparent à double face, éclairé
  selon la face vue (rétrodiffusion côté soleil, diffusion vers l'avant en contre-jour).
- **Ombre planète → anneaux** : test analytique rayon/sphère dans le fragment de l'anneau.
- **Ombre anneaux → planète** : intersection du rayon soleil–fragment avec le plan des anneaux, lecture du profil
  radial, atténuation. Les deux sont analytiques : **aucune shadow map**.
- **Près : fragments**. Le disque est découpé en cellules polaires (rayon × angle). Seules les cellules proches de
  la caméra s'allument. Chacune génère, à partir de sa graine, des fragments `InstancedMesh` (4 formes de roche
  basse définition), avec un nombre proportionnel à la densité du profil. Le disque s'efface en fondu
  (*dithering*) à mesure que les fragments apparaissent, entre 2 et 0,5 × l'épaisseur visuelle.
- **Poussière** : particules `Points` additives dans la cellule de la caméra, qui donnent la sensation de vitesse.
- **Inclinaison** : paramètre du système. Les **passages dangereux** sont des divisions dont la densité et la
  largeur sont des données lisibles par la future simulation (`RingSystem.densityAt(r)`).

---

## 4. Génération des lunes

**Géométrie déplacée** : *cube-sphere* (6 faces subdivisées). On évite ainsi le pincement aux pôles et chaque face
dispose de son propre quadtree de LOD. Le relief est calculé **sur CPU, une fois, dans un Web Worker** à partir de
la graine :

- **Grandes formations** (déplacées géométriquement) : bassins d'impact (profil de cratère avec rebord, fond plat
  et pic central), fractures (distance à des grands cercles aléatoires), dômes et caldeiras volcaniques, et
  continents de bruit *ridged* pour la lune poreuse et irrégulière (déformation non sphérique).
- **Détail fin** : une normal map et une carte de matériau cuites dans le même worker (cratères de petite taille
  en distribution en loi de puissance, régolithe). On utilise un triplanaire de micro-détail tuilé en plan
  rapproché.

**Familles** : un jeu de paramètres chacune (`diamètre, densité/profondeur des cratères, relief, albédo, palette,
fissures, émission, brume, rotation, gravité, orbite`).

| Famille | Particularités de rendu |
|---|---|
| Rocheuse cratérisée | Rétrodiffusion de type Hapke (effet d'opposition), contraste fort au terminateur. |
| Glacée fracturée | Fractures bleutées translucides (émissif faible, diffusion sous la surface simulée), albédo élevé, reflets. |
| Volcanique | Coulées émissives (masque de chaleur + bloom local), panaches en particules facultatifs. |
| Métallique sombre | PBR metalness 0,7, rugosité basse sur les plateaux, reflets de l'environnement cuit. |
| Océanique | Coque d'atmosphère fine (même shader que les géantes, densité faible), reflet spéculaire du soleil. |
| Poreuse capturée | Forme non sphérique (déformation basse fréquence forte), cavités sombres. |

La Phase 1 livre **trois familles** : rocheuse, glacée et volcanique. Les trois autres sont du paramétrage, sans
nouveau code de géométrie.

**Pourquoi le CPU plutôt que le vertex shader** : le relief doit pouvoir être interrogé par la future simulation
(altitude au survol, collisions de passage rasant). La même fonction `heightAt(dir)` sert donc au rendu et à la
physique, et elle est déterministe.

---

## 5. Instanciation des astéroïdes

- **Bibliothèque de 16 formes de base** générées hors ligne (Blender `bpy`, dans `tools/fronde/asteroids.py` :
  icosphère, bruit, booléens de cratères, décimation), exportées en **un seul glb meshopt** : `fronde_asteroids.glb`,
  avec 16 meshes × 3 LOD (≈ 1 500 / 300 / 60 triangles), un atlas de matériau et des normal maps partagées.
- **Variation par instance**, via des attributs `InstancedBufferAttribute` lus dans le shader : échelle non
  uniforme, axe et vitesse de rotation (rotation calculée **dans le vertex shader**, donc zéro coût CPU par image),
  teinte, albédo, poussière et température (face éclairée chaude, émissif léger pour les rochers proches de
  l'étoile).
- **Champ découpé en cellules** (grille 3D creuse). Chaque cellule tient 3 `InstancedMesh` par forme, un par LOD,
  remplis depuis la graine de la cellule. Frustum culling par cellule et choix du LOD par cellule selon la distance.
- **Au-delà du LOD2** : imposteurs `Points` (un sprite éclairé par astéroïde), puis une simple nappe de poussière.
- **Fragments satellites** : pour les instances LOD0 seulement, 0 à 3 cailloux en orbite locale.
- **Physique** (préparation de la Phase 3) : seule la cellule autour d'un racer expose ses rochers à
  `AsteroidField.queryNear(pos, r)`. Tout le reste est purement visuel.

Budget : environ 40 000 astéroïdes visibles en Haute sur ordinateur, 8 000 en Économe sur téléphone (§9).

---

## 6. Niveaux de détail

| Objet | LOD0 (rapproché) | LOD1 | LOD2 | Imposteur |
|---|---|---|---|---|
| Géante gazeuse | Shader complet + détail fin + atmosphère 8 échantillons | Cache seul + atmosphère | Cache 512 px, atmosphère simplifiée | Disque éclairé (sprite) au-delà de 4 px |
| Anneaux | Fragments instanciés + poussière + disque en fondu | Disque haute résolution | Disque 64 segments | Fondu dans l'imposteur de la planète |
| Lune | Quadtree cube-sphere (patches 33×33) + triplanaire | Mesh 2 000 triangles + normal map | 300 triangles | Sprite |
| Astéroïde | 1 500 triangles + satellites | 300 triangles | 60 triangles | Point |
| Racer | glb HD + panaches + traînée | glb LOD | Silhouette simplifiée + panache | Balise holographique (icône écran) |
| Étoile | Granulation + couronne + éruptions | Disque + couronne | Sprite + halo | Point |

**Critère commun : la taille à l'écran en pixels**, pas la distance brute. Les transitions se font par fondu
temporel (*dithering*) sur 250 ms et une hystérésis de ±15 % évite le papillotement. `SBPerf.level` décale tous les
seuils d'un cran par niveau et réduit les budgets d'instances.

---

## 7. Très grandes distances

Le problème : une géante de ~70 000 km de rayon, un racer de 30 m et un système de plusieurs UA représentent
**15 ordres de grandeur**. Le `float32` du GPU, avec un buffer de profondeur classique, n'y suffit pas.

1. **Unités de simulation en `float64` côté JS** (mètres, secondes). Les positions de tous les objets restent en
   `Float64Array` dans `WorldFrame` et ne sont jamais écrites telles quelles dans un `Object3D`.
2. **Origine flottante** : à chaque image, l'origine du rendu est la caméra (ou le racer suivi). Chaque objet reçoit
   `position_rendu = (position_monde − origine) × échelle_rendu`, calculé en `float64`, puis seulement converti.
   Plus aucune gigue au niveau du racer.
3. **Profondeur** : `logarithmicDepthBuffer: true` sur le renderer de la sandbox (ou le *reversed-Z* de r186 si le
   test le confirme sur iOS Safari). Le z-fighting disparaît entre le racer à 10 m et la planète à 10⁸ m.
4. **Rendu en couches** quand les écarts sont extrêmes : 1) fond cuit à l'infini, 2) corps lointains rendus à une
   **échelle réduite** sur une sphère de projection (même direction, même taille angulaire), 3) scène proche à
   l'échelle 1. La taille angulaire est conservée exactement : c'est invisible et la précision devient illimitée.
5. **Échelle visuelle adaptée** (brief §13) : en vue système, un facteur `exaggeration(d)` agrandit les petits corps
   pour la lisibilité. Il revient à 1 en vue cinématique, et cette valeur est transmise à toutes les mesures.
   La simulation garde toujours les vraies unités.
6. **Temps** : `float64` en secondes de course. Les shaders reçoivent un temps modulo une période (`t mod 3600 s`)
   pour ne pas perdre de précision dans les animations.

---

## 8. Caméras

| Caméra | Rôle | Détails |
|---|---|---|
| **Libre** | Exploration et tests | Orbite autour d'une cible sélectionnable (corps ou racer). Zoom logarithmique : la molette ou le pincement multiplie la distance. Tap ou clic sur un corps = transition vers lui (comme dans carte-v6). |
| **Cinématique automatique** | Prévisualise le futur *Telebyte Director* | Bibliothèque de plans paramétrés (*shots*) : `chase` (derrière le racer, ressort critique amorti), `flyby` (caméra fixe sur la trajectoire, le racer la traverse), `planetScale` (racer minuscule devant le limbe, longue focale), `ringSkim` (sous le plan des anneaux, contre-jour), `moonGraze` (basse altitude, horizon courbe), `nightSide` (terminateur, lumière rasante). Un séquenceur enchaîne les plans selon la position du racer sur la trajectoire, avec des coupes franches et quelques fondus. La focale est animée de 18 à 300 mm. |
| **Transition système ↔ rapproché** | Test n° 7, le zoom continu | Interpolation de la **distance en log** (`log d` linéaire dans le temps, avec accélération et freinage en douceur). La cible et la direction de visée sont interpolées par slerp, l'exagération d'échelle (§7.5) suit la distance, le champ de vision s'élargit légèrement à mi-parcours et un flou radial léger rend l'« effet de zoom accéléré » (carte-v6). |

Toutes les caméras produisent un état `{ position64, quat, fov }`, appliqué via `WorldFrame` : elles fonctionnent
aux deux échelles sans code particulier.

---

## 9. Performances visées

| Profil | Appareil de référence | Cible | Résolution | Budget |
|---|---|---|---|---|
| Haute | Ordinateur avec GPU intégré récent (Apple M1 / Iris Xe) | **60 i/s** | DPR natif plafonné à 2 | ≤ 400 appels de dessin, ≤ 1,5 M triangles, ≤ 350 Mo de mémoire GPU |
| Moyenne | iPhone 13 / Android haut de gamme 2023 | **60 i/s** | DPR 1,25 | ≤ 250 appels, ≤ 600 k triangles |
| Économe | Android milieu de gamme | **≥ 30 i/s** | DPR 1,0, sans MSAA, sans bloom | ≤ 150 appels, ≤ 300 k triangles |
| Minimale | Appareils faibles | ≥ 26 i/s (seuil `SBPerf`) | DPR 0,75 | Imposteurs partout au-delà du plan rapproché |

Autres budgets : chargement initial de la sandbox ≤ 6 Mo (glb meshopt + textures KTX2 si disponibles, sinon JPEG) ;
cuisson des géantes et des lunes ≤ 250 ms par corps dans un worker, sans bloquer l'affichage. Mesures : compteur
`SBPerf` + `renderer.info` affichés dans le DevPanel.

---

## 10. Ordre exact d'implémentation

Chaque étape se termine par une capture comparée (harnais Playwright) et une validation visuelle d'Adrien
avant l'étape suivante.

| # | Étape | Livrable vérifiable |
|---|---|---|
| 1 | **Squelette** : `sandbox/index.html`, shim SB3D (three r186), renderer à profondeur log, PostFX, DevPanel, `rng.js` | Page vide, 60 i/s, curseurs fonctionnels |
| 2 | **WorldFrame** (float64 + origine flottante) + **caméra libre** à zoom log + objets de test aux échelles 10 m / 10⁸ m | Zoom de 10 m à 1 UA sans gigue ni z-fighting |
| 3 | **Backdrop** (ciel cuit) + **Star** (lumière directionnelle, couronne) | Test 1 partiel (ciel + étoile) |
| 4 | **GasGiant v1** : bandes, rotation différentielle, éclairage, atmosphère de limbe | Géante ambre de jour et en contre-jour |
| 5 | **GasGiant v2** : tempêtes, cache cuit, aurores, éclairs + variantes bleue et noire | Les trois géantes côte à côte ; test 6 (côté nuit) |
| 6 | **RingSystem** disque + ombres croisées | Ombres visibles dans les deux sens |
| 7 | **Moon** : worker de relief, cube-sphere, quadtree LOD, trois familles | Test 3 (passage rasant) avec une caméra posée à la main |
| 8 | **AsteroidField** : glb des 16 formes, cellules, LOD, imposteurs | 40 k instances à 60 i/s sur ordinateur |
| 9 | **Fragments d'anneaux** + poussière + fondu disque ↔ fragments | Test 4 (traversée des anneaux) |
| 10 | **Racer témoin** (glb existant) + panache + traînée (méthode `ship3d.js`) | Test 2 (racer devant la géante) |
| 11 | **TrajectoryHolo** : trajectoire précalculée par une simple intégration Verlet (sans simulation de course) | Trajectoire qui contourne réellement la géante |
| 12 | **Caméra cinématique** + séquenceur de plans | Boucle de 60 s qui enchaîne les 7 tests |
| 13 | **Transition système ↔ rapproché** | Test 7 (zoom continu) |
| 14 | **LodManager** branché sur `SBPerf.level`, passe de performance sur téléphone | Tableau §9 rempli avec les mesures réelles |
| 15 | **Captures promotionnelles** des 7 tests (DSF 2) + revue | Validation de la Phase 1 |

---

## 11. Inventaire des fichiers

### À créer (dans ce dépôt, `catabyte-starbyte`)

```
docs/grande-fronde/
  PHASE1_PLAN_TECHNIQUE.md        ← ce document
sandbox/
  index.html                      page Race World Visual Sandbox
  lib/sb3d-shim.js                window.SB3D hors du jeu (three@0.186.0, mêmes addons)
  lib/rng.js                      _hashSeed + _mulberry32 (identiques au jeu)
  core/WorldFrame.js              float64, origine flottante, exagération d'échelle
  core/LodManager.js              taille écran, hystérésis, budgets SBPerf
  core/PostFX.js                  bloom / sortie ACES, selon le niveau de qualité
  bodies/Star.js
  bodies/GasGiant.js  + shaders/gasgiant.{vert,frag}.glsl + shaders/atmosphere.frag.glsl
  bodies/GasGiantBaker.js         cuisson du cache équirectangulaire par tranches
  bodies/RingSystem.js + shaders/rings.frag.glsl
  bodies/RingDebris.js            cellules polaires, fragments instanciés, poussière
  bodies/Moon.js + workers/moonRelief.worker.js
  bodies/AsteroidField.js + shaders/asteroid.vert.glsl
  scene/Backdrop.js               ciel cuit en cube
  scene/Racer.js                  glb + panache + traînée
  scene/TrajectoryHolo.js
  camera/FreeCamera.js
  camera/CinematicDirector.js     plans + séquenceur
  camera/ScaleTransition.js       zoom log système ↔ rapproché
  ui/DevPanel.js                  curseurs, préréglages, capture PNG
  presets/giants/{amber,blue,black}.json
  presets/moons/{rocky,icy,volcanic,metal,ocean,porous}.json
  presets/sandbox_system.json
  assets/fronde_asteroids.glb     généré
  assets/rock_fragments.glb       généré (anneaux)
tools/fronde/
  asteroids.py                    génération Blender (bpy) des 16 astéroïdes × 3 LOD
  ring_fragments.py
  shots.js                        captures Playwright des 7 tests (repris de tools/explore/lib.js)
```

### Lus, réutilisés, **non modifiés** (dépôt `starbyte`)

```
github_upload/assets/planet3d.js            window.SB3D (three r186 et addons)
github_upload/assets/perf.js                window.SBPerf (niveaux, interception des renderers)
github_upload/assets/meshopt_decoder.module.js
github_upload/assets/ship3d.js              méthode panache / bulle / caméra (racer)
github_upload/assets/station3d.js           méthode ciel cuit en cube
github_upload/assets/3d/sky/orbitsky.js     pré-compensation ACES, alignement du soleil
github_upload/assets/system3d.js            futur point d'entrée de la vue système (Phase 2)
github_upload/assets/spacemap.js            future couche « course » de la carte (Phase 2)
github_upload/assets/3d/sb_sr01_lod.glb, sb_ships_v3.glb   racer témoin
labo/carte-v6/index.html                    modèle UX du zoom multi-échelles
tools/explore/lib.js                        harnais Playwright / SwiftShader
github_upload/server/resolve-raids/*        modèle de fonction serveur + moteur partagé (§12)
```

### Intégration au jeu (après validation, pas en Phase 1)

`github_upload/assets/fronde/*` (copie des modules), une balise `<script type="module">` dans `index.html`, et
une entrée dans le service worker (`sw.js`) ou dans `tools/precache_list.py`. Tout ceci sera fait **plus tard, sur
demande explicite**.

---

## 12. Cadrage serveur (à ne pas implémenter en Phase 1)

La Grande Fronde exige **un serveur commun à tous les joueurs** : une seule course, un seul pot de paris, un moteur
qui tourne même quand personne n'est connecté. Le jeu repose déjà sur Supabase, et l'architecture proposée en
découle directement :

```
            ┌──────────────────────── Supabase (projet existant) ────────────────────────┐
            │                                                                             │
 pg_cron ──►│  Edge Function  race-tick  (Deno)                                           │
 (1 min)    │    └─ moteur de course partagé (copie générée, comme resolve-raids/engine.js)│
            │       physique Velocity Verlet, pas adaptatif, Event Engine à graine        │
            │    écrit : race_snapshots (état périodique), race_events (journal)          │
            │                                                                             │
            │  Edge Function  race-bet    : mise, verrouillage, contrôle du solde G.credits│
            │  RPC SQL       race_settle  : redistribution du pot, transaction unique,     │
            │                               idempotence (aucun double paiement)           │
            │                                                                             │
            │  Tables : race_editions (graine hachée, calendrier), race_racers,           │
            │           race_snapshots, race_events, race_pools, race_bets, race_payouts  │
            │  Realtime : diffusion des nouveaux snapshots / événements aux clients        │
            └─────────────────────────────────────────────────────────────────────────────┘
                     ▲ lecture seule (RLS)                    ▲ mises (JWT)
            Client Starbyte : carte de course, Télébyte, résumé de reconnexion
            (interpolation entre deux snapshots, rejeu local déterministe pour les ralentis)
```

Principes à respecter dès maintenant :

- **Le serveur est autoritaire.** Le client ne fait que lire, interpoler et rejouer. Les mises passent par une
  fonction qui vérifie le jeton et le solde, comme `resolve-raids` le fait aujourd'hui.
- **Un seul moteur de course, deux copies générées** (client pour les ralentis, serveur pour la vérité), sur le
  modèle de `tools/sync_combat_engine.py`. Ce moteur est **sans three.js** : il manipule des nombres purs. C'est
  pourquoi la Phase 1 sépare déjà les données des corps (`sandbox_system.json`, `heightAt`, `densityAt`,
  `queryNear`) du rendu.
- **Déterminisme et équité** : graine par édition, empreinte SHA-256 publiée avant le départ, graine révélée à
  l'arrivée, pas de calcul fixe et RNG `mulberry32` séquencé par tick.
- **Avance par lots** : chaque appel à `race-tick` fait avancer la course jusqu'à `now()`, en reprenant le dernier
  snapshot. Une panne de cron ne fausse donc rien, elle retarde seulement. Si la charge l'exige, un petit service
  Deno ou Node dédié (hors des limites de durée des Edge Functions) pourra prendre le relais **sans changer le
  moteur**.
- **Économie** : uniquement `G.credits`. Taxe de la Fédération et redistribution dans une transaction SQL unique.
  Aucun lien avec les tables `bm_*` du Blackmarket, qui relèvent de l'argent réel.

Cette partie sera détaillée au début de la Phase 3 (simulation), et les paris en Phase 6, conformément au brief.

---

## 13. Décisions d'Adrien (4 novembre 2026)

1. **La sandbox vit dans ce dépôt** : `catabyte-starbyte/sandbox/`.
2. **Racer témoin** : la frégate SR-01 (`sb_sr01_lod.glb`).
3. **Grande échelle** : vraie échelle physique (géante de 62 000 à 81 000 km de rayon, étoile à 5,2 UA). L'exagération
   des petits corps ne sert qu'à la lisibilité de la vue système.
4. **Seuil de performance minimal** : à décider plus tard.

## 14. Avancement

| Étape | État |
|---|---|
| 1. Squelette (page, shim SB3D r186, profondeur log, PostFX, panneau) | fait |
| 2. WorldFrame (float64, origine flottante) + caméra libre à zoom log | fait |
| 3. Ciel cuit + étoile | fait (le plan rapproché de l'étoile reste à travailler) |
| 4. Géante v1 (bandes, rotation différentielle, éclairage, limbe) | fait |
| 5. Géante v2 (tempêtes, aurores, éclairs, 3 variantes) | fait, **sauf** le cache cuit et le détail fin du plan rapproché |
| 6. Anneaux : disque + ombres croisées | fait |
| 7. Lunes : relief en Web Worker, cube-sphère, quadtree LOD, trois familles | fait (Kesh cratérisée, Ilva glacée, Oro volcanique ; `heightAt` / `altitudeAt` prêts pour la simulation) |
| 8. Champ d'astéroïdes : 16 formes × 3 LOD, instanciation GPU, cellules par niveau d'échelle, imposteurs | fait (formes générées en JavaScript déterministe au lieu de Blender, absent de l'environnement : aucun fichier à télécharger, mêmes formes côté serveur ; `rocksInCell` / `queryNear` prêts pour la simulation) |
| 9 à 15 | à faire |

Captures : `node tools/fronde/shots.js amber,blue,black` (serveur statique à la racine du dépôt sur le port 8766 ;
`THREE_DIR` pointe vers un `node_modules/three` 0.186.0 local si le CDN n'est pas joignable).
