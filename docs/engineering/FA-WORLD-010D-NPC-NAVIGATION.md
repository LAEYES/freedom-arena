# FA-WORLD-010D — Navigation autonome des PNJ

## Portée
Simulation de patrouilles visuelles indépendantes, sans mutation de l'état autoritaire du jeu ni des positions logiques utilisées par les interactions.

## Mécanisme
- Chaque PNJ reçoit un itinéraire fermé calculé par A* sur la carte de terrain active.
- Navigation orthogonale sans coupe diagonale, avec prise en compte des terrains non praticables et des coûts de déplacement.
- Les cases initiales des autres PNJ sont réservées ; les itinéraires calculés précédemment sont également réservés afin d'éviter les intersections entre routes attribuées.
- Les PNJ suivent leur itinéraire puis le parcourent en sens inverse ; vitesse déterministe, modulée par l'activité.
- Interpolation sous-tile et interpolation de l'altitude ; rendu conservé dans le buffer GPU dynamique existant.
- Delta temporel borné pour éviter les sauts après suspension d'un onglet ou ralentissement de la boucle graphique.

## Limites explicites
La navigation est un comportement visuel local : elle ne modifie pas les coordonnées métier, ne déclenche pas d'interaction, ne simule pas de perception ou de combat, et ne garantit pas un évitement dynamique si les routes changent à chaud. Les itinéraires sont recalculés lors du changement de zone ou de la régénération des PNJ. Une validation visuelle multi-appareils reste requise.

## Vérifications automatisées
Tests sur la reproductibilité des routes, l'adjacence des pas, l'absence de recouvrement des itinéraires attribués, l'interpolation, le retour aux extrémités et la robustesse aux deltas temporels anormaux.
