# Télébyte · Plans 3D des moments forts (GDD, étape 1 : diagnostic)

> La vue schématique reste la vue maîtresse. Un plan 3D est une parenthèse de 8 à 12 s, façon réalisation F1, qui
> rejoue un moment fort déjà arrivé, puis rend la main au schéma. Aucune nouvelle simulation : la 3D met en scène les
> données existantes, de façon déterministe (même événement = même plan, sur tous les écrans).

## 1. L'existant

### 1.1 Les moments forts

La chronologie est construite dans `telebyte/timeline.js` (`buildTimeline(feed)`), à partir de ce que le flux a déjà
révélé. Chaque fait a la même forme :

```
{ t, kind, racer, sys, prio, data, key }
```

- `t` : instant de course (s depuis le départ).
- `racer` : identifiant du vaisseau.
- `sys` : système de l'étape ; pour un fait d'étape interstellaire, c'est le système d'arrivée.
- `prio` : priorité de 1 à 5.
- `key` : identifiant stable (`kind|racer|sys|t`), qui servira de graine au plan.

| kind | Où | data | Origine |
|---|---|---|---|
| `overtake` | point de contrôle d'un système (entrée, anneaux, périapse, sortie) | `rank`, `passed[]` (vaisseaux doublés), `lead` | déduit du classement |
| `plan` | entrée dans un système | `plan` (plongée / classique / prudente), `last` | plan publié |
| `ring`, `periapsis`, `exit` | système | `r`, `v` (m/s), `g`, `vOut` | trajectoire du moteur |
| `failed` (surchauffe), `damage` | système | `dmg` | moteur |
| `moon` | système | `moon`, `gain` (m/s), `dmg`, `d` (km), `integrity` | moteur v2 |
| `belt`, `beltHit`, `failure`, `repair`, `flare` | étape interstellaire | `gain`, `dmg`, `lost` (s), `prudent`, `integrity` | moteur v2 |
| `fuel`, `finale`, `finish`, `start` | — | `fuel`, `place` | déduit |

Le moteur v2 range ses faits dans `tracks[id].happenings`, et ils sont repris dans la chronologie. Les décisions
sont dans les plans publiés, ce qui rend le rejeu identique partout.

Pour chaque instant, on dispose aussi de l'état des vaisseaux via `feed.stateAt(id, t)` (phase, vitesse, carburant,
coque, position dans le système) et du classement via `feed.standingsAt(t)` (rang, écart). Pour les passages en
système, `feed.tracks[id].segs` contient les échantillons de trajectoire (positions et vitesses).

**Point important :** un dépassement n'existe dans les données qu'**à un point de contrôle dans un système**. Il
traduit un ordre de passage, souvent à quelques minutes d'écart. Les deux vaisseaux sont alors en réalité à des
milliers de kilomètres l'un de l'autre. Le plan 3D doit donc **mettre en scène** cet ordre : les vaisseaux sont
rapprochés, l'écart réel est converti en distance à l'écran. Il ne peut pas reproduire les positions réelles.
Pendant les étapes interstellaires, il n'y a aucun dépassement dans les données (ce que montre le couloir n'est
qu'une projection).

### 1.2 « Revoir » et la régie

- **« Revoir »** (`telebyte/news.js` puis `replay()` dans `telebyte/main.js`) : l'horloge recule un peu avant le fait,
  puis la vue s'ouvre selon le cas.
  - Fait en système : on entre dans la vue système (iframe `sandbox/`), sur le vaisseau concerné.
  - Fait d'étape : on ouvre le couloir.
- **La régie** (`telebyte/director.js`) note les cibles possibles toutes les images et choisit le plan :
  - un passage qui approche dans un système : vue système en poursuite ;
  - une étape en cours : le couloir ;
  - sinon : la vue d'ensemble.

  Elle déclenche aussi un ralenti dans la vue système, et se met en pause quand le joueur touche l'écran. Elle
  n'anticipe jamais un incident à venir.

### 1.3 Les modèles glTF

Ils sont dans `sandbox/assets/` et sont déjà utilisés par la vue système (`sandbox/scene/Racer.js`,
`racerProfiles.js`). Aucun n'a de texture : les matériaux sont des couleurs PBR. Tous utilisent l'extension
`KHR_materials_emissive_strength`.

