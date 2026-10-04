# Sîra 3D

Carte 3D interactive pour les cours de **Sîra** (biographie du Prophète ﷺ), puis de **Hajj** et de **'Umra** : lieux, événements, itinéraires, avec leurs sources.

La V1 commence par le module **Sîra** : 23 événements, de la naissance au décès du Prophète ﷺ, sur le **relief réel du Hijaz** (Copernicus DEM), avec des encarts détaillés autour de La Mecque et de Médine.

> Toutes les fiches sont des **brouillons à vérifier** : elles citent leurs sources, mais les numéros de page restent à compléter et le contenu doit être validé par un enseignant avant publication.

## Principes

- Aucune représentation humaine (ni le Prophète ﷺ, ni les Compagnons, ni personnages) : lieux, bâtiments, animaux et objets seulement.
- Chaque fiche cite sa source (ouvrage + page) et porte un statut `à vérifier` / `validé`.
- Les divergences (dates, effectifs, localisations) sont signalées ; chaque lieu a une certitude `certaine` / `probable` / `discutée`.
- Les atlas servent de référence ; leurs cartes ne sont pas copiées. Aucun PDF de livre dans ce dépôt (public).

## Voir la carte

**En ligne** (GitHub Pages) : une fois activé, la carte est à l'adresse `https://ismal03.github.io/Seerah3D/`.
Pour l'activer : *Settings → Pages → Build and deployment → Source : Deploy from a branch → `main` / `(root)`*.

**Sur son ordinateur** : le navigateur refuse de charger les données depuis un simple fichier ; il faut un petit serveur.

```sh
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

**Liens directs** pour le cours : `#evenement/badr`, `#evenement/hijra`, `#lieu/uhud`… (bouton « lien » dans la fiche).

### Se déplacer

| Geste | Effet |
|---|---|
| glisser | déplacer la carte |
| clic droit ou Maj + glisser | tourner et incliner la vue |
| molette | zoomer vers le point visé (jusqu'à quelques dizaines de mètres) |
| double-clic | s'y rendre |
| mini-carte (en bas à gauche) | se téléporter |
| deux doigts | zoomer, tourner, incliner (tablette, téléphone) |
| ← → | événement précédent / suivant |
| `H` | mode immersif : masquer toute l'interface |
| `V` | vol libre : `Z Q S D` (ou `W A S D`, ou flèches) pour avancer, `Espace` / `C` pour monter et descendre, `Maj` pour aller plus vite, souris pour regarder, `Échap` pour sortir |

Les batailles de Badr et d'Uhud ont un onglet **Déroulement** : étapes commentées, blocs d'armée aux couleurs de chaque camp, étendards et flèches de mouvement (sans représentation humaine).

## Organisation

```
index.html            page de la carte
styles/app.css        mise en page et thèmes jour / nuit
src/                  code (modules JavaScript, Three.js chargé depuis un CDN, version figée)
  main.js             démarrage
  donnees.js          lecture des fiches
  relief.js, png.js   relief réel (PNG 16 bits), projection, encarts
  terrain.js          maillage en tuiles, habillage stylisé ou satellite, socle, mer
  decor.js            villes, monuments, camps, palmeraies… (sans personnages)
  montures.js         chameaux, chevaux sans cavalier, boutres, étendards
  bataille.js         déroulement des batailles (blocs, étendards, flèches)
  carte.js            scène, caméra (orbite et vol libre), épingles, trajets, convois
  interface.js        récit, ruban chronologique, index, recherche, mini-carte, visite guidée
data/                 contenu modifiable sans toucher au code
  evenements.json     événements (une fiche par événement)
  lieux.json          lieux (coordonnées réelles, certitude) et étapes de trajets
  hadiths.json        hadiths d'al-'Umda reliés aux événements
  batailles.json      déroulement des batailles, étape par étape
  sources.json        ouvrages cités et attributions des données de carte
  relief/             relief et images produits par tools/relief.py
tools/
  valider.py          vérification des fiches
  relief.py           fabrication du relief et des images satellite
prototype/            première maquette (référence de style)
```

## Modifier le contenu

Les fiches sont dans `data/*.json`. Chaque fichier commence par un champ `_lisez_moi` qui rappelle ses règles. Pour une fiche d'événement :

| Champ | Rôle |
|---|---|
| `statut` | `à vérifier` ou `validé` (une fiche validée doit avoir toutes ses pages) |
| `sources` | liste de `{ "ouvrage": "rahiq", "page": 123, "passage": "…" }` ; `page: null` = à compléter |
| `divergences` | liste de `{ "sujet": "…", "texte": "…" }` |
| `lieu` | identifiant d'un lieu de `lieux.json` |
| `trajet` | `{ "type": "caravane" \| "armee" \| "mer" \| "nuit", "etapes": ["madinah", [24.3, 39.35], "badr"] }` |

Après une modification, vérifier les fiches :

```sh
python3 tools/valider.py
```

La même vérification tourne automatiquement sur GitHub à chaque envoi qui touche `data/`.

## Refaire le relief

```sh
pip install -r tools/requirements.txt
python3 tools/relief.py            # Hijaz + encarts de La Mecque et de Médine
```

Le script télécharge les tuiles Copernicus DEM GLO-90 et les images Sentinel-2 (buckets publics AWS) et les garde dans `tools/cache/` (ignoré par git).

## Crédits

- Relief : **Copernicus DEM GLO-90** — © DLR e.V. 2010-2014 et © Airbus Defence and Space GmbH 2014-2018, fourni dans le cadre de COPERNICUS par l'Union européenne et l'ESA.
- Couleurs du sol et vue satellite : **contient des données Copernicus Sentinel modifiées (2024)**.
- Rendu 3D : [Three.js](https://threejs.org) (licence MIT). Polices : Plus Jakarta Sans, Reem Kufi, Amiri (licence SIL OFL, via Google Fonts).
