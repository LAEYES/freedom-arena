# FA-3D-001 — Registre initial des assets

Version: 1.0  
Statut: spécification; aucun asset 3D final n'est déclaré livré.

## Convention

- Format maître: Blender (.blend).
- Échange/runtime: glTF 2.0 (.glb), animations séparées si utile.
- Textures: PNG source; compression GPU (KTX2/Basis) à l'étape d'optimisation.
- Unités: 1 unité moteur = 1 mètre; axe vertical Y.
- Origine des personnages: centre au sol, orientation avant +Z.
- Nommage: FA_[CAT]_[NOM]_[VARIANT]_[Vnn].

## Lots d'assets

| ID | Asset | Quantité initiale | Cible technique | Priorité |
|---|---|---:|---|---|
| FA-CHR-001 | Héros de base | 1 | 8–12k triangles LOD0; rig humanoïde | P0 |
| FA-CHR-002 | PNJ factions | 3 variantes | 6–10k triangles; partage du rig | P1 |
| FA-ENV-001 | Tuiles terrain | 6 familles | herbe, sable, roche, eau, neige, sol construit | P0 |
| FA-ENV-002 | Kit modulaire ville | 12 pièces | murs, portes, tours, toits, plateformes | P0 |
| FA-ENV-003 | Végétation | 8 variantes | arbres, buissons, rochers | P1 |
| FA-ARE-001 | Arène de départ | 1 | scène modulaire, limites lisibles | P0 |
| FA-POI-001 | Balises et points d'intérêt | 5 | silhouettes distinctes, LOD | P1 |
| FA-FX-001 | Effets de combat | 6 | impact, projectile, soin, bouclier, zone, victoire | P1 |
| FA-UI-001 | Icônes HUD | 32 | SVG/atlas, variantes actif/inactif | P0 |
| FA-UI-002 | Emblème Freedom Arena | 1 | SVG source + PNG export | P0 |

## Budget initial de performance

- Héros visible: cible <=12k triangles LOD0; LOD1 <=6k; LOD2 <=2k.
- Texture personnage: 1 atlas 1024² au départ; environnement: atlas 1024²/2048² selon plateforme.
- Draw calls: viser <=100 pour la scène de départ sur mobile milieu de gamme.
- Ombres dynamiques: une lumière directionnelle; basculer vers ombres simplifiées/bakées sur mobile.
- Effets particulaires: plafond initial 500 particules actives, réglable par profil.
- Chargement: scène initiale <15 Mo compressés comme objectif; assets de zones en chargement différé.

Ces valeurs sont des budgets de conception à mesurer, pas des performances déjà obtenues.

## État

Tous les éléments ci-dessus sont des spécifications et tâches de production. Les assets existants dans Assets/ et web/src/ doivent être inventoriés avant remplacement.
