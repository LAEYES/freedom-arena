# FA-WORLD-055 — Chargement progressif des chunks

Statut : implémentation isolée, qualification CI à effectuer.  
Branche : `feat/fa-world-055-progressive-chunk-streaming`

## Objectif
Introduire une file de chargement asynchrone bornée pour préparer le streaming progressif du monde. Le mécanisme ne remplace pas le rendu WebGL2 existant et ne modifie pas encore le cycle de rendu de `World3DCanvas`.

## Contrat technique
- Nombre de chargements simultanés borné par `maxConcurrent` (défaut : 2).
- Priorité numérique décroissante ; ordre FIFO pour les priorités égales.
- Déduplication des demandes portant la même clé tant qu'elles sont en attente ou actives.
- Annulation logique par génération : les résultats d'une génération invalidée sont rejetés et ignorés.
- Une tâche active continue d'occuper son emplacement jusqu'à sa terminaison réelle ; une annulation ne prétend pas interrompre une promesse non annulable.
- Statistiques exposées : tâches en attente, actives, terminées et limite de concurrence.

## Limites explicites
Ce lot fournit l'ordonnanceur, pas encore le transport réseau, le décodage d'assets, la persistance disque ni le branchement au renderer. Le chargement actuel des chunks reste synchrone dans le moteur. L'intégration au rendu sera un lot distinct après qualification.

## Critères de qualification
1. Respect strict de la limite de concurrence.
2. Priorité et FIFO déterministes.
3. Déduplication des clés.
4. Gestion des erreurs et invalidation des résultats obsolètes.
5. Entrées invalides rejetées.
6. Tests unitaires et build TypeScript/Vite réussis.

Aucune fusion vers `main` et aucun déploiement ne sont effectués dans ce lot.
