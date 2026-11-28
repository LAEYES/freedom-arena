# FA-WORLD-008 — Renderer WebGL2 isométrique jouable

- Version : 1.0
- Date : 2026-11-28
- Branche : feat/fa-world-engine-p0
- Dépendances : FA-WORLD-002 à FA-WORLD-006
- Statut : CI réussie ; prototype intégré au sélecteur 2D/3D ; validation visuelle sur appareils réels encore requise.

## 1. Architecture

Le renderer 3D est ajouté dans un composant React autonome :
- `web/src/world/World3DCanvas.tsx`
- `web/src/world/worldRenderer.ts`

Il utilise WebGL2 natif, sans dépendance graphique externe. Le Canvas 2D historique est conservé et reste sélectionnable.

## 2. Géométrie

- Monde : 64 × 64 cellules, 4 096 tiles.
- Chunks : 16 × 16, 16 chunks au total.
- Géométrie terrain : face supérieure et quatre faces latérales par cellule.
- Maillage terrain : 122 880 sommets, 6 composantes flottantes par sommet (position XYZ + couleur RGB).
- Biomes : grass, forest, water, rock, sand, snow.
- Relief : altitude convertie en hauteur monde.
- Avatar : personnage low-poly composé de six primitives cubiques (jambes, torse, tête, bras).

## 3. Caméra

Caméra orthographique utilisant le modèle FA-WORLD-003 :
- azimut initial : 45°,
- élévation : atan(1/√2),
- cadrage initial automatique selon le ratio du viewport,
- zoom multiplicatif,
- rotation gauche/droite par pas de 15°,
- réinitialisation de la caméra.

Les matrices View et Projection sont envoyées au vertex shader WebGL2.

## 4. Interaction

- Clic sur une cellule : sélection par distance au centre projeté.
- Navigation : A* cardinal, avec coûts et obstacles issus du terrain généré.
- Déplacement : animation pas-à-pas.
- Clavier : flèches directionnelles, WASD et ZQSD.
- Compatibilité gameplay : chaque pas est soumis au callback historique `moveTile`; un pas refusé arrête la séquence. Le renderer ne contourne donc pas les règles de déplacement existantes.
- Zone interactive : limites de compatibilité 60 × 40 du gameplay historique, alors que le terrain affiché reste 64 × 64.

## 5. Intégration UI

Un sélecteur permet de basculer entre :
- `3D WebGL` : nouveau renderer.
- `2D Canvas` : renderer historique.

Le HUD indique position du joueur, nombre de cellules, nombre de chunks et état de navigation. Si WebGL2 est indisponible ou si l'initialisation échoue, un message propose de revenir au Canvas 2D.

## 6. Qualification

Tests du module `worldRenderer.ts` :
- nombre de sommets du terrain,
- géométrie low-poly de l'avatar,
- palette RGB normalisée,
- conversion altitude monde,
- picking de la tuile la plus proche.

Résultats GitHub Actions :
- Web build, run #185 : **success**.
- Vitest : **74/74 tests réussis**, 11 fichiers de test.
- TypeScript : **success**.
- Vite production build : **success**.
- Hostinger Deploy, run #105 : build réussi ; étape `Upload dist to Hostinger` **skipped** car pull request.

## 7. Limites et réserves

- La CI valide la compilation et les tests unitaires, pas un test visuel automatisé dans un navigateur réel.
- Le rendu repose sur WebGL2 ; WebGL1 n'est pas implémenté.
- Les textures d'assets, éclairage dynamique, ombres, météo 3D et animation squelettique ne sont pas inclus.
- Le terrain est généré par seed par zone ; sa topologie n'est pas encore reliée au catalogue historique de tuiles du jeu.
- Le gameplay historique reste maître de l'acceptation des déplacements.
- Le chargement de chunks est géré en mémoire ; aucun streaming réseau ou worker n'est activé.
- Aucun merge vers `main`, aucune migration de sauvegarde et aucun déploiement Hostinger.

## 8. Décision

**FA-WORLD-008 : BUILD ET TESTS CI VALIDÉS — PROTOTYPE INTÉGRÉ.**

Le noyau 3D WebGL2 est maintenant sélectionnable depuis l'interface de jeu. La validation visuelle sur navigateurs/appareils cibles reste à réaliser avant promotion du renderer 3D comme mode par défaut de production.
