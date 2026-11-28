# FA-WORLD-038 — Animation procédurale des acteurs et équipements

## Objectif
Étendre le rendu low-poly des acteurs sans modifier les états autoritaires du jeu, les collisions, la navigation ou les dégâts.

## Implémentation
- Module pur `actorAnimation.ts`: échantillonnage déterministe des actions idle, walk, run, attack, block, hit et death.
- Paramètres visuels bornés: locomotion [0,1], phase déterministe, amplitude des bras, inclinaison du torse et oscillation verticale.
- Trois niveaux de détail selon la distance: full jusqu'à 12 cases, reduced jusqu'à 28, static au-delà.
- Avatar joueur et PNJ utilisent le même contrat de pose.
- Équipement visuel: lame courte et bouclier intégrés à la silhouette low-poly; les sockets restent purement graphiques.
- Le comportement CHASE déclenche une pose d'attaque illustrative; ALERT une garde. Cela ne crée ni hitbox, ni dégâts, ni résolution de combat.

## Limites
- Les primitives restent des volumes rigides; pas de squelette GPU, skinning, IK, ragdoll ou animation exportée.
- Le niveau static réduit la variation de pose, mais les acteurs restent dessinés.
- Pas de benchmark GPU physique ni de capture de rendu sur appareil réel.
- Les transitions d'action ne sont pas encore synchronisées à un système de combat autoritaire.

## Validation
Tests unitaires du déterminisme, bornes, actions et sélection LOD; validation TypeScript/Vite via CI.