| Vaisseau | Fichier | Poids (fichier livré) | Poids décompressé | Triangles | Matériaux |
|---|---|---|---|---|---|
| Sentinelle (SR-01) | sb_sr01_lod.glb | 1,18 Mo | 1,18 Mo | 19 945 | 11 |
| Kerath Lourd (KV-01) | sb_kv01_lod.glb | 1,32 Mo | 1,32 Mo | 18 906 | 10 |
| La Mule (TK-07) | sb_tk07_lod.glb | 0,70 Mo | 0,70 Mo | 19 997 | 7 |
| Le Fulgurant | fulgurant.glb.gz | 2,78 Mo (gzip) | 6,16 Mo | **147 109** | 13 |

- **Réutilisables tels quels :** les trois premiers, à environ 20 000 triangles chacun.
- **Le Fulgurant est trop lourd** pour viser 60 images/s sur iPhone. Il faut une version allégée, d'environ
  15 000 triangles.
- **Côté matériaux** : rugosité de 0,12 à 0,52, métal de 0 à 0,9. Ils ont l'air brillants si la scène a une carte
  d'environnement, ce que fait la vue système (PMREM). Sans elle, ils paraissent mats.

## 2. Architecture proposée : le module « plan 3D »

```
telebyte/shots/
  ShotPlayer.js     un seul lecteur, créé au premier plan ; une toile WebGL plein écran au-dessus du schéma
  stage.js          décor commun : fond d'espace profond, éclairage, carte d'environnement, vaisseaux, panaches
  scripts/
    overtake.js     scénario du dépassement (étape 2)
    flare.js, failure.js, belt.js, entry.js      (étape 3)
  hud.js            bandeau (DOM) : nom, position, écart, coque, carburant
tools/fronde/make_shot_models.mjs   modèles allégés pour les plans (une fois, hors ligne)
```

### Le contrat d'un scénario

Un scénario est une fonction pure. Elle reçoit le fait et un contexte de lecture seule, et rend une séquence :

```
script(event, ctx) → { duration, actors: [...], shots: [...], hud: [...] }
```

- **Entrée** : le fait de la chronologie, et `ctx = { feed, E, racer }` en lecture seule.
- **duration** : 8 à 12 s.
- **actors** : pour chaque vaisseau, son modèle, sa livrée et sa trajectoire de mise en scène `pos(u)` / `dir(u)`,
  avec `u` de 0 à 1.
- **shots** : les plans de caméra, `{ from, to, cam: (u) → { pos, look, fov, roll } }`.
- **hud** : les bandeaux et leur contenu à chaque instant.

**Déterminisme** :
- Les valeurs (écart, vitesses, coque, carburant, rang avant et après) viennent du flux, à l'instant du fait.
- La petite part de variation (tremblement de caméra, côté du dépassement) est tirée d'un hasard initialisé avec
  `event.key`.
- Aucun `Math.random`, aucune horloge de course : le même fait donne toujours le même plan.

**Temps** : le lecteur avance en temps réel (`u = temps écoulé / durée`), sans lien avec la vitesse de la course
(×1 en vrai, ×600 en test). Pendant le plan :
- en revoir, l'horloge du schéma est figée ;
- en direct, l'horloge continue. À la fin, on revient au schéma à l'instant présent (direct) ou juste après le fait
  (revoir).

### Rendu, pensé pour l'iPhone

**Lecteur et mémoire**
- Un seul lecteur et une seule scène.
- Les modèles des deux vaisseaux du plan sont chargés à la demande, puis gardés en cache (4 modèles allégés au
  plus).
- Tout le reste est libéré à la fin du plan.
- Le schéma (`UniverseView`) cesse de se dessiner pendant le plan.

**Décor**
- Fond d'espace profond : coupole d'étoiles et nébuleuse en dégradé, reprises du shader d'étoiles de la vue univers.
- Aucune planète (le fond planète est réservé à l'orbite).

**Matériaux brillants**
- Matériau physique avec vernis (`clearcoat` 0,8–1, rugosité du vernis 0,08–0,15).
- Métal et rugosité d'origine, rugosité bornée à 0,35 au plus.
- Carte d'environnement PMREM générée une fois à partir d'un « studio spatial » : deux bandes lumineuses et une
  étoile.
- Peinture de course selon la livrée (même règle de peinture que `racerProfiles.js`).

**Éclairage et effets**
- Une étoile directionnelle chaude et un contre-jour froid.
- Panaches additifs (repris de `Racer.js`) et traits de vitesse.
- Pas d'ombres portées ni de post-traitement lourd. Les halos sont des sprites additifs.

**Budget**
- Au plus 40 000 triangles à l'écran et 3 appels de rendu par vaisseau (matériaux fusionnés par couleur dans les
  modèles allégés).
