# fronde-tick — fonction serveur de la Grande Fronde

Crée l'édition mensuelle suivante quand il n'y en a plus à venir (appelée par le jeu quand `mp_fronde_edition` répond
`next_needed = true`). Tout le reste — plans publiés au fil de la course, paris, règlement, encaissement — est en SQL
(`../schema_mp_v41_grande_fronde.sql`).

## Fichiers (à déployer ensemble)

| Fichier | Rôle |
|---|---|
| `index.ts` | la fonction (session du joueur, écriture en base avec la clé de service, autotest) |
| `edition.ts` | préparation d'une édition : calendrier, graine, parcours, simulation, lignes à écrire (copie générée de `edition.js`) |
| `engine.ts` | **copie générée** du moteur de course (`node tools/fronde/sync_engine.mjs`) — ne pas modifier à la main |

Ces trois fichiers-là, avec exactement ces noms. (`edition.js` et `engine.js` sont les mêmes contenus, utilisés par les
essais sous Node ; ils ne se déploient pas.)

## Déployer

Prérequis : `schema_mp_v41_grande_fronde.sql` exécuté (vérification : `select * from public.verifier_fronde();`).

- **Tableau de bord Supabase** → Edge Functions → *Deploy a new function* → *Via editor* → nom `fronde-tick` → créer
  les trois fichiers ci-dessus (même nom, même contenu) → *Deploy*. Laisser « Verify JWT » activé.
- **ou en ligne de commande** : copier le dossier dans `supabase/functions/fronde-tick/` puis
  `supabase functions deploy fronde-tick`.

## Vérifier après déploiement

**Sans toucher au jeu** : tableau de bord Supabase → Edge Functions → `fronde-tick` → bouton **Test** (en haut à
droite) → méthode POST, corps de la requête :

```json
{ "action": "selftest" }
```

→ réponse `{ "ok": true, "engine": "…", "results": { "fronde-222": true, … }, "ms": … }` : le serveur calcule exactement
les mêmes courses que le jeu (5 courses de référence). L'autotest n'écrit rien et ne lit aucune donnée.

**Ne pas appeler sans `action`** (ni avec un autre corps) avant que le jeu sache afficher la course : cet appel crée l'édition du mois suivant
(départ le premier samedi à 20 h, heure de Zurich), et les paris seraient ouverts. Une édition créée par erreur se retire
dans le SQL Editor : `delete from public.fronde_editions where id = '2026-12';` (tant que personne n'a parié), ou
`select public.fronde_cancel('2026-12');` (rembourse les mises).

## Après une modification du moteur

1. `node tools/fronde/sync_engine.mjs` (régénère `engine.js`) ;
2. `SERVER=server/fronde-tick/engine.js node tools/fronde/engine_test.mjs` ;
3. redéployer `fronde-tick`. Les éditions déjà créées gardent leurs plans enregistrés ; le jeu rejoue avec les données
   de l'édition (systèmes, racers, paramètres), donc une course en cours n'est pas affectée — mais le jeu doit utiliser un
   moteur qui donne les mêmes trajectoires pour ces plans (l'empreinte du moteur est enregistrée avec chaque édition).
