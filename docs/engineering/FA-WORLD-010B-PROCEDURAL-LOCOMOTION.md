# FA-WORLD-010B — Locomotion procédurale et interpolation

Version : 1.0  
Statut : implémentation committée, qualification CI en cours  
Branche : `feat/fa-world-engine-p0`

## Objectif

Supprimer l'effet de téléportation visuelle entre cases et donner au personnage joueur un cycle locomoteur procédural, tout en conservant le déplacement discret comme autorité gameplay.

## Modifications

### 1. Pose procédurale

Fichier : `web/src/world/worldRenderer.ts`

Ajout du type `AvatarAnimation` et extension de `buildAvatarMesh(tile, animation?)`.

Paramètres :
- `x`, `y` : centre visuel en coordonnées monde ;
- `groundZ` : hauteur interpolée du sol ;
- `phase` : phase du cycle en radians ;
- `walkAmount` : intensité de locomotion entre 0 et 1.

Le modèle low-poly conserve ses six primitives. Les bras et jambes oscillent en opposition de phase ; le torse et la tête reçoivent un faible mouvement vertical synchronisé.

### 2. Déplacement visuel continu

Fichier : `web/src/world/World3DCanvas.tsx`

Pendant un segment A* :
- durée de transition nominale : 145 ms par case ;
- interpolation linéaire de X/Y entre la case validée et la suivante ;
- interpolation de la hauteur du sol entre les deux tuiles ;
- cycle locomoteur piloté par l'horodatage de la frame.

La validation `onTileMove` reste appelée à chaque franchissement de case. Les collisions, l'accessibilité et les règles du jeu ne sont pas transférées au renderer. Si la validation refuse le déplacement, l'animation est interrompue.

### 3. Tests

Fichier : `web/src/world/worldRenderer.test.ts`

Le test ajouté vérifie :
- conservation du nombre de sommets et de la topologie ;
- valeurs numériques finies ;
- distinction entre pose immobile et pose en marche ;
- déterminisme d'une pose à phase identique.

## Limites

- Animation par déplacement de primitives, non par squelette articulé.
- Pas encore de blend marche/course, saut, attaque ou animation contextuelle.
- Les PNJ ne sont pas encore animés par ce cycle.
- Les mesures FPS et le contrôle visuel sur appareils mobiles restent à effectuer.

## Prochaine étape

FA-WORLD-010C : réutilisation du système de pose sur les PNJ, avec phases déterministes par identifiant, états idle/patrol et transitions limitées, sans créer une IA autonome non validée.
