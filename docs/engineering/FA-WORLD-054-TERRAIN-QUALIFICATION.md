# FA-WORLD-054 — Qualification des terrains procéduraux

- Version : 1.0
- Date : 2026-11-28
- Branche : feat/fa-world-054-terrain-qualification
- Dépendances : FA-WORLD-004, FA-WORLD-007
- Statut : IMPLEMENTED — validation CI à effectuer.

## Objectif

Ajouter un audit déterministe des cartes de terrain avant leur rendu, leur mise en cache ou leur exposition au gameplay. Le contrôle ne modifie jamais la carte source.

## Contrôles

1. Dimensions positives et entières.
2. Cardinalité exacte : largeur × hauteur.
3. Indexation row-major et coordonnées cohérentes.
4. Types de terrain reconnus.
5. Altitudes finies et non négatives.
6. Coûts de déplacement cohérents avec walkable.
7. Zone de spawn praticable et contrôle optionnel de son rayon de sécurité.
8. Mesure de connectivité en 4-voisins depuis le spawn.
9. Mesures de couverture par type et ratio de cellules praticables.
10. Option stricte pour rejeter les régions praticables non reliées au spawn.

## API

Fichier : web/src/world/terrainAudit.ts

- auditTerrainMap(map, options) retourne un rapport sans mutation.
- options.spawn définit le point de départ et le rayon de sécurité.
- options.requireAllWalkableReachable active le contrôle strict de connectivité.
- Les îles intentionnelles restent autorisées par défaut ; leur nombre est mesuré.

## Tests

Fichier : web/src/world/terrainAudit.test.ts

Couvre une carte connectée, la génération déterministe 64×64, les cellules manquantes, les coordonnées corrompues, les coûts invalides, l'altitude invalide, le rayon de spawn, les régions isolées et les dimensions incorrectes.

## Critères d'acceptation

- Aucun accès hors limites lors de l'audit d'une carte invalide.
- Aucun changement de la carte auditée.
- Mesures reproductibles pour une même entrée.
- Tests Vitest et build TypeScript/Vite réussis.
- Aucune migration de données ni déploiement requis.
