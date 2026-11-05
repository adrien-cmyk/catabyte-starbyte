# Grande Fronde — intégration dans le jeu (starbyte)

À faire **seulement sur le feu vert d'Adrien** (pousser `main` de starbyte = production). Ordre conseillé : d'abord
une adresse non liée depuis le jeu, essai, puis le bouton.

## 1. Serveur (Supabase)

1. `server/schema_mp_v41_grande_fronde.sql` → SQL Editor → Run (relançable ; mise à jour de la v41 déjà installée
   comprise). Vérifier : `select * from public.verifier_fronde();` → quatre « ok ».
2. Fonction `fronde-tick` : voir `server/fronde-tick/README.md` (trois fichiers), puis l'autotest (`ok: true`).
3. Copier `server/` vers `github_upload/server/` de starbyte (archive, jamais publié sur le site).

## 2. Pages de la course (`github_upload/fronde/`)

Copier `telebyte/` et `sandbox/` (sans le panneau de développement inutile en production) sous `github_upload/fronde/`,
avec `sandbox/assets/*.glb`. Le Télébyte s'ouvre en `fronde/telebyte/index.html?feed=live`. Le service worker ne doit
pas servir une ancienne copie : regrouper en un fichier versionné ou exclure `fronde/` du précache (à décider à
l'intégration).

## 3. Jeu (`github_upload/index.html`) — trois retouches

1. `assets/fronde-bridge.js` = `game/fronde-bridge.js`, chargé **avant** le chargement de la partie :
   `<script src="assets/fronde-bridge.js"></script>`.
2. `'fronde'` dans `EXTRA_SAVE_KEYS` (la passerelle l'ajoute elle-même si elle est chargée avant `loadGame`, mais
   l'écrire dans la liste est plus sûr) : la trace des paris appliqués voyage avec la partie.
3. Un bouton « Télébyte » (emplacement à choisir : hors de la carte stratégique, décision Phase 2) qui appelle
   `SBFronde.open()`.

## Ce que fait la passerelle

- `SBFronde.open()` / `close()` : Télébyte plein écran en superposition (cadre, même origine), bouton « × ».
- `SBFronde.credits()` : CG de la partie (affichés dans la feuille de paris).
- `SBFronde.sync()` : met la partie en accord avec le serveur (`mp_fronde_mine`) — chaque pari retiré une fois des CG,
  chaque gain encaissé (`mp_fronde_claim`) et ajouté une fois, sauvegarde. Lancée au démarrage (8 s), toutes les
  10 minutes, après chaque pari et à la fermeture du Télébyte.

## Essai local (sans Supabase)

`tools/fronde/fake_game.html` + `tools/fronde/fake_supabase.mjs` + `tools/fronde/ui_live_test.js` (voir l'en-tête de
ce dernier) : création, pari, rattrapage après coupure, départ, vue système, arrivée, gain versé.
