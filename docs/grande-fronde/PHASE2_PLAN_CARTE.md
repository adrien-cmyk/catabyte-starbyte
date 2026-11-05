# La Grande Fronde — Phase 2 : carte de course

**Plan technique** · v0.1 · 5 novembre 2026 · fait suite à la Phase 1 (PR #1)

> Objectif du brief (§6, §14) : une couche dédiée sur la carte spatiale, avec trajectoires, positions, sélection d'un
> racer, classement et changements d'échelle. La carte de course réutilise le moteur et les assets de la carte
> spatiale de Starbyte, applique une couche de données propre à l'événement et ne duplique pas l'univers.
> Ni la simulation complète (Phase 3), ni Télébyte, ni les paris ne sont faits ici.

---

## 1. Ce qui existe

| Brique | Où | Rôle dans la carte de course |
|---|---|---|
| Plateau stratégique hexagonal | `starbyte/github_upload/assets/spacemap.js` | Point d'entrée du joueur : les systèmes traversés par la course y portent un repère, et un toucher ouvre la carte de course. **Aucune donnée nouvelle en sauvegarde**, comme le reste du plateau. |
| Diorama système | `starbyte/…/system3d.js` | Modèle de l'écran plein et du cycle de vie (`mount`, `_enter`, `leave`). |
| Plans d'existence (labo) | `starbyte/labo/carte-v6` | Modèle de navigation : plans imbriqués, zoom accéléré, étiquettes à taille constante. |
| Race World (Phase 1) | `catabyte-starbyte/sandbox/` | Vue système et vue racer : astres à vraie échelle, gravité, trajectoire holographique, caméras, zoom continu, LOD. |
| Moteur 3D partagé | `window.SB3D` (three r186), `SBPerf` | Aucune seconde copie de three.js ; la qualité automatique s'applique d'office. |

## 2. Les quatre niveaux de lecture (brief §6)

| Niveau | Contenu | Construit sur |
|---|---|---|
| **Vue univers** | Parcours général, systèmes traversés et à venir, position relative des concurrents, classement, temps avant le prochain événement | Nouveau : plateau de route (§4) |
| **Vue système** | Étoile, planètes, lunes, anneaux, astéroïdes ; trajectoires prévues et réelles ; fenêtres orbitales ; écarts | Race World de la Phase 1 + couche de course (§5) |
| **Vue racer** | Modèle 3D, caméra de suivi, vitesse, accélération, carburant, température, intégrité, prochain objectif | Race World + panneau de télémétrie (§6) |
| **Vue Télébyte** | Réalisation, commentaires, ralentis | Phase 5, hors de cette phase (la caméra cinématique de la Phase 1 en est l'ébauche) |

Passage d'un niveau à l'autre : **zoom continu** (le plan de la Phase 1, généralisé à univers → système → racer),
jamais d'écran de chargement entre deux échelles.

## 3. Données : un flux de course unique

La carte ne calcule rien elle-même : elle lit un **flux de course** (`RaceFeed`), qui a la même forme que le flux
serveur de la Phase 3.

```
RaceFeed
  edition   { id, nom, graineHachée, départ, arrivée, systèmes[], étapes[], pointsDeContrôle[] }
  racers[]  { id, nom, livrée, profil }
  stateAt(t)      → pour chaque racer : système, position/vitesse (float64), carburant, température, intégrité,
                    prochain point de contrôle, distance restante
  standingsAt(t)  → classement, écarts (temps estimé au prochain point de contrôle)
  plannedPath(racer, étape) / actualPath(racer, t0, t1)   → échantillons pour les tracés
  nextEvent(t)    → prochain point de contrôle ou grand passage gravitationnel
```

- **Phase 2 : flux local de démonstration** (`DemoFeed`). Quatre racers sur trois systèmes, trajectoires calculées
  avec `core/Gravity.js` (la gravité de la Phase 1), profils de vaisseau légèrement différents, sans événements ni
  incidents. L'horloge est réelle ou accélérée, et la course pilote se rejoue à l'identique (graine fixe).
- **Phase 3 : flux serveur** (`SupabaseFeed`). Instantanés et journal d'événements lus en lecture seule,
  interpolation entre deux instantanés. Même interface : la carte ne change pas.

## 4. Vue univers : le plateau de route

Les systèmes de la course sont des **systèmes réels de l'univers Starbyte** (adresses `amas-secteur-système`),
choisis par le Race Director. On n'en construit pas de copie : le plateau de route montre seulement le **parcours**.

- **Nœuds :** un nœud par système traversé, avec son étoile (couleur selon la température), sa planète maîtresse en
  miniature et son nom.
- **Étapes interstellaires :** un couloir de lumière très doux entre deux nœuds (le langage des lignes de convois
  de carte-v6), gradué par les points de contrôle. Le voyage interstellaire est fictif (brief §7) et s'affiche en
  durée.
- **Racers :** des marqueurs à la livrée de chacun, placés au prorata de l'étape. Un toucher sélectionne le racer
  et le met en évidence partout.
- **Panneau de classement :** rang, écart et état de chaque racer (en voyage, en approche, en passage
  gravitationnel), plus le compte à rebours du prochain événement.
- **Rendu :** le moteur et la caméra de la carte spatiale (vue quasi isométrique, `MapControls`, bloom), avec les
  parcelles du kit `sb_kit.glb` en sol du plateau, pour rester dans le langage visuel du jeu.
- **Entrée depuis le jeu :** sur le plateau stratégique, les systèmes de la course portent un liseré d'événement.
  Les toucher ouvre la carte de course sur ce système.

## 5. Vue système : la couche de course sur le Race World

- **Tous les racers** du système, avec leur traînée et leur balise holographique quand ils sont trop petits.
- **Trajectoire prévue :** le trait holographique de la Phase 1, à la couleur du racer sélectionné et discret pour
  les autres.
- **Trajectoire réelle :** ce qui a été parcouru, en trait plein estompé. L'écart avec le prévu se lit d'un coup
  d'œil.
- **Fenêtres orbitales :** les couloirs de passage possibles autour des grands corps (périapse visée, raccourci par
  les anneaux), dessinés comme des portes graduées, avec la densité d'anneau (`densityAt`) comme indice de risque.
- **Écarts :** entre deux racers, en temps au prochain point de contrôle, affichés sur la trajectoire.
- **Lisibilité :** agrandissement des petits corps en vue d'ensemble (Phase 1), étiquettes à taille constante.

## 6. Vue racer

- Caméra de suivi (la poursuite amortie de la Phase 1), ou caméra libre autour du racer.
- **Télémétrie** en panneau sobre (brief §17 : interfaces holographiques précises, pas de néon décoratif) : vitesse,
  accélération (en g), carburant, température, intégrité, prochain objectif et distance, position au classement.
- Changement de racer d'un geste, avec transition de caméra.

## 7. Où on construit

1. **Dans ce dépôt d'abord** (`catabyte-starbyte/race-map/`), sur les modules de la sandbox, pour itérer sans
   toucher au jeu.
2. **Intégration dans le jeu** (`starbyte/github_upload/assets/fronde/`, liseré sur le plateau stratégique) après
   validation, et sur demande explicite, comme pour la Phase 1.

## 8. Ordre d'implémentation

| # | Étape | Livrable vérifiable |
|---|---|---|
| 1 | `RaceFeed` + `DemoFeed` (4 racers, 3 systèmes, trajectoires Verlet) | Classement et positions qui évoluent avec l'horloge, même course à chaque lecture |
| 2 | Deux systèmes de plus pour la course pilote (étoile, géante ou planète maîtresse, lunes, anneaux ou champ) | Trois systèmes distincts, construits avec la bibliothèque de la Phase 1 |
| 3 | Quatre racers reconnaissables (silhouette, livrée, signature lumineuse ; châssis partagés du jeu) | Les quatre côte à côte |
| 4 | Vue univers : plateau de route, étapes, marqueurs, classement | Capture du parcours en cours de course |
| 5 | Vue système : couche multi-racers, prévu / réel, écarts | Capture de deux racers en lutte autour de la géante |
| 6 | Fenêtres orbitales | Portes de passage et risque d'anneau lisibles |
| 7 | Vue racer : télémétrie, sélection | Capture du panneau |
| 8 | Zoom continu univers → système → racer | Plan sans coupure |
| 9 | Passe téléphone (LOD, 60 i/s) + captures de validation | Mesures et captures |

## 9. Décisions d'Adrien (5 novembre 2026)

1. **Vrais systèmes de l'univers Starbyte**, mais **pas d'ajout sur la carte stratégique** du jeu, déjà chargée
   d'informations. La course a sa propre vue, **l'écran Télébyte** (la télé de la course), qui n'affiche que la course.
   Le liseré prévu au §4 sur le plateau stratégique est donc abandonné. L'entrée se fera par Télébyte.
2. **Vue univers en plans d'existence** (langage de labo/carte-v6).
3. **Racers : vaisseaux du jeu en livrée de course** (SR-01, KV-01, TK-07). Le quatrième est à confirmer, par exemple
   un vaisseau « sport » du Blackmarket (Le Fulgurant), ce qui est une décision commerciale.
4. **Flux de démonstration accéléré**, avec un curseur de temps.

## 10. Avancement

| Étape | État |
|---|---|
| 1. `RaceFeed` + `DemoFeed` | fait : `sandbox/race/` (JavaScript pur, réutilisable côté serveur). Course pilote de 72 h 37 sur Kerath, Vessa et Nox, 11 points de contrôle identiques pour tous, 4 racers aux profils distincts. Arrivée serrée : La Mule devant Le Fulgurant (8 min), Sentinelle à 86 min, Kerath Lourd à 3 h 37. Le classement n'utilise que les passages déjà faits (équité des paris). Démo console : `node tools/fronde/race_demo.mjs`. |
| 2. Systèmes Vessa et Nox | fait : bascule de système dans la sandbox (étoile et distance, direction du soleil, reflets, géante et anneaux, lunes et leurs vues, cibles) à partir de `race/raceData.js`. Vessa : géante bleue, étoile blanche à 9,5 UA, Tirn et Saël. Nox : géante noire, naine rouge à 0,9 UA, Cendre. Kerath garde l'éclairage validé en Phase 1. |
| 3. Quatre racers reconnaissables | fait : `scene/racerProfiles.js`. Sentinelle (SR-01, 72 m, rouge et blanc, ions bleus), Kerath Lourd (KV-01, 1,3 km, accents bleus, six tuyères), La Mule (TK-07, 29 m, coque verte, chimique orangé), Le Fulgurant (Blackmarket, 635 m, jaune, panaches or). Tuyères repérées sur le matériau moteur ou reprises de ship3d.js ; traînée à la livrée et à l'échelle du vaisseau ; décompression des .glb.gz du Blackmarket. Vues « Les quatre racers » et une vue par racer. |
| 4. Vue univers (écran Télébyte) | fait : `telebyte/` (page à part, ne lit que le flux de course). Nébuleuse et systèmes en plans d'existence, boucle de fronde par système (entrée → périapse → sortie), couloirs interstellaires, racers placés d'après le flux, classement en direct (rang, écart, état), prochain événement, horloge de course (×60 / ×600 / ×3600, curseur), sélection d'un racer (caméra qui le suit, télémétrie). Mise en page téléphone : classement en bas. Captures : `node tools/fronde/tb_shots.js`. |
| 5. Vue système de course | fait : `sandbox/race/RaceLayer.js` (mode course de la sandbox, `#course`). Les quatre racers à leur position du flux dans le système affiché (poussée comprise), trajectoire de chacun à sa livrée (vive pour le racer suivi), étiquettes rang · écart au précédent · vitesse, panneau de course (système, temps, classement, curseur, vitesse, « aller à son arrivée », retour vers Télébyte). Depuis Télébyte : toucher un système, ou « Vue système » sur un racer suivi ; l'instant et le racer suivi passent dans les deux sens. |
| 6. Fenêtres orbitales | fait : `sandbox/race/OrbitalWindows.js`. Porte de périapse (jauge radiale à l'azimut des périapses réelles : rasante < 1,08 R, classique, sûre > 1,22 R ; une marque par racer) et porte des anneaux (bande dans le plan des anneaux au point de traversée, colorée selon `densityAt` : divisions = raccourcis, zones denses = risque ; une marque par racer). Panneau : périapse (R, altitude, risque) et traversée (rayon, densité, risque) du racer suivi. Vue « Course · fenêtres orbitales ». |
| 7. Vue racer (télémétrie, caméra de course) | fait, après l'essai d'Adrien sur iPhone : bouton « Suivre » = caméra de course basse derrière le racer, qui traîne dans les virages, focale qui s'ouvre avec la vitesse, vibration à la poussée de périapse, stries de poussière à la vitesse perçue (`scene/SpeedLines.js`) ; piste lumineuse (traînée en temps d'écran, à la livrée, plus large et plus vive) et panache allongé en course ; télémétrie dans le panneau (rang, écart, vitesse, accélération, poussée, température, carburant, intégrité, prochain objectif). Correctifs du même essai : panneau qu'on ne pouvait plus toucher aux vitesses rapides (liste reconstruite à chaque image), étiquettes qui clignotaient (empilement dans l'ordre du classement, amorti), tracés à coins (rééchantillonnage fin le long de l'intégration), vue Ensemble qui suit le peloton. |
| 7 bis | fait | Retour iPhone : en vue suivre sur téléphone, le centre de l'image remonte au-dessus du panneau (`setViewOffset`), télémétrie compacte, étiquette du racer suivi et des portes masquées, caméra de poursuite de trois quarts (coque visible, pas seulement la plume). Télébyte : la route est une seule courbe Catmull-Rom centripète entrée → périapse → sortie par système, périapse à l'intérieur du virage (plus de crochet). |
| 7 ter | fait | Vue suivre : panache du racer suivi atténué et bloom très sélectif (la coque n'est plus noyée dans le halo). Télébyte : boutons d'étapes (un par système, avec l'heure du premier passage à la périapse) qui ouvrent la vue système 30 min avant ; « voir en 3D » sous chaque système ; cadrage portrait élargi (Kerath n'est plus coupé sur téléphone). |
| 8 à 9 | à faire |
