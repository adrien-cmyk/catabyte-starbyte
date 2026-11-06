---
name: intelligence-cinematique
description: Concevoir, écrire et vérifier un plan 3D de la Grande Fronde (Télébyte, telebyte/plans3d) — un fait de course (dépassement, éruption, panne, choc, réparation, surchauffe, lune, arrivée, ou un nouveau) mis en scène en quelques secondes, lisible sans commentaire sur un téléphone en portrait. À utiliser avant de créer ou de retoucher un plan, une caméra, un effet du décor ou le lecteur des plans.
---

# Intelligence cinématique · plans 3D de la Grande Fronde

Un plan 3D est une **parenthèse de 4 à 6 s** qui rejoue un fait déjà arrivé, puis rend la main au schéma (la vue
maîtresse). Ces règles viennent des retours d'Adrien sur les premières versions : elles priment sur l'envie de
« faire du cinéma ».

## 1. Ce qui marche (et ce qui a été refusé)

- **Un seul point de vue, concret.** Un plan = une idée qu'on comprend en une seconde. Refusé : les séquences en
  cinq actes avec feintes et changements de caméra (« c'est un peu nul »). Accepté : « un dépassement qu'on voit à
  peine et juste un close-up ».
- **On sent plus qu'on ne voit.** Le passage d'un vaisseau dure 0,3 s à l'écran ; l'avant (la lueur qui monte sur une
  coque) et l'après (le trait de flamme qui s'éloigne, la secousse) racontent le fait.
- **Caméra posée ou presque.** Fixe (éruption, arrivée, lune), collée à un détail (réacteurs, flanc, point de soudure),
  ou qui « cherche » le sujet avec un léger retard. Pas de travelling acrobatique, pas de tonneau gratuit.
- **Le concret du fait.** Éruption : la caméra reste sur place, le vaisseau ralentit dans un brouillard solaire.
  Panne : vue sur les réacteurs qui crachotent puis s'éteignent. Choc : la roche arrive, frappe, éclats. Chaque plan
  doit montrer LA chose que le titre annonce.
- **Le vaisseau doit se lire.** Jamais « dressé » dans l'écran : regarder une coque de trop près et dans sa longueur
  la fait paraître à l'envers ou debout. Préférer le trois quarts (avant ou arrière), un peu à l'écart du flanc.
- **Pas de ralenti décoratif** ; un très court ralenti seulement si l'image l'exige (ce qu'on veut faire remarquer).

## 2. Règles de fond (non négociables)

- **Données réelles, mise en scène assumée.** Qui, quoi, rang avant/après, coque, carburant, temps perdu : lus dans le
  flux (`feed.stateAt`, `feed.standingsAt`, `event.data`). Les distances et trajectoires sont mises en scène (dans les
  données, un dépassement est un ordre de passage à un point de contrôle, à des milliers de km).
- **Rien d'avance.** Le plan ne montre que le fait revu et ce qui l'a précédé ; jamais un incident à venir.
- **Déterministe.** Hasard initialisé avec `event.key` (rngOf) ; mouvements intégrés à pas fixes (`pathOf`) ; aucun
  `Math.random`, aucune horloge de course. Le même fait donne le même plan sur tous les écrans.
- **Temps d'écran.** Le plan se joue à vitesse normale, quelle que soit la vitesse de la course (×1 en vrai, ×600 en
  essai). La course dure 72 h en temps réel.
- **Vraies dimensions** (1 unité = 1 m) : Racer 07 ≈ 35 m, Fulgur 07 ≈ 100 m, Bidon 52 ≈ 47 m, Monoreactor 88 ≈ 14 m.
  Toute distance de caméra se calcule à partir de `ship.userData.len` / `half`, jamais en dur.
- **Volumes.** Aucune coque ne traverse une autre ni la caméra (le lecteur repousse la caméra hors des boîtes ;
  pour deux vaisseaux, vérifier les recouvrements comme dans `overtake.js` / l'outil d'essai).