- Densité de pixels plafonnée à 2, abaissée à 1,5 puis 1 si on passe sous 50 images/s.

**Modèles allégés**
- Script hors ligne avec glTF-Transform et meshoptimizer : simplification, fusion des matériaux identiques,
  quantification, gzip.
- Cibles : 8 000 à 15 000 triangles et moins de 500 Ko par vaisseau.
- Fichiers `*_shot.glb.gz` à côté des modèles actuels. Les modèles de la vue système ne changent pas.

### Bandeau et interface

- **Bandeau** en DOM, au-dessus de la toile : nom du vaisseau, position (P2 → P1), écart, coque et carburant (jauges),
  et le fait (« Dépassement à la périapse de Vessa »).
- **Commandes** : un bouton « Passer », et toucher l'écran passe aussi au schéma. Le bouton de navigation est le seul
  élément cyan.
- **Règles appliquées** : Space Grotesk (texte) et JetBrains Mono (chiffres), chargées depuis Google Fonts ; aucun
  emoji, icônes en SVG ; cyan réservé à la navigation ; accents ambre (fait) et rouge (avarie).

### Déclenchement

- **Étape 2** : « Revoir » d'un dépassement uniquement. Les autres faits gardent leur « Revoir » actuel (vue système
  ou couloir).
- **Étape 3** :
  - les autres scénarios, avec la même entrée ;
  - **la régie** peut lancer un plan sur un fait de priorité ≥ 4 qui vient de se produire (jamais avant) ;
  - **« Résumé depuis ta dernière visite »** : les faits de priorité ≥ 4 manqués (instant mémorisé localement à la
    fermeture) sont enchaînés à l'ouverture, avec un bouton « Passer le résumé » ;
  - **« Suivre » en 3D** : une caméra embarquée d'ambiance permanente sur un vaisseau, avec télémétrie, qui bascule
    sur le scénario quand un fait le concerne.

## 3. Prototype de l'étape 2 : le dépassement, environ 10 s

| Temps | Plan | Contenu |
|---|---|---|
| 0 – 0,6 s | fondu depuis le schéma | bandeau « Dépassement · [système] · [point de contrôle] » |
| 0,6 – 4,5 s | **embarquée sur le poursuivant** | derrière et au-dessus de son cockpit ; le premier devant, de plus en plus proche (l'écart converti en distance) ; traits de vitesse ; bandeau du poursuivant |
| 4,5 – 8 s | **plan extérieur au passage** | caméra fixe sur le côté, longue focale, qui pivote pendant le passage ; léger ralenti entre 5,5 et 7 s |
| 8 – 9,5 s | plan arrière | le nouvel ordre ; le bandeau passe à « P2 → P1 » et au nouvel écart |
| 9,5 – 10 s | fondu | retour au schéma, juste après le fait |

**Données utilisées :**
- vaisseaux : `data.passed[0]` (le premier doublé) et `racer` (le poursuivant) ;
- rang : `data.rank` ;
- écart avant et après : temps de passage aux points de contrôle des deux vaisseaux ;
- vitesses : échantillons de trajectoire à `t` ;
- coque et carburant : `stateAt` ;
- côté du dépassement : hasard initialisé avec `key`.

**Ce que je te montrerai avant toute mise en ligne :** une page d'aperçu (démo hors ligne) avec un bouton
« Revoir » sur les dépassements, des captures et une courte vidéo, et la mesure d'images par seconde.

## 4. À valider

1. **Le dépassement mis en scène** : vaisseaux rapprochés, écart réel converti en distance à l'écran (les vraies
   positions sont trop éloignées pour un plan). D'accord ?
2. **Fond d'espace profond** même quand le dépassement a lieu dans un système, à l'anneau ou à la périapse : la
   planète n'apparaît pas. D'accord ?
3. **Version allégée du Fulgurant** (147 000 → environ 15 000 triangles), réservée aux plans 3D. La vue système garde
   l'original.
4. **Mise en conformité de l'interface actuelle** avec tes règles :
   - remplacer les emoji (boutons TV et voix, icônes du fil et du couloir) par des SVG ;
   - passer au couple Space Grotesk + JetBrains Mono ;
   - revoir l'usage du cyan (aujourd'hui aussi sur les tracés et les sélections).

   Je propose de la faire avec l'étape 2, sur tout le Télébyte. Ou seulement pour les nouveaux éléments ?
