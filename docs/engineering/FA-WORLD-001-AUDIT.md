# FA-WORLD-001 — Audit du moteur World existant

- Programme : Freedom Arena
- Référence : FA-WORLD-001
- Version : 1.0
- Date : 2026-11-28
- Branche de travail : feat/fa-world-engine-p0
- Branche de référence auditée : alm-dev/freedom-arena-fix-2026-11-26
- Politique : audit non destructif ; aucune modification des fichiers de production dans cette tâche.

## 1. Périmètre examiné

Inspection des fichiers suivants :
- `FREEDOMARENA_DEV.md`
- `web/package.json`
- `web/src/world.ts`
- `web/src/main.tsx`
- `web/src/styles.css`
- `web/src/tiles/tileRegistry.ts`
- `web/src/tiles/tilePainter.ts`
- `web/tsconfig.json`
- `web/vite.config.ts`
- `web/index.html`

## 2. État constaté

### Éléments réutilisables
- Application web React + TypeScript + Vite.
- Règles du monde regroupées dans `web/src/world.ts`.
- Types et fonctions de terrain existants : `TileKind`, `Tile`, `getTile`, `canWalkTile`, `moveTile`, `findTilePath`.
- Zones, POI, NPC, événements, météo et cycles environnementaux déjà modélisés.
- Registre de 24 catégories de tiles, avec catalogue de 32 px dans `web/src/tiles/tileRegistry.ts`.
- Peinture Canvas 2D existante dans `web/src/tiles/tilePainter.ts`.
- L'interface utilise deux Canvas superposés et un cache statique/dynamique dans `web/src/main.tsx`.
- Le projet dispose de tests Vitest et d'un script de build TypeScript/Vite.

### Écarts par rapport à la cible validée
1. Le rendu actuellement observé est un Canvas 2D, pas un renderer 3D isométrique.
2. La logique spatiale `getTile` est bornée par défaut à 60 × 40, et non 64 × 64.
3. Le catalogue graphique est en 32 × 32 px ; `RENDER_TILE_SIZE = 64` est déclaré dans l'interface, mais le rendu de la carte inspecté utilise une cellule de 32 px.
4. Les coordonnées du monde sont essentiellement des coordonnées de tuile x/y ; aucune abstraction stable X/Y/Z monde n'a été identifiée dans les fichiers inspectés.
5. `findTilePath` utilise une recherche en largeur (file FIFO) et une heuristique de distance Manhattan uniquement pour limiter les pas ; ce n'est pas A*.
6. Les obstacles sont issus de la génération statique des tiles ; aucune API d'obstacles dynamiques ou de collision continue n'a été identifiée.
7. Aucun gestionnaire de chunks, streaming géographique, cache de régions ou préchargement n'a été identifié dans les fichiers examinés.
8. Les trois zones existantes forment un graphe de régions ; elles ne constituent pas encore un monde ouvert spatial continu.

## 3. Risques et décisions d'architecture

- Ne pas remplacer immédiatement le Canvas 2D existant : conserver le renderer actuel comme fallback jusqu'à validation d'un prototype séparé.
- Introduire une couche de coordonnées indépendante du renderer ; ne pas convertir directement les règles métier en coordonnées écran.
- Séparer la taille logique d'une cellule, la taille d'un asset et la taille d'affichage.
- Faire évoluer progressivement la dimension de carte vers 64 × 64 sans casser les sauvegardes existantes 60 × 40.
- Conserver les signatures et contrats existants ou fournir des adaptateurs de compatibilité.
- Ne pas introduire un moteur physique complet avant d'avoir validé les règles de déplacement, d'occupation et de collision.
- Vérifier les dépendances avant de choisir Three.js ou Babylon.js ; aucune dépendance 3D n'a été confirmée dans le manifeste examiné.

## 4. Compatibilité d'environnement

Le manifeste `web/package.json` demande Node >=22 <23 et npm >=10 <11. Les versions Node 26.x et npm 11.x précédemment signalées dans l'environnement Termux sont hors de ces plages. La compilation locale doit donc être effectuée avec une version compatible ou dans un environnement CI conforme.

## 5. Validation et limites de l'audit

- Audit statique des fichiers ci-dessus : effectué.
- Exécution locale de `npm test` : non effectuée depuis cette session.
- Exécution locale de `npm run build` : non effectuée depuis cette session.
- CI : le guide de développement mentionne un ancien run GitHub Actions réussi sur le commit `43bcbed4aab77b9f2cec54547fda887576b98d32`; ce résultat ne prouve pas la validation du présent état de branche.
- Aucune modification du code de jeu, de la base de données ou du déploiement n'a été réalisée.

## 6. Contrat de sortie vers FA-WORLD-002

FA-WORLD-002 devra définir et tester :
- coordonnées de tuile entières (i, j),
- coordonnées monde métriques ou unités de jeu (X, Y, Z),
- transformation monde-écran séparée du modèle spatial,
- dimensions de cellule logique configurables,
- conversion réversible et tests de précision,
- adaptateur de sauvegarde pour les positions historiques x/y.

## 7. Statut

**FA-WORLD-001 : AUDIT STATIQUE TERMINÉ — PRÉVALIDATION DOCUMENTAIRE.**

La validation d'exécution reste ouverte jusqu'à l'exécution des tests et du build dans un environnement Node compatible. La tâche suivante autorisée dans l'ordre est FA-WORLD-002 — Coordonnées mondiales.
