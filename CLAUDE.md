# Sîra 3D — brief du projet

Ce fichier transmet le contexte d'une première conversation (octobre 2026). Lis-le en entier avant de commencer.
Langue de travail avec le porteur du projet : **français**.

## Objectif

Une **carte 3D en ligne, interactive et complète**, servant de support visuel aux cours :
- de **Sîra** (biographie du Prophète ﷺ) ;
- de **Hajj** et de **'Umra**.

Le problème à résoudre : en cours, les élèves ont du mal à se représenter *où* et *quoi*. Quel que soit le cours (Sîra, Hajj, 'Umra), l'enseignant doit pouvoir ouvrir la carte et montrer directement le lieu, l'étape ou l'événement.

Inspiration visuelle : une interface de gestion d'entrepôt (« WareTrack ») vue sur X — diorama 3D isométrique lumineux, textures douces, cartes d'interface flottantes (indicateurs en haut, fiche détaillée à droite, frise de progression en bas, listes à onglets, contrôles de carte verticaux, étiquettes « pilule » au-dessus des lieux).

## État actuel : le prototype

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

- **Aucune représentation humaine** : ni le Prophète ﷺ, ni les prophètes, ni les Compagnons, ni personnages en général. Pas de cavaliers sur les montures. Lieux, bâtiments, animaux et objets seulement.
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

## Décisions encore ouvertes

À poser au porteur du projet au début de la prochaine session :
1. **Par quel module commencer ?** Recommandation : *Hajj & 'Umra* (périmètre fini, très utile en cours, al-'Umda déjà exploitable) — ou *Sîra complète*, ou les deux.
2. **Ouvrage de référence pour la Sîra** : *ar-Rahîq al-Makhtûm* (recommandé), le PDF « سيرة خاتم النبيين » prévu à l'origine, ou Ibn Hishâm + *Zâd al-Ma'âd*.
3. **Fiqh du Hajj/'Umra** : pratique du Prophète ﷺ (hadith de Jâbir) + rite mâlikite (le porteur enseigne le fiqh mâlikite), pratique seule, ou comparaison des quatre écoles.
4. **Hébergement** : GitHub Pages sur ce dépôt public (gratuit, recommandé), avec éventuellement un nom de domaine (~10–15 €/an) — ou lien Claude partagé.

## Pistes techniques

- Rester simple et statique (hébergeable sur GitHub Pages). Three.js chargé depuis un CDN avec version figée, ou petit projet Vite si le code grossit.
- Relief : télécharger les tuiles Copernicus DEM du Hijaz, les convertir en carte de hauteurs (PNG 16 bits ou binaire) par un script Python committé dans `tools/`.
- Données séparées du code : `data/lieux.*`, `data/evenements.*`, `data/hajj.*`, `data/sources.*`, `data/lecons.*`.
- Design repris du prototype : vert émeraude (accent) et or, polices Plus Jakarta Sans (interface), Reem Kufi (titres arabes), Amiri (texte arabe), thèmes jour/nuit.