- **Décor cohérent.** Entre deux étoiles (éruption, panne, choc, réparation) : pas de géante (`fx.giant(false)`).
  Dans un système : la géante et ses anneaux à l'horizon. Débris d'anneau pour la vitesse (`fx.rocks`).
- **Interface.** Bandeau réduit pendant le moment critique (`hideCard`) ; une seule information d'accent. Pas d'emoji
  (icônes SVG de `telebyte/icons.js`), Space Grotesk + JetBrains Mono, cyan réservé à la navigation (« Passer »).

## 3. Écrire un plan

Un plan à un vaisseau vit dans `telebyte/plans3d/events.js` (le dépassement a son fichier, `overtake.js`). Contrat lu
par `player.js` :

```
{ ships: [racerId], duration, giant, puffs: [[i, dir, t0, durée]], cues: [{ τ, id }],
  setup([ship]) { /* dimensions réelles */ },
  frame(τ, { ships, cam, fx, dt, THREE }) { /* place, poussée, effets, caméra */ return 'idDuPlan'; },
  hud(τ) → { title, racer, pos, note, integrity, fuel, hideCard, done },
  audio(τ) → { rumble, hz, vib }, speed(τ) → vitesse du défilement des débris }
```

Outils du vaisseau (`ship.userData`) : `thrust(v, τ)` (flamme bleue à cœur blanc, lumière sur la coque), `puff(dir, k)`
(left, right, up, down, front), `heat(k)`, `lights(k)`, `nozzles`, `len`, `half`.
Effets du décor (`fx`) : `wind.set(k, cam, dt)` (tempête solaire), `sparks.emit(p, n, vitesse, dir, couleur)` /
`sparks.size(s)`, `flash.set(p, k, taille, couleur)`, `rock.set(p, r)` / `rock.burst(p, n, v, s)`, `moon.set(c, r)`,
`gate.set(c, r, k)`, `rocks(on)`, `giant(on)`. Brancher le nouveau type dans `SCRIPTS` (events.js) et `IN3D` (main.js),
ajouter une phrase d'ouverture au commentateur (`OPEN`).

## 4. Vérifier (obligatoire avant de montrer)

1. `node --check` sur les fichiers touchés.
2. Images figées au format iPhone (390 × 844) : `tools/fronde/plans3d_preview.html?k=<type>&n=0&freeze=<τ>` (voir
   `ev_shot.js` dans les essais de la session, ou écrire l'équivalent) ; 4 à 6 instants par plan, assemblés en planche.
   Regarder : le sujet est-il entier et lisible ? se lit-il dans le bon sens ? le fait annoncé se voit-il ?
   Le décor est-il cohérent (géante ou non) ? rien ne déborde sous le bandeau ?
3. Le banc `tools/fronde/plans3d_models.html` montre l'orientation des modèles (proue +z, dessus +y).
4. Essai complet dans le Télébyte : `tools/fronde/ui_plans3d.js` (Revoir → plan → Passer → retour juste après le fait).
5. Publier sur la démo (artefact Télébyte), jamais sur le jeu sans le « mets en ligne » d'Adrien. Lancer un seul
   navigateur à la fois (mémoire du conteneur).

## 5. Pièges déjà rencontrés

- Commentaire `// …` collé devant du code sur la même ligne : il avale le code (`node --check` ne le voit pas
  toujours). Mettre les commentaires en fin de ligne, après le `;`.
- Éclair ou étincelles trop gros près de la caméra : tout l'écran blanchit. Tailles relatives à la distance.
- Chaleur de coque trop forte : la livrée disparaît sous un aplat. Rougeoiement, pas peinture.
- En portrait, le champ horizontal est étroit : un vaisseau vu de profil sort du cadre ; un petit vaisseau à côté d'un
  grand disparaît. Cadrer pour le sujet du fait, accepter que l'autre soit partiel.
