# FA-3D-001 — Direction artistique et interface

Version: 1.0  
Statut: référence validée  
Décisions: stylized 3D / caméra hybride / PC + Android + Web

## 1. Intention visuelle

Univers science-fantasy tactique, lisible en mouvement et reconnaissable à petite taille. Silhouettes exagérées, volumes low-poly propres, matériaux PBR simplifiés, contours de lumière contrôlés et accents énergétiques bleus/cyan avec or chaud pour les éléments interactifs majeurs.

Éviter le photoréalisme coûteux, le bruit visuel et les textes intégrés dans les textures. Les libellés restent dans l'interface localisable.

## 2. Tokens de référence

- Fond principal: #070B16
- Surface: #10182B
- Surface élevée: #151F37
- Bordure: #34456B
- Bleu énergie: #39B9FF
- Cyan secondaire: #75E0E8
- Or de validation / rareté: #F2BD63
- Texte principal: #F5F7FB
- Texte secondaire: #AAB6CC
- Danger: #F06B72
- Succès: #72D6A0

Typographie: sans-serif lisible, hiérarchie courte, chiffres tabulaires pour PV/MP/ressources. Rayon des panneaux 12–18 px; boutons tactiles minimum 44 px.

## 3. Caméra hybride

- Mode Exploration: caméra isométrique orthographique par défaut; rotation par incréments de 90° et zoom continu borné.
- Mode Libre: bascule vers caméra perspective orbitale avec limite de tangage, collision caméra et retour au personnage.
- Mode Combat: caméra tactique orthographique verrouillée; survol de case, portée et zones d'effet affichées.
- PC: WASD/flèches, clic, molette, raccourcis.
- Android: joystick virtuel optionnel, glisser pour orienter, pincement pour zoomer, commandes tactiles contextuelles.
- Web: contrôles souris/clavier et tactile selon capacités détectées.

## 4. Interface

Écrans de référence: accueil/connexion, création d'avatar, monde ouvert, combat tactique, ville/hub, inventaire/équipement, économie, guilde et carte du monde.

HUD monde: identité/niveau/PV/MP en haut gauche; minimap en haut droite; quêtes à gauche; compétences et actions en bas; interactions contextuelles près de la cible. Le HUD doit se replier sur mobile sans masquer la zone de jeu.

## 5. Accessibilité et lisibilité

Contraste texte WCAG AA visé; information non portée uniquement par la couleur; taille de cible tactile >=44 px; réduction des effets et mouvement caméra optionnelle; interface adaptable de 320 px à écran large.

## 6. Règle de cohérence

Le moteur de jeu et les coordonnées logiques restent indépendants du rendu. L'isométrie, le mode libre et la vue tactique sont des présentations du même état du monde, jamais trois simulations divergentes.
