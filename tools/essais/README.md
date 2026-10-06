# Essais automatisés

Scripts Playwright pour vérifier la carte dans un vrai navigateur.

```sh
cd tools/essais && npm install            # playwright et three (copie locale de Three.js)
cd ../.. && python3 -m http.server 8000   # dans un autre terminal, à la racine du dépôt
node tools/essais/jouer.mjs hijra         # joue un chapitre (erreurs volontaires puis bonnes réponses)
node tools/essais/jouer.mjs badr --captures /tmp/captures
node tools/essais/cibles.mjs              # chaque lieu à trouver est-il visible dans sa vue ?
```

Variables : `BASE` (adresse du serveur, par défaut `http://127.0.0.1:8000/`), `CHROMIUM` (chemin d'un Chromium déjà installé).
L'adresse `?test` expose `window.__sira` (carte, jeu, données) pour ces scripts. Sans carte graphique, le rendu
logiciel est lent (environ une image par seconde) : les scripts attendent quelques images avant de viser.
