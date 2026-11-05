# Grande Fronde — Phase 3 : serveur commun (plan technique)

> Statut : **validé le 05/11/2026** (décisions au §10). Avancement au §12.

## 1. Objectif

Une seule course, la même pour tous les joueurs, calculée et gardée par le serveur ; les joueurs la regardent dans le
Télébyte et la vue système, parient avant le départ, et sont payés à l'arrivée. Personne — pas même le serveur une fois
la graine engagée — ne peut changer le déroulé après coup, et chacun peut le vérifier.

Hors périmètre de la Phase 3 : incidents de course (Phase 4), diffusion Télébyte enrichie (Phase 5), paris en direct et
cotes avancées (Phase 6). La Phase 3 pose le socle sur lequel ils viendront.

## 2. Ce qui existe déjà et qu'on réutilise

| Existant | Où | Usage en Phase 3 |
|---|---|---|
| Moteur de course déterministe (gravité, pilotes autonomes, carburant, coque) | `sandbox/race/DemoFeed.js`, `sandbox/core/Gravity.js`, `sandbox/race/raceData.js` | devient le **moteur partagé** client ↔ serveur |
| Interface du flux (`edition`, `stateAt`, `standingsAt`, `nextEvent`…) | `DemoFeed` | le flux serveur (`ServerFeed`) a **la même interface** : Télébyte et vue système ne changent pas |
| Résolution « paresseuse » : n'importe quel appel d'un joueur résout tout ce qui est dû | `github_upload/server/resolve-raids/` | même principe pour la course (pas de tâche planifiée à maintenir) |
| Moteur copié du jeu par script (`tools/sync_combat_engine.py`) | starbyte | même principe : `tools/fronde/sync_engine.py` génère la copie serveur |
| Fonctions SQL `mp_*` en `security definer`, tables fermées (RLS, `revoke all`) | `schema_mp_v40_mur_du_bar.sql` | mêmes conventions : `schema_mp_v41_grande_fronde.sql` |
| Crédits galactiques (`G.credits`, « CG ») dans la partie locale, sauvegardes copiées sur le serveur | jeu, `schema_mp_v36` | monnaie des paris (§6), avec un dépôt de garantie côté serveur |

## 3. Architecture

```
            ┌───────────────────────── serveur (Supabase) ─────────────────────────┐
 joueur ──► │ fonction fronde-tick (Deno) ── moteur partagé (copie générée)         │
 (jeu,      │   · crée l'édition suivante si besoin (graine, simulation, empreinte) │
 Télébyte)  │   · révèle les passages dus (plans des pilotes, au fil de la course)  │
            │   · règle les paris à l'arrivée                                       │
            │ tables : fronde_editions (public) · fronde_secrets (fermée)           │
            │          fronde_reveals (public) · fronde_bets · fronde_payouts       │
            │ fonctions SQL : mp_fronde_edition · mp_fronde_bet · mp_fronde_claim   │
            └───────────────────────────────────────────────────────────────────────┘
 client : ServerFeed = moteur partagé + plans révélés → mêmes trajectoires que le serveur, calculées localement
```

**Pourquoi le client recalcule au lieu de télécharger des trajectoires.** Une course, c'est quelques centaines de
milliers de points ; un plan de pilote, c'est six nombres. Le moteur est déterministe (même JavaScript, même moteur V8
dans Deno et dans les navigateurs, mêmes opérations dans le même ordre) : à partir des mêmes plans, client et serveur
obtiennent les mêmes positions au mètre près. Un test le vérifie à chaque génération (§8).

