# FA-WORLD-010C — Animations procédurales des PNJ

## Objectif
Introduire des poses vivantes et déterministes pour les PNJ 3D, sans modifier leur position logique, leur activité métier ni les règles d'interaction.

## Implémentation
- Chaque PNJ reçoit un déphasage calculé par hachage stable de son identifiant.
- Les animations utilisent des oscillations procédurales bornées : balancement opposé des membres et léger mouvement vertical du torse.
- L'amplitude et la vitesse dépendent de l'activité existante : patrouille, défense, observation ou commerce.
- La géométrie des PNJ est reconstruite dans un buffer GPU dynamique distinct du décor statique.
- Le nombre de PNJ étant actuellement limité à quatre par zone, la reconstruction CPU par frame reste bornée et évite toute mutation des données du monde.
- Les interactions, coordonnées et décisions de déplacement restent exclusivement gouvernées par le modèle de jeu existant.

## Limites connues
Cette livraison ne crée pas d'IA autonome, de navigation PNJ, de squelette articulé, ni de trajectoires de patrouille. Le mouvement est visuel uniquement. Une validation visuelle sur navigateur et appareil mobile reste nécessaire.

## Tests
Tests unitaires ajoutés pour la stabilité des phases par identifiant, la différence entre pose au repos et pose animée, la reproductibilité et la conservation de la topologie du mesh.
