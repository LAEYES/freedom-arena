# FA-WORLD-007 — Qualification et prévalidation du World Engine

- Version : 1.0
- Date : 2026-11-28
- Branche : feat/fa-world-engine-p0
- Dépendances : FA-WORLD-001 à FA-WORLD-006
- Statut : tests d'intégration ajoutés ; CI en attente.

## Objectif

Vérifier les invariants transversaux des modules spatiaux sans intégrer ni remplacer le renderer et les sauvegardes de production.

## Invariants contrôlés

1. Monde logique initial : 64 × 64 = 4 096 cellules.
2. Indexation row-major stable.
3. Génération déterministe à seed identique.
4. Couverture exacte : chaque cellule appartient à un et un seul chunk.
5. Cohérence des conversions grille/monde/écran.
6. Réversibilité de la caméra sur un plan d'altitude connu.
7. A* trouve un chemin praticable autour d'obstacles.
8. Aucune étape de chemin ne traverse une cellule bloquée.
9. Chaque déplacement de chemin est adjacent.
10. La zone de spawn est praticable et cohérente avec son chunk.

## Banc de tests

Fichier : `web/src/world/worldEngine.test.ts`.

Le banc réutilise les modules de coordonnées, caméra, terrain, navigation et chunks. Il vérifie les contrats croisés, pas uniquement chaque fonction isolée.

## Hors périmètre / réserves

- Renderer WebGL visible non encore développé.
- Intégration du World Engine à l'interface de jeu existante non encore effectuée.
- Synchronisation réseau et chargement distant des chunks non implémentés.
- Les fonctions historiques `getTile`, `findTilePath` et le schéma `WorldTilePosition` ne sont pas remplacés.
- Aucune migration de sauvegarde et aucun déploiement ne sont effectués.
- Les performances réelles GPU, la mémoire navigateur et la charge multijoueur restent à mesurer sur des appareils cibles.

## Décision attendue

Le lot peut être prévalidé comme noyau logique spatial lorsque :
- les tests unitaires et transversaux passent,
- le build TypeScript/Vite passe,
- aucun changement de schéma ou de déploiement n'est requis.

La qualification graphique et l'intégration gameplay seront des lots ultérieurs.
