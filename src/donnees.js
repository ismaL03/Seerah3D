// Chargement des fiches (data/*.json) et résolution des positions.

export async function chargerDonnees(dossier) {
  const lire = async (f) => (await fetch(`${dossier}/${f}`)).json();
  const [lieux, evenements, hadiths, sources, batailles, histoire] = await Promise.all(
    ['lieux.json', 'evenements.json', 'hadiths.json', 'sources.json', 'batailles.json', 'histoire.json'].map(lire)
  );
  const LIEUX = Object.fromEntries(lieux.lieux.map((l) => [l.id, l]));
  const ETAPES = Object.fromEntries(Object.entries(lieux.etapes).filter(([k]) => !k.startsWith('_')));
  const HADITHS = Object.fromEntries(hadiths.hadiths.map((h) => [h.id, h]));
  const EVENEMENTS = evenements.evenements;
  const INDEX = Object.fromEntries(EVENEMENTS.map((e, i) => [e.id, i]));
  return {
    LIEUX, ETAPES, HADITHS, EVENEMENTS, INDEX,
    CATEGORIES: evenements.categories,
    JALONS: evenements.jalons.map((j) => ({ ...j, i: INDEX[j.evenement] })),
    OUVRAGES: sources.ouvrages,
    BATAILLES: batailles.batailles,
    HISTOIRE: histoire,
    DONNEES_CARTE: sources.donnees_carte,
  };
}

// Position affichée d'un lieu : son ancre au bord de la carte s'il est hors cadre.
export function positionLieu(l) {
  return l.hors_carte ? l.hors_carte.ancre : [l.lat, l.lon];
}

// Étapes d'un trajet → liste de [lat, lon].
export function pointsTrajet(D, trajet) {
  return trajet.etapes.map((e) => {
    if (Array.isArray(e)) return e;
    if (D.LIEUX[e]) return positionLieu(D.LIEUX[e]);
    if (D.ETAPES[e]) return [D.ETAPES[e].lat, D.ETAPES[e].lon];
    throw new Error(`Étape inconnue dans un trajet : ${e}`);
  });
}
