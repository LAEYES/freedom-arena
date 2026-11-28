# FA-WORLD-009 — Entités 3D, interactions et ambiance

- Version : 1.0
- Date : 2026-11-28
- Branche : feat/fa-world-engine-p0
- Dépendance : FA-WORLD-008
- Statut : code intégré ; qualification CI en attente.

## Objectif
Enrichir le renderer WebGL2 avec des entités visibles et sélectionnables, alimentées par les données existantes du monde Freedom Arena.

## Entités rendues
- PNJ de faction : Aegis, Nomads, Eclipse et Neutral ; silhouettes humanoïdes low-poly avec couleurs de faction.
- POI : bâtiments et plateformes distincts selon l'index du point d'intérêt.
- Événement : balise de signal avec taille/couleur dépendant de l'intensité.
- Boss : silhouette renforcée affichée lorsque l'intensité d'événement est supérieure ou égale à 4.
- Joueur : avatar low-poly existant.

## Ambiance
- Cycle d'ambiance : dawn, day, dusk, night ; teinte ambiante ajustée.
- Météo : clear, mist, storm, frost.
- Particules déterministes pour brouillard, tempête et gel.
- Couleur de brouillard et intensité adaptées à l'environnement de zone.

## Interaction
Le pointeur sélectionne les marqueurs PNJ, POI et événement. La sélection est transmise à la fonction existante `setSelectedSignal`, qui réutilise le panneau d'interaction du jeu. Les clics sur les autres cellules marchables restent des demandes de déplacement A*.

Les actions métier restent exécutées par les fonctions existantes du jeu ; le renderer ne crée ni récompenses ni transactions indépendantes.

## Performance et ressources
- Buffers GPU séparés : terrain, avatar, scène d'entités, météo.
- Maillages statiques d'entités préparés en amont.
- Carte 64 × 64 complète chargée dans le cache de chunks pour que les POI éloignés restent visibles.
- Aucun moteur physique externe ajouté.
- Les particules sont géométriques et déterministes ; leur animation temporelle détaillée reste à réaliser.

## Fichiers modifiés
- `web/src/world/worldRenderer.ts` : maillages PNJ, POI, balise d'événement, boss, particules météo.
- `web/src/world/worldRenderer.test.ts` : tests géométriques et déterminisme météo.
- `web/src/world/World3DCanvas.tsx` : assemblage et rendu des entités, sélection des marqueurs, teinte ambiante et brouillard.
- `web/src/main.tsx` : passage de l'état de zone et raccordement au panneau d'interaction.

## Limites
- Les entités sont des proxies géométriques low-poly, pas des modèles artistiques finaux.
- Les PNJ ne possèdent pas encore d'animation squelettique ni d'IA autonome 3D.
- Le boss est un marqueur visuel dérivé de l'intensité d'événement ; il n'instancie pas un nouveau combat.
- Les particules météo sont statiques dans cette version.
- Les joueurs distants ne sont pas encore affichés dans la scène 3D.
- Les collisions et les déplacements restent validés par les règles historiques du jeu.
- Les positions des POI et PNJ sont issues des générateurs historiques, pas encore d'un éditeur de monde.

## Qualification requise
- CI TypeScript, Vitest et Vite build.
- Contrôle navigateur WebGL2.
- Contrôle visuel sur écran mobile et desktop.
- Vérification du picking des PNJ, POI et événements.
- Mesure GPU et FPS sur matériel cible.

Aucun merge vers main ni déploiement Hostinger n'est effectué par cette tâche.
