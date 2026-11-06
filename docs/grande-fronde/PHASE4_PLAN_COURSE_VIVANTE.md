# Grande Fronde · Phase 4 : la course vivante

> Constat de la course d'essai : la course se résume à des passages de portes autour de trois planètes. Rien ne se
> passe pendant les étapes interstellaires, et le joueur n'a aucune raison de regarder la trajectoire. Cette phase
> donne à la course des événements, des voyages qu'on peut regarder, un fil d'actualité, un réalisateur et une
> voix off de stade.

## Les règles qui ne bougent pas

- **Équité.** Tout ce qui change le résultat (rasants, raccourcis, avaries, carburant) sort du moteur déterministe,
  à partir de la graine tenue secrète. Le serveur et les écrans calculent la même chose. Rien n'est révélé avant
  l'heure : un événement apparaît avec le plan qui le contient, comme les trajectoires aujourd'hui.
- **Ce qui ne change pas le résultat** (voix off, faits divers, réalisateur, fil) est calculé sur l'écran, à partir
  de ce qui est déjà révélé. Ça peut évoluer sans toucher au serveur.
- **Version du moteur.** Chaque édition note l'empreinte du moteur qui l'a simulée (colonne `engine`). Le nouveau
  moteur sera ajouté à côté de l'ancien, et l'écran choisira la version d'après l'édition. On peut donc mettre en
  ligne à tout moment sans casser une course en cours ou déjà annoncée.
  - Attention : la prochaine édition (29 novembre) sera créée dès l'arrivée de celle du 8 novembre, vers le
    mercredi 11. Pour qu'elle ait les événements, le moteur doit être en ligne avant. Sinon, ce sera l'édition
    du 20 décembre.

## A. Événements de course (moteur, serveur)

Chaque événement a une probabilité tirée de la graine, un effet chiffré (temps, Δv, intégrité de la coque,
carburant), et surtout **une zone visible sur la carte avant la course**. C'est ce qui donne au joueur une raison
de regarder la trajectoire : « le Fulgurant va-t-il tenter le champ d'astéroïdes ? ».

| Événement | Où | Choix du pilote | Gain | Risque |
|---|---|---|---|---|
| Rasant de lune (assistance de Kesh) | lunes des géantes | passer à quelques rayons de la lune | Δv gratuit | impact de débris, avarie |
| Raccourci par champ d'astéroïdes | entre deux systèmes | couper par la ceinture | étape plus courte | chocs : coque abîmée, réparation |
| Débris d'anneaux | périapse basse d'une géante à anneaux | plonger sous les anneaux | Oberth plus fort | traversée du plan des anneaux |
| Éruption stellaire | une étape interstellaire, au hasard | se protéger (ralentir) ou foncer | aucun, ou temps gagné | boucliers, panne de propulsion |
| Avarie et réparation | n'importe où | réparer tout de suite ou continuer | temps gagné en continuant | aggravation, abandon possible |
| Carburant | toute la course | brûler fort ou économiser | vitesse | panne sèche avant la finale |
| Duel et dépassement | partout | (aucun, déduit du classement) | — | — |

- Les pilotes décident selon leur caractère (prudente, classique, plongée) et leur état (coque, carburant).
- Les décisions et les tirages entrent dans l'empreinte (`digest`) : le serveur peut prouver qu'il n'a rien
  changé.
- Équilibre vérifié sur 40 éditions, comme aujourd'hui : aucun vaisseau ne doit gagner plus de 40 %, et chaque
  événement doit parfois gagner et parfois coûter la course.

## B. Étapes interstellaires qu'on peut regarder

Aujourd'hui, entre deux systèmes, la vue système n'a rien à montrer : les vues Ensemble et Suivre ne marchent pas.

- **Vue couloir.** L'étape comme une piste : départ à gauche, arrivée à droite, les vaisseaux en jetons qui
  avancent, l'écart en temps, la vitesse, le carburant, et les zones de danger le long du trajet (ceinture,
  éruption).
- **Suivre** pendant une étape : le vaisseau dans le vide, avec un fond d'étoiles qui défile, sa télémétrie et
  la distance qui reste.
- **Ensemble** pendant une étape : le couloir entier.

## C. Fil d'actualité du Télébyte

