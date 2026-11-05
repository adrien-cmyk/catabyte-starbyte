# Grande Fronde — mesures des vues de course (Phase 2, étape 9)

Fenêtre téléphone 390 × 844, rendu logiciel (SwiftShader) : les **comptes** (appels de dessin, triangles) et le **temps CPU d'un pas** sont fiables, pas le temps d'image GPU. Budgets du plan technique §9.

| Qualité | Système | Vue | Appels | Budget | Triangles | Budget | Points | Pas (ms) | Dans le budget |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| Haute | kerath | Ensemble | 53 | 400 | 117 k | 1.50 M | 4 k | 1.94 | oui |
| Haute | kerath | Portes | 52 | 400 | 117 k | 1.50 M | 4 k | 2.05 | oui |
| Haute | kerath | Suivre | 82 | 400 | 263 k | 1.50 M | 4 k | 2.81 | oui |
| Haute | vessa | Ensemble | 83 | 400 | 137 k | 1.50 M | 4 k | 1.24 | oui |
| Haute | vessa | Portes | 52 | 400 | 117 k | 1.50 M | 4 k | 1.94 | oui |
| Haute | vessa | Suivre | 60 | 400 | 136 k | 1.50 M | 4 k | 3.61 | oui |
| Haute | nox | Ensemble | 89 | 400 | 153 k | 1.50 M | 4 k | 1.21 | oui |
| Haute | nox | Portes | 82 | 400 | 137 k | 1.50 M | 4 k | 1.71 | oui |
| Haute | nox | Suivre | 59 | 400 | 149 k | 1.50 M | 4 k | 3.18 | oui |
| Moyenne | kerath | Ensemble | 53 | 250 | 58 k | 600 k | 3 k | 1.1 | oui |
| Moyenne | kerath | Portes | 52 | 250 | 58 k | 600 k | 3 k | 1.85 | oui |
| Moyenne | kerath | Suivre | 82 | 250 | 204 k | 600 k | 3 k | 6.27 | oui |
| Moyenne | vessa | Ensemble | 83 | 250 | 79 k | 600 k | 3 k | 1.07 | oui |
| Moyenne | vessa | Portes | 52 | 250 | 58 k | 600 k | 3 k | 1.29 | oui |
| Moyenne | vessa | Suivre | 60 | 250 | 77 k | 600 k | 3 k | 3.24 | oui |
| Moyenne | nox | Ensemble | 89 | 250 | 94 k | 600 k | 3 k | 1.02 | oui |
| Moyenne | nox | Portes | 82 | 250 | 79 k | 600 k | 3 k | 1.61 | oui |
| Moyenne | nox | Suivre | 59 | 250 | 90 k | 600 k | 3 k | 2.78 | oui |
| Économe | kerath | Ensemble | 40 | 150 | 35 k | 300 k | 736 | 1.01 | oui |
| Économe | kerath | Portes | 39 | 150 | 35 k | 300 k | 736 | 2.35 | oui |
| Économe | kerath | Suivre | 69 | 150 | 181 k | 300 k | 736 | 5.26 | oui |
| Économe | vessa | Ensemble | 70 | 150 | 56 k | 300 k | 731 | 1.21 | oui |
| Économe | vessa | Portes | 39 | 150 | 35 k | 300 k | 731 | 0.93 | oui |
| Économe | vessa | Suivre | 47 | 150 | 54 k | 300 k | 731 | 2.55 | oui |
| Économe | nox | Ensemble | 76 | 150 | 60 k | 300 k | 739 | 1.31 | oui |
| Économe | nox | Portes | 69 | 150 | 56 k | 300 k | 739 | 0.8 | oui |
| Économe | nox | Suivre | 46 | 150 | 58 k | 300 k | 739 | 2.84 | oui |
| Minimale | kerath | Ensemble | 40 | 120 | 35 k | 200 k | 436 | 1.15 | oui |
| Minimale | kerath | Portes | 39 | 120 | 35 k | 200 k | 436 | 3.15 | oui |
| Minimale | kerath | Suivre | 69 | 120 | 181 k | 200 k | 436 | 1.31 | oui |
| Minimale | vessa | Ensemble | 70 | 120 | 56 k | 200 k | 431 | 1.53 | oui |
| Minimale | vessa | Portes | 39 | 120 | 35 k | 200 k | 431 | 1.09 | oui |
| Minimale | vessa | Suivre | 47 | 120 | 54 k | 200 k | 431 | 1.5 | oui |
| Minimale | nox | Ensemble | 76 | 120 | 60 k | 200 k | 439 | 0.86 | oui |
| Minimale | nox | Portes | 69 | 120 | 56 k | 200 k | 439 | 0.95 | oui |
| Minimale | nox | Suivre | 46 | 120 | 58 k | 200 k | 439 | 1.11 | oui |
