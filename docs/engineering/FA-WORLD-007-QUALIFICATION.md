# FA-WORLD-007 — Qualification et prévalidation du World Engine

- Version : 1.0
- Date : 2026-11-28
- Branche : feat/fa-world-engine-p0
- Dépendances : FA-WORLD-001 à FA-WORLD-006
- Statut : PREVALIDATED — tests et build CI réussis.

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

## Résultats de qualification

- GitHub Actions — Web build, run #172 : **success**.
- Vitest : **69/69 tests réussis**, 10 fichiers de test.
- TypeScript : **success**.
- Vite production build : **success**, 69 modules transformés.
- Hostinger Deploy, run #98 : build réussi ; étape `Upload dist to Hostinger` **skipped** car pull request.
- Aucun merge, aucune migration de sauvegarde et aucun déploiement Hostinger.

## Décision de prévalidation

**FA-WORLD-007 : PREVALIDATED.** Le noyau logique spatial composé des coordonnées, caméra mathématique, génération de terrain, navigation A* et chunk manager passe les tests unitaires et transversaux.

La qualification graphique et l'intégration gameplay restent des jalons séparés : aucun rendu WebGL visible n'est encore branché à l'interface, et le moteur spatial n'a pas encore remplacé les fonctions historiques du jeu.
