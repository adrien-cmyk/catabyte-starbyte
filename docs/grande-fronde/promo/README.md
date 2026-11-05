# La Grande Fronde — captures de validation de la Phase 1

Race World Visual Sandbox, 5 novembre 2026. Images en 2560 × 1440, sans interface, rendues par la sandbox
elle-même (`node tools/fronde/shots.js`, densité de pixels 2, qualité Haute). Toutes les échelles sont réelles :
géante de 70 000 km de rayon, racer SR-01 de 68 m, étoile à 5,2 UA.

> Rendu en SwiftShader (logiciel, sans carte graphique) : l'image est celle d'un vrai GPU, mais l'anticrénelage
> et le halo peuvent légèrement différer. Aucune retouche.

| Test du brief (§4) | Image | Ce qu'on voit |
|---|---|---|
| 1. Vue générale du système | `01_vue_generale_systeme.jpg` | Géante ambre, anneaux, ombre de la planète sur les anneaux, trajectoire holographique de la fronde (traversée d'anneau et périapse repérées) |
| 2. Racer passant devant la géante | `02_racer_devant_la_geante.jpg` | SR-01 et sa traînée devant les bandes nuageuses, à l'approche de la périapse |
| 3. Passage rasant au-dessus d'une lune | `03_passage_rasant_kesh.jpg` | Kesh à ~2,5 km d'altitude, cratères à toutes les échelles, soleil rasant |
| 4. Traversée des anneaux | `04_traversee_des_anneaux.jpg`, `04b_dans_la_couche_des_anneaux.jpg` | La SR-01 surgit de la couche de fragments de glace (ralenti ×0,02) ; l'anneau vu par la tranche |
| 5. Entrée dans un champ d'astéroïdes | `05_entree_champ_asteroides.jpg`, `05b_coeur_du_champ.jpg` | L'amas devant la géante, puis un rocher de 400 m au cœur du champ |
| 6. Côté nocturne, lumière rasante | `06_cote_nocturne.jpg`, `06b_contre_jour.jpg` | Croissant de la géante et liseré atmosphérique ; éclipse de l'étoile et anneaux en contre-jour |
| 7. Zoom continu système → racer | `07_zoom_continu_systeme_racer.jpg` | Quatre images du même plan de 12 s : 1 000 000 km, 10 000 km, 1 km, 150 m |

Bonus : `bonus_periapse_poursuite.jpg` (poursuite à 58 km/s), `bonus_kesh_devant_la_geante.jpg`,
`bonus_ilva_lune_glacee.jpg`, `bonus_oro_lune_volcanique.jpg`.

## Points faibles connus (à juger à la validation)

- **Géante de très près** (02, plans rapprochés) : les nuages derrière le racer restent doux, le détail fin du plan
  rapproché (fin de l'étape 5) n'est pas fait.
- **Racer** : coque assez sombre dès qu'il n'est pas de trois quarts face au soleil ; feux de navigation très présents.
- **Zoom** (07, 2ᵉ image) : en traversant le plan des anneaux à mi-parcours, quelques images de stries floues.
- **Lunes** : pas d'ombres portées du relief (un rebord de cratère n'ombre pas le fond).
- **Images par seconde réelles** : non mesurées (voir `../PERF_PHASE1.md`), à relever sur iPhone et Android.
