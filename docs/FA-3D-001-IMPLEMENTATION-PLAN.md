# FA-3D-001 — Plan d'intégration, tests et livraison

Version: 1.0  
Branche: feature/fa-3d-001-stylized-hybrid-foundation  
Base auditée: main

## 1. État technique observé

- Application Web React + TypeScript + Vite dans web/.
- Logique de jeu existante: game.ts, world.ts, combat.ts.
- Persistance et présence: adaptateurs Supabase et realtime.
- Rendu 2D Canvas existant dans main.tsx.
- Prototype webgl natif dans World3D.tsx.
- Tests Vitest présents pour game, combat et NPC.
- package.json cible Node >=22 <23 et npm >=10 <11.
- Le package web ne déclare pas Three.js actuellement.

## 2. Points de vigilance du prototype World3D

1. Le prototype crée un contexte WebGL directement; il ne fournit pas encore une vraie caméra orbitale/isométrique contrôlable.
2. Le buffer GPU est alimenté avant l'ajout de certains marqueurs supplémentaires; ces derniers ne sont donc pas inclus dans les données envoyées au GPU.
3. L'effet React dépend des coordonnées du joueur et reconstruit le contexte/rendu à chaque changement de position; déplacer la boucle de rendu vers des références mutables et une boucle stable.
4. Vérifier la libération des ressources GPU sur erreurs de compilation/liens et perte de contexte.
5. La scène prototype utilise une géométrie de démonstration; elle ne consomme pas encore les tuiles 64×64 comme monde complet.

## 3. Architecture cible

- Domaine pur: game.ts, world.ts, combat.ts restent indépendants du moteur graphique.
- Adaptateur: WorldSceneAdapter traduit zones, tuiles, joueur, PNJ et événements vers la scène.
- Rendu: isoler le moteur derrière une interface SceneRenderer; évaluer Three.js comme moteur de scène principal dans un lot dédié, sans migration brutale.
- Contrôles: CameraController (iso/orbit/tactical) et InputAdapter (keyboard/mouse/touch).
- Assets: glTF 2.0; chargement asynchrone, cache et libération explicite.
- Réseau: envoyer des états/actions de jeu, jamais des objets de rendu.
- Monde: chunks logiques 64×64; streaming par zone/chunk; coordonnées monde stables.

## 4. Séquence d'intégration

### FA-3D-001A — Stabilisation du prototype
- Corriger buffer et cycle de vie WebGL.
- Boucle de rendu stable; resize observer; DPR plafonné à 2.
- Gestion WebGL unavailable/context lost.
- Tests de montage/démontage et absence de boucle après démontage.

### FA-3D-001B — Caméra hybride
- Projection orthographique isométrique initiale.
- Rotation 90°, zoom borné, caméra libre orbitale.
- Contrôles clavier/souris/tactile.
- Tests de limites, conversions écran-monde et retour caméra.

### FA-3D-001C — Monde et tuiles
- Définir TileMap 64×64 avec types et collisions.
- Convertisseur de coordonnées logique/rendu.
- Génération de chunk et instanciation groupée.
- Tests déterministes de terrain, collisions et navigation.

### FA-3D-001D — Assets de référence
- Héros, terrain, bâtiment, arbre, balise et arène.
- Rig et animations idle/walk/run/attack/hit.
- Validation glTF, échelle, pivot, matériaux et LOD.

### FA-3D-001E — HUD et multi-plateforme
- HUD desktop et mobile responsive.
- Entrées abstraites; zones tactiles >=44 px.
- Paramètres qualité bas/moyen/haut.
- Tests viewport 320, 390, 768, 1280 et 1920 px.

### FA-3D-001F — Qualification
- Tests unitaires domaine inchangé.
- Tests intégration rendu/caméra/inputs.
- Build TypeScript + Vite.
- Profilage FPS, mémoire, temps de chargement sur appareils de référence.
- Vérification clavier, tactile, accessibilité et perte de connexion.

## 5. Critères d'acceptation

- Le même état de joueur est rendu de manière cohérente en mode iso, libre et combat.
- Le déplacement visuel ne modifie pas directement les règles métier.
- Le mode sans WebGL affiche un repli 2D fonctionnel.
- Aucune ressource GPU ni boucle RAF ne survit au démontage du composant.
- Contrôles utilisables sur PC, Android et navigateur tactile.
- Tests existants conservés et verts; aucune régression sur sauvegarde, combat ou progression.
- Les budgets de performance sont mesurés et consignés avant validation.

## 6. Commandes de validation

Depuis web/ avec Node 22 et npm 10:

```bash
npm install --no-package-lock
npm test
npm run build
```

## 7. Statut de livraison

Cette tranche livre le cahier de conception, le registre d'assets et le plan de qualification sur une branche isolée. Aucun build ni test d'exécution n'a été lancé par ce commit GitHub; le prototype doit être corrigé et validé dans FA-3D-001A avant d'être déclaré prêt.
