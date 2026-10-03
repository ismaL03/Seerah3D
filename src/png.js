// Décodeur minimal de PNG en niveaux de gris 16 bits (cartes d'altitude).
// On ne passe pas par un canvas : certains navigateurs y brouillent les pixels lus
// (protection contre le pistage), ce qui fausserait les altitudes.

export async function lirePNG16(tampon) {
  const o = new Uint8Array(tampon), v = new DataView(tampon);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((b, i) => o[i] === b)) throw new Error('PNG invalide');
  let pos = 8, largeur = 0, hauteur = 0;
  const morceaux = [];
  while (pos < o.length) {
    const n = v.getUint32(pos), type = String.fromCharCode(...o.subarray(pos + 4, pos + 8));
    const donnees = o.subarray(pos + 8, pos + 8 + n);
    if (type === 'IHDR') {
      largeur = v.getUint32(pos + 8); hauteur = v.getUint32(pos + 12);
      const [profondeur, couleur, , , entrelace] = donnees.subarray(8, 13);
      if (profondeur !== 16 || couleur !== 0 || entrelace !== 0) throw new Error('PNG attendu : gris 16 bits, non entrelacé');
    } else if (type === 'IDAT') morceaux.push(donnees);
    else if (type === 'IEND') break;
    pos += 12 + n;
  }
  const flux = new Blob(morceaux).stream().pipeThrough(new DecompressionStream('deflate'));
  const brut = new Uint8Array(await new Response(flux).arrayBuffer());
  // Filtres PNG, ligne par ligne (2 octets par pixel).
  const bpp = 2, pasLigne = largeur * bpp, px = new Uint8Array(pasLigne * hauteur);
  for (let y = 0; y < hauteur; y++) {
    const filtre = brut[y * (pasLigne + 1)], src = y * (pasLigne + 1) + 1, dst = y * pasLigne;
    for (let i = 0; i < pasLigne; i++) {
      const a = i >= bpp ? px[dst + i - bpp] : 0, b = y ? px[dst - pasLigne + i] : 0, c = i >= bpp && y ? px[dst - pasLigne + i - bpp] : 0;
      let p = brut[src + i];
      if (filtre === 1) p += a;
      else if (filtre === 2) p += b;
      else if (filtre === 3) p += (a + b) >> 1;
      else if (filtre === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[dst + i] = p;
    }
  }
  const valeurs = new Uint16Array(largeur * hauteur);
  for (let k = 0; k < valeurs.length; k++) valeurs[k] = (px[2 * k] << 8) | px[2 * k + 1];
  return { largeur, hauteur, valeurs };
}
