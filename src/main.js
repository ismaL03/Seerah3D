// Point d'entrée : charge les fiches et le relief, construit la carte, branche l'interface.
import { chargerDonnees } from './donnees.js';
import { chargerReliefs } from './relief.js';
import { creerCarte } from './carte.js';
import { creerInterface } from './interface.js';

const ecran = document.getElementById('chargement');
const texte = document.getElementById('chargementTexte');

function erreur(message) {
  ecran.classList.add('erreur');
  texte.textContent = message;
}

try {
  if (location.protocol === 'file:') throw new Error('fichier');
  const [D, R] = await Promise.all([chargerDonnees('data'), chargerReliefs('data/relief')]);
  const ui = creerInterface(D);
  const carte = await creerCarte({
    canvas: document.getElementById('scene'),
    etiquettes: document.getElementById('labels'),
    R, D,
    mobile: matchMedia('(max-width: 900px), (pointer: coarse)').matches,
    reduit: matchMedia('(prefers-reduced-motion: reduce)').matches,
    surLieu: ui.choisirLieu,
    surInteraction: ui.arreterVisite,
    zoneLibre: ui.zoneLibre,
    surImage: ui.surImage,
  });
  ui.demarrer(carte);
  ecran.classList.add('fini');
} catch (e) {
  console.error(e);
  erreur(e.message === 'fichier'
    ? "Ouvrez la carte depuis un serveur web (GitHub Pages, ou « python3 -m http.server » dans le dossier du projet) : le navigateur bloque le chargement des données depuis un fichier local."
    : /WebGL/i.test(String(e)) ? "Votre navigateur ne permet pas l'affichage 3D (WebGL)." : `Erreur de chargement : ${e.message}`);
}
