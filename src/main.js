// Point d'entrée : charge les fiches et le relief, construit la carte, branche l'interface.
import { chargerDonnees } from './donnees.js';
import { chargerReliefs } from './relief.js';
import { creerCarte } from './carte.js';
import { creerInterface } from './interface.js';
import { creerHistoire } from './histoire.js';

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
  const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let jeu = null;
  const carte = await creerCarte({
    canvas: document.getElementById('scene'),
    etiquettes: document.getElementById('labels'),
    R, D,
    mobile: matchMedia('(max-width: 900px), (pointer: coarse)').matches,
    reduit,
    surLieu: (id) => { if (!(jeu && jeu.actif())) ui.choisirLieu(id); },
    surInteraction: ui.arreterVisite,
    zoneLibre: ui.zoneLibre,
    surImage: ui.surImage,
  });
  jeu = creerHistoire({ D, carte, reduit, ouvrirCarte: (id) => ui.ouvrirCarte(id) });
  document.getElementById('histoireBtn').onclick = () => { ui.arreterVisite(); jeu.accueil(); };
  ui.surChapitre = (id) => jeu.jouer(id);
  // Sans lien direct, on ouvre sur l'écran titre du mode histoire ; #histoire/hijra ouvre un chapitre.
  const [type, id] = decodeURIComponent(location.hash.slice(1)).split('/');
  const histoire = !location.hash || type === 'histoire';
  ui.demarrer(carte, { vue: !histoire });
  if (histoire) { if (id) jeu.jouer(id); else jeu.accueil(); }
  if (new URLSearchParams(location.search).has('test')) window.__sira = { carte, jeu, D }; // tests automatisés
  ecran.classList.add('fini');
} catch (e) {
  console.error(e);
  erreur(e.message === 'fichier'
    ? "Ouvrez la carte depuis un serveur web (GitHub Pages, ou « python3 -m http.server » dans le dossier du projet) : le navigateur bloque le chargement des données depuis un fichier local."
    : /WebGL/i.test(String(e)) ? "Votre navigateur ne permet pas l'affichage 3D (WebGL)." : `Erreur de chargement : ${e.message}`);
}
