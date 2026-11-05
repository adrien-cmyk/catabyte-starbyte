# La Grande Fronde — mesures de la sandbox (Phase 1, étape 14)

Relevé automatique (`node tools/fronde/perf.js`) le 2026-11-05, fenêtre 1280 × 720, densité de pixels 1.

- **Appels de dessin, triangles, points** : comptés sur toutes les passes (rendu, halo, sortie). Ils ne dépendent pas de la machine : ce sont les chiffres à comparer aux budgets.
- **Pas CPU** : temps JavaScript d'une image de simulation (lunes, champs, trajectoire, caméra), hors rendu. Indicatif.
- **Champs de rochers** : plafond à 70 / 60 / 50 / 40 % du budget de triangles selon le niveau ; au-delà, les seuils de détail se relèvent d'eux-mêmes (colonne « seuils × ») ; s'ils sont au maximum, la densité de rochers proches baisse (colonne « rochers gardés », avec la part fixée par le niveau de qualité).
- **Les temps d'image complets ne sont pas reportés** : ce banc tourne sur SwiftShader (rendu logiciel). Les images par seconde réelles se mesurent sur l'appareil, avec le compteur de perf.js.

## Haute — budget ≤ 400 appels, ≤ 1500 k triangles

| Vue | Appels | Triangles | Points | Pas CPU (ms) | Seuils × | Rochers gardés | Budget |
|---|---:|---:|---:|---:|---:|---:|---|
| system | 72 | 175 k | 4.0 k | 0.19 | 1.00 | 100 % | tenu |
| giant | 54 | 129 k | 4.0 k | 0.15 | 1.00 | 100 % | tenu |
| limb | 23 | 108 k | 4.0 k | 0.45 | 1.00 | 100 % | tenu |
| night | 60 | 150 k | 4.0 k | 0.68 | 1.00 | 100 % | tenu |
| ring-cross | 53 | 84 k | 37.3 k | 1.16 | 1.00 | 100 % | tenu |
| ring-inside | 54 | 148 k | 37.2 k | 1.24 | 1.00 | 100 % | tenu |
| graze-kesh | 281 | 710 k | 4.0 k | 0.86 | 1.00 | 100 % | tenu |
| kesh | 99 | 244 k | 4.0 k | 0.34 | 1.00 | 100 % | tenu |
| field-entry | 84 | 168 k | 28.8 k | 0.89 | 1.00 | 100 % | tenu |
| field-in | 57 | 83 k | 56.7 k | 0.99 | 1.00 | 100 % | tenu |
| racer | 61 | 142 k | 4.1 k | 0.97 | 1.00 | 100 % | tenu |
| trajectory | 63 | 145 k | 4.1 k | 1.45 | 1.00 | 100 % | tenu |

## Moyenne — budget ≤ 250 appels, ≤ 600 k triangles

| Vue | Appels | Triangles | Points | Pas CPU (ms) | Seuils × | Rochers gardés | Budget |
|---|---:|---:|---:|---:|---:|---:|---|
| system | 72 | 116 k | 2.8 k | 0.15 | 1.00 | 100 % | tenu |
| giant | 54 | 70 k | 2.8 k | 0.13 | 1.00 | 100 % | tenu |
| limb | 23 | 49 k | 2.8 k | 0.28 | 1.00 | 100 % | tenu |
| night | 60 | 92 k | 2.8 k | 0.53 | 1.00 | 100 % | tenu |
| ring-cross | 49 | 37 k | 28.9 k | 0.42 | 1.00 | 75 % | tenu |
| ring-inside | 54 | 73 k | 29.2 k | 0.46 | 1.00 | 75 % | tenu |
| graze-kesh | 212 | 474 k | 2.8 k | 1.09 | 1.00 | 100 % | tenu |
| kesh | 93 | 170 k | 2.8 k | 0.16 | 1.00 | 100 % | tenu |
| field-entry | 79 | 92 k | 22.3 k | 0.4 | 1.00 | 75 % | tenu |
| field-in | 51 | 45 k | 43.8 k | 0.51 | 1.00 | 75 % | tenu |
| racer | 61 | 84 k | 2.9 k | 2.25 | 1.00 | 100 % | tenu |
| trajectory | 63 | 86 k | 2.9 k | 0.83 | 1.00 | 100 % | tenu |

## Économe — budget ≤ 150 appels, ≤ 300 k triangles

| Vue | Appels | Triangles | Points | Pas CPU (ms) | Seuils × | Rochers gardés | Budget |
|---|---:|---:|---:|---:|---:|---:|---|
| system | 59 | 61 k | 0.7 k | 0.17 | 1.00 | 100 % | tenu |
| giant | 41 | 47 k | 0.7 k | 0.55 | 1.00 | 100 % | tenu |
| limb | 10 | 27 k | 0.7 k | 0.44 | 1.00 | 100 % | tenu |
| night | 47 | 60 k | 0.7 k | 0.44 | 1.00 | 100 % | tenu |
| ring-cross | 19 | 12 k | 7.4 k | 0.34 | 1.00 | 50 % | tenu |
| ring-inside | 22 | 17 k | 8.0 k | 1.64 | 1.00 | 50 % | tenu |
| graze-kesh | 144 | 126 k | 0.7 k | 0.41 | 1.00 | 100 % | tenu |
| kesh | 59 | 61 k | 0.7 k | 0.15 | 1.00 | 100 % | tenu |
| field-entry | 55 | 54 k | 11.2 k | 0.36 | 1.00 | 50 % | tenu |
| field-in | 23 | 19 k | 23.1 k | 0.55 | 1.00 | 50 % | tenu |
| racer | 48 | 52 k | 0.8 k | 1.37 | 1.00 | 100 % | tenu |
| trajectory | 50 | 53 k | 0.8 k | 3.19 | 1.00 | 100 % | tenu |

## Minimale — budget ≤ 120 appels, ≤ 200 k triangles

| Vue | Appels | Triangles | Points | Pas CPU (ms) | Seuils × | Rochers gardés | Budget |
|---|---:|---:|---:|---:|---:|---:|---|
| system | 59 | 61 k | 0.4 k | 0.15 | 1.00 | 100 % | tenu |
| giant | 41 | 47 k | 0.4 k | 0.11 | 1.00 | 100 % | tenu |
| limb | 10 | 27 k | 0.4 k | 0.17 | 1.00 | 100 % | tenu |
| night | 47 | 60 k | 0.4 k | 0.13 | 1.00 | 100 % | tenu |
| ring-cross | 13 | 9 k | 1.8 k | 0.15 | 1.00 | 33 % | tenu |
| ring-inside | 17 | 10 k | 2.2 k | 0.36 | 1.00 | 33 % | tenu |
| graze-kesh | 109 | 99 k | 0.4 k | 1.7 | 1.00 | 100 % | tenu |
| kesh | 55 | 58 k | 0.4 k | 0.84 | 1.00 | 100 % | tenu |
| field-entry | 52 | 51 k | 2.1 k | 0.29 | 1.00 | 33 % | tenu |
| field-in | 23 | 14 k | 4.1 k | 0.21 | 1.00 | 33 % | tenu |
| racer | 48 | 52 k | 0.5 k | 0.56 | 1.00 | 100 % | tenu |
| trajectory | 50 | 53 k | 0.5 k | 0.55 | 1.00 | 100 % | tenu |