**Révélation progressive.** Le serveur connaît la course entière dès la création (il la simule pour la vérifier et
l'enregistrer), mais il ne publie le plan d'un pilote pour un système qu'au moment où ce pilote y entre. Avant, le
client ne sait de ce racer que ce qui est déjà visible (sa position, sa vitesse) ; les tracés n'affichent de toute
façon que la traînée passée. Lire le réseau ne donne donc pas le vainqueur.

## 4. Cycle de vie d'une édition

| État | Quand | Ce qui se passe |
|---|---|---|
| `annoncée` | à la création (lazy : premier appel qui ne trouve pas d'édition à venir) | parcours, racers, dates publiés ; **empreinte** de la graine publiée (§5) ; paris ouverts |
| `paris fermés` | au départ | plus de nouveaux paris ; cotes figées |
| `en course` | du départ à l'arrivée du dernier | révélations au fil des entrées dans les systèmes |
| `arrivée` | arrivée du dernier racer | résultat publié, **graine révélée** |
| `réglée` | premier appel après l'arrivée | gains calculés et inscrits, à encaisser par chaque joueur |

Format proposé : une édition par mois ; course de 72 h simulées jouée **en temps réel** (le départ un jour fixe à heure
fixe, l'arrivée ~3 jours plus tard) — le Télébyte garde son curseur pour revoir ce qui est passé, jamais l'avenir.

## 5. Graine et équité (vérifiable)

- À la création, le serveur tire une graine aléatoire (`crypto.getRandomValues`, 256 bits) et publie
  `empreinte = SHA-256(graine)` avec l'édition, **avant** l'ouverture des paris. Graine purement aléatoire : pas de
  « réalisateur » qui choisirait une course plus spectaculaire (décision d'Adrien, 05/11).
- La graine reste dans `fronde_secrets` (table fermée, lisible seulement par les fonctions serveur).
- À l'arrivée, la graine est publiée. N'importe qui peut vérifier `SHA-256(graine) = empreinte` et rejouer la course
  avec le moteur public : mêmes plans, mêmes temps, même vainqueur.

## 6. Paris (socle de la Phase 3)

- **Monnaie** : crédits galactiques (CG) du jeu.
- **Marché de départ** : « vainqueur ». Les autres marchés (podium, duel, « plongée réussie ») viennent en Phase 6.
- **Pari mutuel** : toutes les mises d'un marché forment une cagnotte ; la maison prélève une part (§10) ; le reste est
  partagé entre les gagnants au prorata de leurs mises. Les cotes affichées sont celles de la cagnotte en temps réel ;
  elles se figent à la fermeture. Personne ne peut perdre plus que sa mise ; la maison ne parie jamais.
- **Dépôt de garantie** (les CG vivent dans la partie locale) : au moment du pari, le jeu retire les CG de la partie
  et le serveur inscrit la mise ; le serveur vérifie la vraisemblance avec la dernière sauvegarde reçue (CG disponibles
  ≥ mise) et applique des plafonds (par pari, par édition, par joueur). À l'arrivée, les gains sont inscrits dans
  `fronde_payouts` ; le jeu les **encaisse** (`mp_fronde_claim`) et les ajoute à `G.credits`, une seule fois.
- **Annulation** : si une édition ne peut pas partir (incident serveur), toutes les mises sont remboursées par le même
  chemin.

## 7. Côté client

- `ServerFeed` : même interface que `DemoFeed`. Il charge l'édition (`mp_fronde_edition`), reconstruit les trajectoires
  à partir des plans révélés avec le moteur partagé, et rappelle `fronde-tick` au besoin (toutes les quelques minutes,
  ou à l'approche d'une entrée de système).
- Le Télébyte et la vue système choisissent leur flux : serveur si une édition existe et qu'on est connecté, sinon la
  démo (hors ligne, page Claude).
- Écran de pari dans le Télébyte : cagnotte et cotes par racer, mise en CG, « mes paris », encaisser.

## 8. Fichiers et déploiement

| Fichier | Rôle |
|---|---|
| `sandbox/race/engine.js` + `sandbox/core/Gravity.js` + `sandbox/race/raceData.js` | le moteur partagé, sans dépendance au rendu (déjà le cas : pas de nouveau dossier) ; `DemoFeed.js` / `ServerFeed.js` n'en sont que la lecture |
| `tools/fronde/sync_engine.mjs` | génère `server/fronde-tick/engine.js` (copie en un fichier, en-tête « ne pas modifier ») ; `server/` est le miroir de `github_upload/server/` de starbyte |
| `tools/fronde/engine_test.mjs` | déterminisme : même empreinte de résultat (temps de passage, plans) entre la copie serveur et le moteur client, sur 40 graines |
| `github_upload/server/fronde-tick/index.ts` | fonction Deno : création d'édition, révélations, règlement |
| `github_upload/server/schema_mp_v41_grande_fronde.sql` | tables et fonctions `mp_fronde_*`, à coller dans le SQL Editor (comme les versions précédentes) |
| `github_upload/fronde/` | Télébyte + vue système, en un fichier versionné (le service worker ne doit pas servir une ancienne copie) |

Rien n'est poussé sur `main` de starbyte sans ton feu vert (= production). Ordre de mise en service : SQL v41 →
déploiement de `fronde-tick` → publication de `github_upload/fronde/` sur une adresse non liée depuis le jeu → essai →
lien depuis le jeu.

## 9. Étapes

| # | Étape | Validation |
|---|---|---|
| 1 | Moteur partagé : extraire le moteur du rendu (`sandbox/race/engine/`), plans sérialisables, simulation d'une édition à partir de (graine, parcours, racers, date) | `engine_test.mjs` : 40 éditions, mêmes résultats qu'aujourd'hui |
| 2 | `ServerFeed` hors ligne : flux reconstruit à partir de plans « révélés » simulés localement ; le Télébyte et la vue système tournent dessus | captures identiques à la démo au même instant |
| 3 | Schéma SQL v41 (tables, fonctions `mp_fronde_*`, RLS) | requêtes de vérification fournies avec le fichier |
| 4 | Fonction `fronde-tick` + copie générée du moteur ; création lazy, empreinte, révélations, règlement | test de bout en bout sur une édition courte (2 systèmes, 1 h) |
| 5 | Paris : `mp_fronde_bet`, dépôt de garantie, plafonds, cagnotte et cotes, `mp_fronde_claim` | scénarios : pari, gain, perte, double encaissement refusé, mise > CG refusée |
| 6 | Écran de pari dans le Télébyte, flux serveur branché | essai sur téléphone |
| 7 | Mise en service sur une adresse non liée, édition d'essai | ton essai, puis lien depuis le jeu |

## 10. Décisions à prendre

| Décision | Options | Recommandation |
|---|---|---|
| Rythme et durée réelle | (a) 1 édition / mois, 72 h en temps réel ; (b) chaque semaine ; (c) accélérée | **décidé : (a)** |
| Part de la maison | 0 % · 5 % · 10 % | **décidé : 5 %** (puits de CG) |
| Plafonds de mise | fixe (ex. 5 000 CG) · proportionnel à la production du joueur | **décidé : 5 000 CG par joueur et par édition** (ajustable par édition) |
| Marchés au lancement | vainqueur seul · vainqueur + podium | **décidé : vainqueur seul** (podium, duels en Phase 6) |
| Racers | maison seulement · plus tard ouverts aux vaisseaux des joueurs | maison seulement ; l'ouverture demande un équilibre et une modération à part |
| Fermeture des paris | au départ · avant chaque système (paris en direct) | au départ (Phase 3) ; le direct en Phase 6 |

## 11. Risques

- **Économie locale** : un joueur qui trafique sa partie peut « miser » des CG qu'il n'a pas. Parades : vérification
  avec la dernière sauvegarde serveur, plafonds, journal des paris ; c'est le même niveau de confiance que le commerce
  entre joueurs (v25).
- **Déterminisme** : une différence de calcul entre Deno et un navigateur fausserait l'affichage (pas le résultat, qui
  vient du serveur). Parade : `engine_test.mjs` à chaque génération, et le classement affiché vient toujours des temps
  de passage publiés par le serveur, pas du recalcul local.
- **Charge** : la simulation d'une édition prend ~0,1 s ; elle n'a lieu qu'une fois par édition. Les appels des joueurs
  ne font que lire et révéler.

## 12. Avancement

| Étape | État | Notes |
|---|---|---|
| 1 | fait | `sandbox/race/engine.js` : moteur séparé de la lecture (`DemoFeed` = `RaceFeed` sur `runRace`) ; `runRace` décide (pilotes, surchauffe) ou **rejoue des plans** (complets ou partiels) ; `planOf`, `plansMap`, `digest`. `tools/fronde/sync_engine.mjs` génère `server/fronde-tick/engine.js` (24 Kio, sans import). `tools/fronde/engine_test.mjs` : 40 éditions, empreintes de référence (`engine_ref.json`), rejeu JSON identique, rejeu partiel, copie serveur identique ; mêmes empreintes dans Chromium. Résultats de la démo inchangés. |
| 2 | fait | `ServerFeed` (même interface que `DemoFeed`) : reçoit les plans au fil de la course (`source.reveals(t)`), rejoue avec le moteur partagé (passages déjà calculés mis en mémoire), prévient les vues (`onUpdate`). `MockSource` : course calculée en secret, plans donnés à l'heure d'entrée — ce que fera le serveur. Un racer dont le plan n'est pas publié s'arrête à l'entrée (heure d'entrée connue, comme une heure d'arrivée annoncée) ; état « au départ » avant le premier plan ; boutons d'étapes en estimation « ≈ » tant que le système n'est pas atteint ; durée annoncée (76 h) pour le curseur. Vues : `?feed=mock` sur le Télébyte et la vue système (le cadre intégré suit). `tools/fronde/feed_test.mjs` : 2 001 instants sur 3 éditions, identiques à la course complète, aucun plan reçu en avance ; captures identiques (hors estimations). |
| 3 à 7 | à faire | |
