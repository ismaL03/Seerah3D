# Sîra 3D — brief du projet

Ce fichier transmet le contexte d'une première conversation (octobre 2026). Lis-le en entier avant de commencer.
Langue de travail avec le porteur du projet : **français**.

## Objectif

Une **carte 3D en ligne, interactive et complète**, servant de support visuel aux cours :
- de **Sîra** (biographie du Prophète ﷺ) ;
- de **Hajj** et de **'Umra**.

Le problème à résoudre : en cours, les élèves ont du mal à se représenter *où* et *quoi*. Quel que soit le cours (Sîra, Hajj, 'Umra), l'enseignant doit pouvoir ouvrir la carte et montrer directement le lieu, l'étape ou l'événement.

Inspiration visuelle : une interface de gestion d'entrepôt (« WareTrack ») vue sur X — diorama 3D isométrique lumineux, textures douces, cartes d'interface flottantes (indicateurs en haut, fiche détaillée à droite, frise de progression en bas, listes à onglets, contrôles de carte verticaux, étiquettes « pilule » au-dessus des lieux).

## État actuel : V1 en cours (depuis le 3 octobre 2026)

La V1 est à la racine du dépôt (`index.html`, `src/`, `styles/`, `data/`, `tools/`). Le `README.md` décrit l'organisation des fichiers et des fiches. Points à connaître :
- **Statique, sans build**, prévu pour GitHub Pages. Three.js **0.186.1** est chargé par importmap depuis jsDelivr (version figée). Code en modules ES, noms en français.
- **Relief réel** : `tools/relief.py` produit `data/relief/hijaz.*` (altitudes en PNG gris 16 bits, valeur = altitude + 1000 m, lues par `src/png.js`) à partir de Copernicus DEM GLO-90 (20″, environ 600 m), plus six **encarts** à 20″/6 (environ 100 m) : `makkah`, `madinah`, `badr`, `khaybar`, `taif`, `hudaybiya`. Leurs bords sont calés sur la grille du Hijaz : un trou dans la carte générale accueille l'encart sans fissure, et les altitudes se fondent sur 2 km. Le relief est exagéré ×6, le relief fin des encarts ×3 environ. La mer porte une profondeur stylisée.
- **Sol stylisé** (4 octobre 2026, le porteur trouvait l'image satellite « trop floue » et en contraste avec les objets posés dessus ; il veut des distances et des hauteurs fidèles, pas la photo) : shader de `src/terrain.js` avec teintes d'altitude (`PALIERS` / `TEINTES`), roche sur les pentes, harrât en basalte sombre (masque tiré de Sentinel-2), oasis vertes (`OASIS` dans `src/decor.js`), courbes de niveau tous les 100 m et 500 m, facettes nettes. L'image satellite brute reste derrière un bouton (« aujourd'hui »).
- **Unités de la scène** : 1 = 1 km. Les bâtiments et les arbres ont une taille iconique agrandie. Ils sont posés grâce à `R.metres()`, qui interpole exactement comme les triangles affichés.
- **Données** : `data/evenements.json` (les 23 événements du prototype, tous `à vérifier`, source *ar-Rahîq* avec `page: null`, divergences signalées), `data/lieux.json` (38 lieux, vraies coordonnées, `certitude`, `niveau` de zoom 1 à 4 — 4 = monument dans une ville, visible de près —, `ville`, `type`, `hors_carte` avec ancre pour Tabûk, al-Quds et l'Abyssinie), `data/hadiths.json`, `data/sources.json`.
- **Contrôle** : `python3 tools/valider.py` vérifie champs, renvois, ﷺ après « Prophète », pages obligatoires si `validé`, positions dans la carte. Une action GitHub le lance quand `data/` change.
- **Tests visuels** : en session cloud, jsDelivr est bloqué. Servir le dépôt (`python3 -m http.server`) et, dans Playwright, rediriger `cdn.jsdelivr.net/npm/three@0.186.1/**` vers un `node_modules/three` local.

- **Interface (4 octobre 2026, à la demande du porteur : « plus discret, plus élégant, plus moderne »)** : barre haute compacte (marque, contexte, menu **« Aller à »**, recherche, outils, aide `?`), fiche à onglets réductible en pastille — fiche d'événement (Récit, Déroulement, Repères, Sources) ou **fiche de lieu** (Présentation avec les événements du lieu et les lieux proches, Repères avec coordonnées et altitude, Sources) —, index dans un tiroir (lieux regroupés par ville), ruban chronologique à échelle d'années, mini-carte cliquable, mode immersif (`H`), aide de navigation montrée au premier lancement. Sur téléphone, la fiche démarre réduite.
- **Navigation** (le porteur la trouvait « compliquée ») : le point saisi reste sous le pointeur, élan au lâcher, zoom progressif vers le pointeur avec inclinaison automatique (vue de haut de loin, relief de près), clavier (flèches pour se déplacer, `Maj` + flèches pour tourner, `+` / `−`, `Page ↑ / ↓` pour les événements). Clic sur une épingle = fiche du lieu ; lien `#lieu/…`.
- **Immersion** : zoom jusqu'à ~80 m, caméra qui ne traverse pas le relief, double-clic pour s'approcher, **vol libre** (`V`, touches lues par position physique `e.code`, donc ZQSD et WASD), grain de détail du sol visible de près.
- **Villes** (`decor.js`) : maisons de quatre types (basse à parapet, à étage, à cour, tour *utum* de Yathrib), taille ×1,6 ; ~850 maisons à La Mecque, hameaux de Médine, Khaybar, Tâ'if ; Ka'ba avec Hijr Ismâ'îl et Zamzam (×2) ; palmeraies denses. Lieux importants : mosquée du Prophète ﷺ et al-Hujurât, maison d'Abû Ayyûb, al-Baqî', marché, Saqîfa, mosquées des deux qiblas et du vendredi ; à La Mecque as-Safâ et al-Marwa, Dâr al-Arqam, Dâr an-Nadwa, maison de Khadîja, lieu de naissance, al-Hajûn. Instances regroupées par blocs d'1 km, masquées au-delà de 6,5 km (arbres) ou 14 km (maisons).
- **Convois** (`montures.js`) : caravanes de chameaux, armées (chameaux, chevaux sans cavalier, étendard), boutres pour la mer Rouge ; vitesse liée au zoom.
- **Batailles** (`data/batailles.json`, `bataille.js`) : Badr et Uhud en cinq étapes, blocs d'armée aux couleurs des camps, pions abstraits, flèches. Schémas approximatifs `à vérifier`. Animation (le porteur voulait « un petit peu plus animé ») : marche cadencée, étendards au vent, mêlée au contact (`combats` : pions qui poussent vers l'ennemi de leur côté, bouffées de poussière), volées de flèches (`tirs`), flèches de mouvement qui se tracent, lecture automatique (« Dérouler »). `vue` fixe la direction de la caméra (de côté, pour voir les deux lignes).
- **Décision du 4 octobre 2026** : à la question des « personnages qui s'affrontent », le porteur a répondu **« On garde la règle »** : batailles en blocs schématiques, sans personnages.
- **Mode histoire** (4 octobre 2026, demande du porteur : « transformer cette carte en jeu / histoire », avec des choix menant à des situations correctes ou non, et retour en arrière après une mauvaise situation, « en restant fidèle à l'historique ») : `src/histoire.js`, `styles/histoire.css`, scénario `data/histoire.json` (23 chapitres, un par événement, 131 étapes). Le joueur est un **chroniqueur** (aucun personnage, on ne joue pas le Prophète ﷺ) ; la bonne réponse suit les sources ; une mauvaise mène à une **conséquence imaginaire** explicitement signalée (« Et si… », « Scénario imaginaire »), jamais une faute attribuée au Prophète ﷺ, puis à un retour dans le temps. Étapes : récit, choix, trouver sur la carte (cible + rayon), itinéraire (tracés candidats ; mauvais tracé = cavaliers de Quraysh, chevaux sans cavalier), trajet, bataille. Écran titre à l'aube au chargement (sauf lien direct), bilan (étoiles, lumières, à retenir, divergences, sources), carnet, sauvegarde `localStorage` (`sira3d.histoire`). Sons procéduraux (vent, sable), **sans musique** ; lecture à voix haute en option (synthèse vocale du navigateur, ﷺ prononcé en entier). La carte expose pour cela : `ambiance` (aube/jour/nuit), `viser`, `derive`, `etiquettes` (filtre), `viserSol`, `marque`/`eclat`, `itineraires`, `trajetLibre` (type `poursuite`), `feux`, `epoque`, `projeter`. Tests : `?test` expose `window.__sira` (carte, jeu, données) ; `tools/essais/jouer.mjs <chapitre>` joue un chapitre entier (erreurs volontaires puis bonnes réponses) et `tools/essais/cibles.mjs` vérifie que chaque lieu à trouver est visible dans sa vue (ordinateur et téléphone). Attention : une classe ajoutée à `<body>` ne doit jamais porter le nom d'une classe d'élément (bogue rencontré : `j-consigne`).
- **Décision du 4 octobre 2026 (mode histoire, scènes à la première personne)** : le porteur veut des scènes jouables en vue subjective (ZQSD), avec des missions, des personnes avec qui interagir, des silhouettes qui marchent « sans représenter les visages ». Réponses aux deux questions posées :
  - **Silhouettes sans visage autorisées** pour les **anonymes** (passants, marchands, soldats, foule) et les **adversaires nommés** (Abraha, chefs de Quraysh…). **Jamais** le Prophète ﷺ, les prophètes, les Compagnons ni sa famille : ils restent hors champ (voix en texte, porte, tente, lumière), et on ne leur prête **aucune parole inventée** (seulement des paroles rapportées par les sources).
  - **Le joueur** est un témoin anonyme ou **parfois un personnage réel secondaire** (ex. 'Abd al-Muttalib devant Abraha, le guide 'Abd Allâh ibn Urayqit), jamais un prophète ni un Compagnon. En vue subjective, son corps n'est pas montré.
  - Autres demandes : détailler davantage le récit ; varier les jeux (vue subjective, quiz, défis… « une cinquantaine ») ; dans les quiz, la bonne réponse ne doit pas être la plus longue ; après un mauvais choix, laisser le joueur continuer un peu avant que le problème n'apparaisse (chute dans un ravin, capture…), puis bouton de retour en arrière ; Abraha a **voulu** détruire la Ka'ba, il n'y est pas parvenu.
- **Performance** : terrain en tuiles (culling), normales calculées depuis le relief (pas de couture), le relief ne projette pas d'ombre, plans proche et lointain adaptés à la hauteur de la caméra (pas de tampon logarithmique), finesse de rendu adaptative. Dans le Chromium logiciel de test, une image prend ~1 s : utiliser `reducedMotion: 'reduce'` dans Playwright pour figer convois et batailles avant une capture.

Vérification syntaxique : `node --check` ne signale pas les doublons de déclaration dans ces modules ; utiliser `node --input-type=module --check < fichier.js`.

Prochaines étapes envisagées : compléter la chronologie (ghazawât et sarâyâ) d'après *ar-Rahîq* une fois l'édition connue, mode *Atlas* (fiche par lieu), mode cours (leçons), puis module *Hajj & 'Umra* (encart du Haram, limites, mawâqît).

## Le prototype

`prototype/sira-3d.html` — un seul fichier HTML, Three.js r128 (cdnjs), sans build. Il a servi à valider le rendu. Contenu :
- carte **stylisée** du Hijaz (relief procédural, positions approximatives, pas à l'échelle) ;
- 23 événements de la naissance au décès du Prophète ﷺ, 18 lieux, 7 catégories colorées ;
- objets qui apparaissent selon l'époque (mosquée après la Hijra, Fossé à partir de 5 H, camps de Badr / al-Hudaybiya) ;
- trajets animés (caravane de chameaux sans cavalier) ; orbe lumineux pour al-Isrâ' ;
- fiche détaillée, indicateurs (âge, année H, période), frise, listes, recherche, visite guidée, mode jour/nuit, version mobile ;
- astuce technique utile : `camera.setViewOffset` pour centrer la vue dans la zone laissée libre par les panneaux.

Version publiée (privée, accessible au porteur du projet) : https://claude.ai/artifact/AhdaULFquSfb5Xw6LuDxmB

Le prototype est une **référence de style et d'ergonomie**, pas une base de code à conserver telle quelle.

## Vision de la V1 (proposée, à confirmer)

1. **Géographie réelle, rendu stylisé** : relief réel (Copernicus DEM GLO-30 ou SRTM), vraies coordonnées pour chaque lieu, en gardant le style « diorama » du prototype.
2. **Trois niveaux de zoom** :
   - Hijaz : La Mecque, Médine, Badr, Khaybar, Tâ'if ; en bordure Tabûk, ash-Shâm, l'Abyssinie ;
   - villes : La Mecque avec Minâ, Muzdalifa, 'Arafa ; Médine avec Uhud, Qubâ', al-Baqî', le Fossé ;
   - sites : al-Masjid al-Harâm (Ka'ba, Hijr Ismâ'îl, Maqâm Ibrâhîm, Safâ–Marwa), mawâqît, limites du Haram, de 'Arafa (wâdî 'Urana exclu), de Minâ (wâdî Muhassir).
3. **Trois modes sur la même carte** :
   - *Sîra* : chronologie complète, périodes mecquoise et médinoise, ghazawât et sarâyâ ;
   - *Hajj & 'Umra* : étapes jour par jour (8 → 13 Dhû al-Hijja), étapes de la 'Umra, bascule **« à l'époque du Prophète ﷺ / aujourd'hui »** ;
   - *Atlas* : une fiche par lieu (nom arabe, translittération, événements, sources, certitude de la localisation).
4. **Mode cours** : plein écran, leçons = suite d'étapes (vue caméra + texte + lieux mis en avant), lien direct vers chaque lieu/événement (ancre `#lieu` simple).
5. **Contenu modifiable sans code** : fiches dans un tableur (ou JSON) que le porteur peut compléter ; chaque fiche a un statut `à vérifier` / `validé` et cite sa source avec la page.

## Règles non négociables

- **Aucune représentation humaine** : ni le Prophète ﷺ, ni les prophètes, ni les Compagnons, ni personnages en général. Pas de cavaliers sur les montures. Lieux, bâtiments, animaux et objets seulement. *Exception décidée par le porteur le 4 octobre 2026, pour les scènes à la première personne du mode histoire uniquement* : silhouettes **sans visage** d'anonymes et d'adversaires nommés (voir « Décision du 4 octobre 2026 » plus haut) ; le Prophète ﷺ, les prophètes, les Compagnons et sa famille restent toujours hors champ.
- Toujours **ﷺ** après le nom du Prophète.
- **Chaque fiche cite sa source** (ouvrage + page). Le contenu est validé par un enseignant avant publication ; tu rédiges des brouillons, tu ne présentes jamais un contenu non validé comme définitif.
- Signaler les **divergences** (dates, effectifs, localisations) au lieu de trancher en silence. Localisation : `certaine` / `probable` / `discutée`.
- **Droits d'auteur** : les atlas servent de référence, on ne copie pas leurs cartes, on les redessine. Citations courtes. **Ne jamais committer de PDF de livres** : ce dépôt est public.
- Interface en français, noms propres aussi en écriture arabe. Translittération du prototype : â î û pour les voyelles longues, ' pour 'ayn et hamza.

## Sources proposées

**Sîra**
- al-Mubârakfûrî, *ar-Rahîq al-Makhtûm* (trad. fr. *Le Nectar cacheté*) — base proposée pour la structure.
- Ibn Hishâm, *as-Sîra an-Nabawiyya* ; Ibn Sa'd, *at-Tabaqât al-Kubrâ* ; Ibn al-Qayyim, *Zâd al-Ma'âd*.
- Akram Diyâ' al-'Umarî, *as-Sîra an-Nabawiyya as-Sahîha* (authenticité).

**Géographie**
- 'Âtiq al-Bilâdî, *Mu'jam al-Ma'âlim al-Jughrâfiyya fî as-Sîra an-Nabawiyya*.
- Sâmî al-Maghlûth, *al-Atlas at-Târîkhî li-Sîrat ar-Rasûl ﷺ* et *Atlas al-Hajj wa al-'Umra*.
- Shawqî Abû Khalîl, *Atlas as-Sîra an-Nabawiyya*.
- al-Azraqî, *Akhbâr Makka* ; as-Samhûdî, *Wafâ' al-Wafâ* (Médine).

**Hajj**
- Hadith de Jâbir (*Sahîh Muslim*) sur le Hajj du Prophète ﷺ — fil conducteur du mode Hajj (cf. al-Albânî, *Hajjat an-Nabî ﷺ*).
- *al-'Umda*, Livre du Hajj (voir ci-dessous).

**Données de carte** : Copernicus DEM GLO-30 et Sentinel-2 (relief, imagerie), OpenStreetMap pour l'état actuel (licence ODbL, attribution obligatoire).

## Le PDF « al-'Umda fî al-Ahkâm »

Le porteur a d'abord envoyé un PDF intitulé « سيرة خاتم النبيين », mais il contient en réalité **« العمدة في الأحكام » de 'Abd al-Ghanî al-Maqdisî** (238 pages, série *Mutûn Tâlib al-'Ilm*). Ce n'est **pas une sîra**. Le bon PDF de sîra reste à obtenir.

Particularité technique : la couche texte du PDF est inutilisable (police à encodage propriétaire). Il faut rendre les pages en images (PyMuPDF) et les lire visuellement.
Page imprimée = page du PDF + 10.

Hadiths d'al-'Umda reliés à des événements de la Sîra (déjà intégrés au prototype) :

| Événement | Hadith n° | Page imprimée | Page PDF | Rapporteur |
|---|---|---|---|---|
| Hijra | 1 | 13 | 3 | 'Umar ibn al-Khattâb (« les actes selon les intentions… son émigration ») |
| Conquête de La Mecque | 214 | 126 | 116 | Abû Shurayh al-Khuzâ'î (sacralité de La Mecque) |
| Conquête de La Mecque | 217 | 130 | 120 | Anas ibn Mâlik (entrée avec le mighfar) |
| Pèlerinage d'adieu | 226 | 133 | 123 | Ibn 'Umar (tamattu' dans la Hajjat al-Wadâ') |
| Pèlerinage d'adieu | 235 | 141 | 131 | Jâbir (changer le hajj en 'umra) |
| Hunayn | 399 | 236 | 226 | Abû Qatâda (dépouilles à Hunayn) |
| Banû an-Nadîr | 405 | 238 | 228 | 'Umar (biens des Banû an-Nadîr, fay') |
| Uhud et le Fossé | 407 | 239 | 229 | Ibn 'Umar (refusé à 14 ans à Uhud, accepté à 15 au Fossé) |

Le **Livre du Hajj** d'al-'Umda (pages imprimées ≈ 121 à 148) est directement exploitable pour le mode Hajj & 'Umra : mawâqît (p. 121), ce que porte le muhrim (123), fidya (125), sacralité de La Mecque (126), ce qu'il est permis de tuer (129), entrée à La Mecque (130), tamattu' (133), hady (137), ghusl du muhrim (139), changer le hajj en 'umra (141), gibier (146).

## Décisions prises (3 octobre 2026)

Réponses du porteur du projet aux quatre questions ouvertes :
1. **Module de départ : la Sîra complète** (chronologie, périodes mecquoise et médinoise, ghazawât et sarâyâ). Le mode *Hajj & 'Umra* vient ensuite.
2. **Ouvrage de référence pour la Sîra : *ar-Rahîq al-Makhtûm*** (al-Mubârakfûrî). Les numéros de page restent à compléter d'après l'édition du porteur. Ne jamais inventer une page : laisser `page: null` tant qu'elle n'est pas vérifiée.
3. **Fiqh du Hajj et de la 'Umra : ce que pratiquent principalement les agences de 'Umra/Hajj aujourd'hui** (pratique courante, et non comparaison des écoles ni rite mâlikite seul). Comme chaque fiche doit citer une source écrite avec la page, il faudra choisir avec le porteur un guide de référence écrit qui décrit cette pratique.
4. **Hébergement : GitHub Pages** sur ce dépôt public.

## Pistes techniques

- Rester simple et statique (hébergeable sur GitHub Pages). Three.js chargé depuis un CDN avec version figée, ou petit projet Vite si le code grossit.
- Relief : télécharger les tuiles Copernicus DEM du Hijaz, les convertir en carte de hauteurs (PNG 16 bits ou binaire) par un script Python committé dans `tools/`.
- Données séparées du code : `data/lieux.*`, `data/evenements.*`, `data/hajj.*`, `data/sources.*`, `data/lecons.*`.
- Design repris du prototype : vert émeraude (accent) et or, polices Plus Jakarta Sans (interface), Reem Kufi (titres arabes), Amiri (texte arabe), thèmes jour/nuit.