- Bandeau « dernière minute » : avarie, dépassement, rasant réussi, entrée dans la ceinture, gros pari placé
  (montant arrondi, nom seulement si le pari n'est pas anonyme).
- Chaque nouvelle a un bouton **« Revoir »** qui saute 30 s avant l'instant de l'événement.
- Résumé des moments forts à la fin de la course, et pastille de notification quand le Télébyte est fermé.

## D. Réalisateur arcade

- **Mode TV** (par défaut) : la caméra va d'elle-même sur l'événement le plus intéressant, avec un bandeau
  d'incrustation (nom du pilote, vitesse, ce qui se passe).
- Ralenti sur les moments clés : rasant, dépassement, photo-finish.
- Un geste du joueur reprend la main. Le mode TV revient après un temps sans geste.

## E. Voix off de stade

Un commentateur sportif qui raconte toute la course, comme au stade : vitesse, carburant, avaries, ce que vivent
les pilotes, faits divers, paris en cours, et la montée vers la grande finale.

**Technique**

- Synthèse vocale du navigateur (Web Speech, voix françaises fr-FR) : gratuite, sans serveur, immédiate.
  - La qualité dépend de l'appareil. Sur iPhone, les voix françaises sont bonnes. Sur certains Android, elles sont
    plus robotiques.
- Les phrases sont écrites à partir de modèles, avec beaucoup de variantes pour éviter les répétitions. Exemples :
  « Et il plonge ! Le Fulgurant plonge vers Vessa ! », « Le Cuirassé serre les dents, coque à 62 % ».
- **Duo** : un commentateur, emporté, et un consultant, posé, avec deux voix ou deux hauteurs. Ça rend les
  échanges vivants.
- Sous-titre à l'écran : utile en mode muet, et pour l'accessibilité.
- Bouton muet et volume. Sur iPhone, le son ne démarre qu'après un premier toucher (règle du téléphone).
- Plus tard, en option : des voix de synthèse haut de gamme générées par le serveur pour les annonces fixes
  (départ, arrivée, finale). Ce service est payant.

**Ce que dit la voix off**

| Thème | Source | Exemple |
|---|---|---|
| Classement, écarts | classement révélé | « Trois minutes d'avance pour la Sentinelle ! » |
| Vitesse, carburant | télémétrie | « 41 km/s au compteur, réservoir à moitié vide » |
| Avaries, réparations | événements (A) | « Alerte sur le Cuirassé, il perd de la puissance ! » |
| Vécu des pilotes | état du vaisseau (accélération, chaleur, coque) | « 9 G dans la plongée, ça doit cogner là-dedans » |
| Faits divers | tirés au hasard sur l'écran, sans effet sur la course | « Un cargo de melons bloque l'accès au relais de Vessa… » |
| Paris en cours | cagnotte, répartition | « 40 % des commandants sur le Fulgurant, cagnotte à 18 000 CG » |
| Grande finale | dernier système, compte à rebours | « On entre dans le dernier système, tout peut basculer ! » |

**Rythme**

- La course dure 76 h. Le commentateur parle à chaque événement. Entre deux événements, il fait un point toutes
  les quelques minutes, et le silence est permis.
- En revoir accéléré, seules les phrases importantes sont dites.
- Une file de priorité : une avarie passe avant un point de classement. Une phrase devenue fausse (dépassement
  annulé) est abandonnée.

## Ordre proposé

1. **E + C sur les données d'aujourd'hui** (voix off, fil d'actualité) : classement, vitesse, carburant, avaries
   déjà simulées, paris. Ça ne touche pas au serveur et ça peut être en ligne pour le 8 novembre.
2. **A, les événements du moteur**, avec la double version du moteur. Mise en ligne avant le 11 novembre pour
   l'édition du 29, sinon pour celle du 20 décembre.
3. **B, les étapes regardables** : elles montrent les événements de A pendant les voyages.
4. **D, le réalisateur**, qui s'appuie sur tout le reste.

À chaque étape : essais automatiques (moteur identique serveur et écran, équilibre, interface), puis une
répétition accélérée sur ton compte avant la mise en ligne.

## État (6 novembre 2026)

Les quatre étapes sont faites, chacune relue par un agent indépendant puis corrigée.

| Étape | Fichiers | Essais |
|---|---|---|
| 1. Voix off et fil d'actualité | telebyte/timeline.js, narrator.js, news.js | tools/fronde/narrator_test.mjs, ui_commentary.js |
| 2. Événements du moteur (v2) | sandbox/race/engine.js, raceData.js (PILOT.v = 2), server/fronde-tick/* (copie générée), carte des dangers dans telebyte/UniverseView.js | tools/fronde/engine_test.mjs (v1 inchangé + v2), feed_test.mjs, e2e_test.mjs |
| 3. Couloir des étapes | telebyte/corridor.js, sandbox/race/RaceLayer.js (« Voir le couloir ») | tools/fronde/ui_corridor.js |
| 4. Réalisateur (mode TV) | telebyte/director.js, ralenti dans sandbox/main.js | tools/fronde/ui_director.js |

Choix faits en route :
- **Mode économie de carburant retiré** : il n'arrivait jamais, les pilotes gardent toujours une réserve (au plus bas, 39 % de réservoir).
- **Durées d'étape plus annoncées par la voix off** : elles comprennent les incidents à venir.
- **Hasard des éditions v2 sur 128 bits** : toute la graine compte, et non plus 32 bits.
- **Équilibre v2 sur 200 éditions** : victoires 59 / 47 / 47 / 47, écart médian entre le 1er et le 2e de 28 min.
- **Les plans publiés contiennent l'étape suivante entière** (chocs, panne, éruption), environ 20 h d'avance. Les paris sont fermés à ce moment-là, et l'écran ne montre rien avant l'heure.

## Mise en ligne

1. **Pages du jeu** : copier `telebyte/` et `sandbox/` dans `github_upload/fronde/` du dépôt starbyte, puis pousser sur `main`, avec l'accord d'Adrien. Sans risque pour la course du 8 novembre : son édition n'a pas de version (v1) et se rejoue exactement comme avant.
2. **Fonction serveur fronde-tick** : redéployer `index.ts`, `edition.ts` et `engine.ts` (copies générées) depuis le tableau de bord Supabase, puis lancer le test `{ "action": "selftest" }`. Il faut le faire **avant l'arrivée de la course du 8 novembre** (vers le mercredi 11) pour que l'édition du 29 novembre soit créée en v2. Sinon, elle sera en v1 (sans événements) et la suivante en v2.
3. **Ordre** : les pages d'abord (elles savent rejouer v1 et v2), le serveur ensuite. Une page en cache plus ancienne refuse une édition v2 et demande de recharger.
