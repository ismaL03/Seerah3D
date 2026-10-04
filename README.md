# Sîra 3D

Carte 3D interactive pour les cours de **Sîra** (biographie du Prophète ﷺ), puis de **Hajj** et de **'Umra** : lieux, événements, itinéraires, avec leurs sources.

La V1 commence par le module **Sîra** : 23 événements, de la naissance au décès du Prophète ﷺ, et 38 lieux, sur le **relief réel du Hijaz** (Copernicus DEM) rendu en carte stylisée (teintes d'altitude, courbes de niveau), avec des encarts détaillés autour de La Mecque, de Médine, de Badr, de Khaybar, de Tâ'if et d'al-Hudaybiya.

**Mode histoire** : la Sîra se vit aussi comme un récit interactif en 23 chapitres, joué sur la carte et dans dix scènes à la première personne (voir plus bas).

> Toutes les fiches sont des **brouillons à vérifier** : elles citent leurs sources, mais les numéros de page restent à compléter et le contenu doit être validé par un enseignant avant publication.

## Principes

- Aucune représentation humaine sur la carte (ni le Prophète ﷺ, ni les Compagnons, ni personnages) : lieux, bâtiments, animaux et objets seulement. Seule exception, décidée par le porteur du projet : dans les scènes à la première personne du mode histoire, des silhouettes **sans visage** d'anonymes et d'adversaires nommés ; le Prophète ﷺ, les prophètes, les Compagnons et sa famille ne sont jamais représentés.
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

**Liens directs** pour le cours : `#evenement/badr`, `#evenement/hijra`, `#lieu/uhud`… (bouton « lien » dans la fiche), et `#histoire/hijra` pour ouvrir un chapitre du mode histoire.

### Mode histoire

Sans lien direct, la carte s'ouvre sur l'écran titre **« Sur les traces de la Sîra »** (bouton **Mode histoire** dans la barre pour y revenir). Sur la carte, le joueur est un *chroniqueur* : chapitre après chapitre, il retrouve ce qui s'est réellement passé. 82 jeux au total (95 lumières à gagner).

- **Récits** : la caméra se rend sur les lieux (aube, jour ou nuit selon le moment), le texte s'écrit dans un bandeau.
- **Choix** : trois réponses de longueurs comparables (la bonne n'est pas la plus longue : le validateur y veille) ; la bonne suit les sources. Une mauvaise réponse n'est pas signalée tout de suite : l'histoire **continue un peu** sur cette voie, jusqu'à ce que le problème apparaisse ; vient alors la **conséquence imaginaire**, présentée comme telle (« Et si… »), avec une tempête de sable et le fil d'or qui se rompt, puis un **retour dans le temps** jusqu'au moment du choix, avec un indice.
- **Scènes à la première personne** (10 missions) : on marche dans La Mecque, le camp d'Abraha, le port de Shu'ayba, la route de la Hijra, le marché de Médine, al-Hudaybiya, 'Arafa… avec `Z Q S D` (ou `W A S D`, flèches), la souris pour regarder, `E` pour parler, prendre, agir (maintenir `E` pour invoquer), `Maj` pour courir ; sur téléphone, un joystick et un bouton d'action. Missions : réclamer ses chameaux à Abraha (on joue 'Abd al-Muttalib), apporter sa part à la reconstruction de la Ka'ba, répondre à l'appel d'as-Safâ, protéger ses passagers et sortir du port entre les récifs, porter du blé de nuit au vallon assiégé, guider la Hijra ('Abd Allâh ibn Urayqit), vendre au juste poids, rapporter fidèlement ce qu'on a vu à al-Hudaybiya, mettre sa voisine à l'abri le jour de la conquête, accomplir le Hajj pas à pas. Les erreurs se paient plus loin : chute dans un ravin, sentinelles, récifs, mauvais tapis hors des limites de 'Arafa… puis retour au dernier point de reprise. Bouton « Me guider » si l'on est perdu (sans lumière).
- **Représentation** : silhouettes **sans visage** pour les anonymes et les adversaires nommés seulement ; le Prophète ﷺ, les prophètes, les Compagnons et sa famille restent toujours hors champ (lumière, tente, voix en texte), sans aucune parole inventée.
- **Petits jeux** : remettre dans l'ordre (l'enfance du Prophète ﷺ, la nuit de la révélation, les rites du 10 Dhû al-Hijja), associer (devant le Négus, les serments d'al-'Aqaba, les communautés de Médine), vrai ou faux expliqué, estimer une distance ou un effectif au curseur (La Mecque – Tâ'if, la route de la Hijra, les 313 de Badr…).
- **Trouver sur la carte** : toucher La Mecque, Hirâ', as-Safâ, Yathrib, Qubâ', Uhud, le côté ouvert de Médine pour le Fossé… avec la distance et la direction en cas d'erreur.
- **Itinéraires** : choisir le chemin de la Hijra parmi trois tracés ; sur un mauvais tracé, les cavaliers de Quraysh battent la piste (chevaux sans cavalier).
- **Batailles** : Badr et Uhud se déroulent étape par étape entre les questions ; feux de Marr az-Zahrân, voyage nocturne d'al-Isrâ'.
- **Bilan** de chaque chapitre : étoiles, lumières (bonnes réponses du premier coup), « à retenir », divergences et sources ; **carnet de route** des chapitres terminés, progression gardée dans le navigateur.
- Sons : vent, pas et souffles de sable uniquement, **sans musique** ; bouton pour couper le son. **Lecture à voix haute** en option (bouton micro), pratique en classe. Touches : `Espace` (ou `E` dans une scène) pour continuer, `1` `2` `3` pour répondre, `V` / `F` pour vrai ou faux, `Échap` pour le menu.

### Se déplacer

| Geste | Effet |
|---|---|
| glisser | déplacer la carte (le point saisi reste sous le pointeur) |
| clic droit ou Maj + glisser | tourner et incliner la vue |
| molette | zoomer vers le point visé (jusqu'à quelques dizaines de mètres) ; la vue s'incline en s'approchant |
| double-clic | s'approcher du point |
| clic sur une épingle | fiche du lieu : événements, lieux proches, coordonnées, sources |
| **Aller à** (barre du haut) | villes et lieux importants (Ka'ba, mosquée du Prophète ﷺ, Qubâ', Uhud…) |
| mini-carte (en bas à gauche) | se téléporter |
| deux doigts | zoomer, tourner, incliner (tablette, téléphone) |
| ← ↑ → ↓, `+` `−` | se déplacer, zoomer (`Maj` + flèches : tourner, incliner) |
| `Page ↑` `Page ↓` | événement précédent / suivant |
| `?` | aide de navigation |
| `H` | mode immersif : masquer toute l'interface |
| `V` | vol libre : `Z Q S D` (ou `W A S D`, ou flèches) pour avancer, `Espace` / `C` pour monter et descendre, `Maj` pour aller plus vite, souris pour regarder, `Échap` pour sortir |

Les batailles de Badr et d'Uhud ont un onglet **Déroulement** : étapes commentées, blocs d'armée aux couleurs de chaque camp qui marchent, se heurtent dans la poussière, volées de flèches des archers, étendards au vent et flèches de mouvement (sans représentation humaine). Le bouton **Dérouler** enchaîne les étapes.

## Organisation

```
index.html            page de la carte
styles/app.css        mise en page et thèmes jour / nuit
styles/histoire.css   interface du mode histoire
src/                  code (modules JavaScript, Three.js chargé depuis un CDN, version figée)
  main.js             démarrage
  donnees.js          lecture des fiches
  relief.js, png.js   relief réel (PNG 16 bits), projection, encarts
  terrain.js          maillage en tuiles, carte stylisée (teintes d'altitude, courbes de niveau) ou satellite, socle, mer
  decor.js            villes, monuments, camps, palmeraies… (sans personnages)
  montures.js         chameaux, chevaux sans cavalier, boutres, étendards
  bataille.js         déroulement animé des batailles (blocs, mêlées, volées de flèches, étendards)
  carte.js            scène, caméra (orbite et vol libre), épingles, trajets, convois
  interface.js        fiches (événement, lieu), « Aller à », ruban, index, recherche, mini-carte, visite guidée
  histoire.js         mode histoire : chapitres, choix, petits jeux, retour dans le temps, carnet, sons
  monde.js            scènes à la première personne : déplacement, silhouettes sans visage, gardes, ravins, bateau
  mission.js          interprète des missions (data/missions) : objectifs, dialogues, échecs différés, reprises
data/                 contenu modifiable sans toucher au code
  evenements.json     événements (une fiche par événement)
  lieux.json          lieux (coordonnées réelles, certitude) et étapes de trajets
  hadiths.json        hadiths d'al-'Umda reliés aux événements
  batailles.json      déroulement des batailles, étape par étape
  histoire.json       scénario du mode histoire (23 chapitres)
  missions/*.json     les dix scènes à la première personne (décor, personnages, étapes)
  sources.json        ouvrages cités et attributions des données de carte
  relief/             relief et images produits par tools/relief.py
tools/
  valider.py          vérification des fiches (et des missions)
  essais/             essais automatisés (Playwright) : jouer.mjs, mission.mjs, cibles.mjs
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

Pour un lieu (`lieux.json`) : `niveau` 1 (visible sur tout le Hijaz) à 4 (monument dans une ville, visible de près), `ville` (`makkah`, `madinah`), `certitude`, `note_localisation`. Pour une bataille (`batailles.json`) : à chaque étape, `positions` des unités, `fleches`, `chocs`, `combats` (paires d'unités au contact) et `tirs` (volées de flèches).

Le scénario du mode histoire (`histoire.json`) se modifie de la même façon : chaque chapitre suit un événement et enchaîne des étapes `recit`, `choix` (une seule option `"juste": true`, les autres avec une `suite` jouée avant la `consequence` imaginaire et un `indice`), `trouver` (lieu à toucher et rayon en km), `itineraire`, `trajet`, `bataille`, `mission`, `ordre`, `associer`, `vraifaux` et `estimer`. Le champ `_lisez_moi` du fichier détaille chaque champ.

Une mission (`data/missions/<id>.json`) décrit ses `scenes` (sol, collines, ravins, maisons, tentes, personnages, objets, zones ; mètres, x vers l'est, z vers le sud, cap en degrés depuis le nord) et une `sequence` d'étapes : `scene`, `recit`, `parole` (un personnage parle), `choix` (dialogue ; l'option fausse a une `suite` d'étapes avant sa `consequence`), `objectif` (`quand` : `parler`, `zone`, `prendre`, `utiliser`, `tenir` avec `invocation`, `tous`, `ramasser`, `lancer` ; `echecs` : `zone`, `repere` par un garde, `chute` dans un ravin, `recif`, `tenu`…) et `faire` (actions de mise en scène). Les personnages jamais représentés ne doivent pas apparaître en silhouette : le validateur le vérifie.

Après une modification, vérifier les fiches :

```sh
python3 tools/valider.py
```

La même vérification tourne automatiquement sur GitHub à chaque envoi qui touche `data/`.

## Refaire le relief

```sh
pip install -r tools/requirements.txt
python3 tools/relief.py            # Hijaz + encarts (La Mecque, Médine, Badr, Khaybar, Tâ'if, al-Hudaybiya)
```

Le script télécharge les tuiles Copernicus DEM GLO-90 et les images Sentinel-2 (buckets publics AWS) et les garde dans `tools/cache/` (ignoré par git).

## Crédits

- Relief : **Copernicus DEM GLO-90** — © DLR e.V. 2010-2014 et © Airbus Defence and Space GmbH 2014-2018, fourni dans le cadre de COPERNICUS par l'Union européenne et l'ESA.
- Champs de lave (harrât) et vue satellite : **contient des données Copernicus Sentinel modifiées (2024)**.
- Rendu 3D : [Three.js](https://threejs.org) (licence MIT). Polices : Plus Jakarta Sans, Reem Kufi, Amiri (licence SIL OFL, via Google Fonts).
