// Relief réel (Copernicus DEM) et projection des coordonnées sur la carte.
// Unités de la scène : 1 = 1 km. x vers l'est, z vers le sud, y vers le haut (altitude exagérée).
// La carte du Hijaz (≈ 600 m) est complétée par des encarts détaillés (≈ 100 m) autour de
// La Mecque et de Médine ; leurs bords sont calés sur la grille du Hijaz et leurs altitudes
// s'y fondent sur une bande de 2 km, pour un raccord sans fissure.
// Entre les points de la grille, l'altitude est interpolée par une courbe cubique (la même ici et
// dans le shader du terrain) : le sol est arrondi, sans facettes, et les objets y sont posés exactement.

import { lirePNG16 } from './png.js';

export const EXAGERATION = 6;
const FONDU = 2;      // km
const DETAIL = 0.5;   // part du relief fin des encarts conservée (sinon ×6 le rend « alpin »)

// Part de lissage de l'interpolation : 0 = Catmull-Rom (passe par les points de la grille),
// 1 = B-spline (plus douce : arrondit les pics isolés que l'exagération ×6 rendrait pointus).
// Les encarts restent interpolants, pour retrouver exactement le Hijaz sur leurs bords.
export const LISSAGE = { hijaz: 0.7, encart: 0 };

// Poids des quatre points voisins pour une position t ∈ [0, 1] entre les deux du milieu.
export function poidsCubiques(t, k, w) {
  const t2 = t * t, t3 = t2 * t, u = 1 - t;
  w[0] = (1 - k) * 0.5 * (-t3 + 2 * t2 - t) + k * u * u * u / 6;
  w[1] = (1 - k) * 0.5 * (3 * t3 - 5 * t2 + 2) + k * (3 * t3 - 6 * t2 + 4) / 6;
  w[2] = (1 - k) * 0.5 * (-3 * t3 + 4 * t2 + t) + k * (-3 * t3 + 3 * t2 + 3 * t + 1) / 6;
  w[3] = (1 - k) * 0.5 * (t3 - t2) + k * t3 / 6;
  return w;
}
const WC = [0, 0, 0, 0], WR = [0, 0, 0, 0];

const lisse = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

async function charger(dossier, zone, projection) {
  const meta = await (await fetch(`${dossier}/${zone}.json`)).json();
  const png = await lirePNG16(await (await fetch(`${dossier}/${zone}.png`)).arrayBuffer());
  if (png.largeur !== meta.largeur || png.hauteur !== meta.hauteur) throw new Error(`Relief ${zone} : dimensions inattendues`);
  const alt = new Int16Array(png.valeurs.length);
  for (let k = 0; k < alt.length; k++) alt[k] = png.valeurs[k] - meta.decalage;
  return new Relief(meta, alt, projection);
}

export async function chargerReliefs(dossier) {
  const R = await charger(dossier, 'hijaz');
  const encarts = await Promise.all((R.meta.encarts || []).map((z) => charger(dossier, z, R)));
  encarts.forEach((E) => E.fondre(R));
  return new Reliefs(R, encarts);
}

export class Relief {
  constructor(meta, alt, projection) {
    this.meta = meta;
    this.alt = alt;
    this.W = meta.largeur;
    this.H = meta.hauteur;
    const e = meta.emprise;
    this.ouest = e.ouest; this.est = e.est; this.sud = e.sud; this.nord = e.nord;
    this.pas = (e.est - e.ouest) / this.W;
    // Un encart partage la projection du Hijaz ; ses sommets extrêmes sont posés sur son emprise.
    this.encart = !!meta.encart;
    const p = projection || { lat0: (e.sud + e.nord) / 2, lon0: (e.ouest + e.est) / 2 };
    this.lat0 = p.lat0; this.lon0 = p.lon0;
    this.kx = 111.32 * Math.cos(this.lat0 * Math.PI / 180);
    this.kz = 110.57;
    this.exag = EXAGERATION / 1000; // mètres → unités de scène
    this.final = null;              // altitudes des sommets après fondu (encarts)
    this.lissage = this.encart ? LISSAGE.encart : LISSAGE.hijaz;
    // passage grille → scène : x = ax + bx·colonne, z = az + bz·ligne
    this.bx = (this.encart ? (e.est - e.ouest) / (this.W - 1) : this.pas) * this.kx;
    this.ax = ((this.encart ? e.ouest : e.ouest + this.pas / 2) - this.lon0) * this.kx;
    this.bz = (this.encart ? (e.nord - e.sud) / (this.H - 1) : this.pas) * this.kz;
    this.az = -((this.encart ? e.nord : e.nord - this.pas / 2) - this.lat0) * this.kz;
    const [x0, z0] = this.xz(this.nord, this.ouest), [x1, z1] = this.xz(this.sud, this.est);
    this.bornes = { x0, x1, z0, z1 };
  }

  xz(lat, lon) { return [(lon - this.lon0) * this.kx, -(lat - this.lat0) * this.kz]; }
  latlon(x, z) { return [this.lat0 - z / this.kz, this.lon0 + x / this.kx]; }

  // Position géographique du point (colonne c, ligne r) de la grille.
  lonCol(c) { return this.encart ? this.ouest + c * (this.est - this.ouest) / (this.W - 1) : this.ouest + (c + 0.5) * this.pas; }
  latLig(r) { return this.encart ? this.nord - r * (this.nord - this.sud) / (this.H - 1) : this.nord - (r + 0.5) * this.pas; }
  colDe(lon) { return this.encart ? (lon - this.ouest) / (this.est - this.ouest) * (this.W - 1) : (lon - this.ouest) / this.pas - 0.5; }
  ligDe(lat) { return this.encart ? (this.nord - lat) / (this.nord - this.sud) * (this.H - 1) : (this.nord - lat) / this.pas - 0.5; }

  // Altitudes de la grille telles qu'affichées (après fondu pour un encart).
  grille() { return this.final || this.alt; }

  // Altitude en mètres au point (x, z) : interpolation cubique de la grille, identique à celle du
  // shader du terrain, pour que bâtiments et arbres soient posés exactement sur le sol.
  metres(x, z) {
    const W = this.W, H = this.H, g = this.grille();
    let c = (x - this.ax) / this.bx, r = (z - this.az) / this.bz;
    c = c < 0 ? 0 : c > W - 1 ? W - 1 : c; r = r < 0 ? 0 : r > H - 1 ? H - 1 : r;
    const ci = Math.min(W - 2, Math.floor(c)), ri = Math.min(H - 2, Math.floor(r));
    poidsCubiques(c - ci, this.lissage, WC); poidsCubiques(r - ri, this.lissage, WR);
    let s = 0;
    for (let j = 0; j < 4; j++) {
      const rr = Math.min(H - 1, Math.max(0, ri - 1 + j)) * W;
      s += WR[j] * (WC[0] * g[rr + Math.max(0, ci - 1)] + WC[1] * g[rr + ci] + WC[2] * g[rr + ci + 1] + WC[3] * g[rr + Math.min(W - 1, ci + 2)]);
    }
    return s;
  }

  // Altitude brute (m), bilinéaire, à une position (colonne, ligne) fractionnaire de la grille.
  metresPixel(c, r) {
    const W = this.W, H = this.H, a = this.alt;
    c = Math.min(W - 1, Math.max(0, c)); r = Math.min(H - 1, Math.max(0, r));
    const c0 = Math.floor(c), r0 = Math.floor(r), c1 = Math.min(W - 1, c0 + 1), r1 = Math.min(H - 1, r0 + 1);
    const fc = c - c0, fr = r - r0;
    const h0 = a[r0 * W + c0] * (1 - fc) + a[r0 * W + c1] * fc;
    const h1 = a[r1 * W + c0] * (1 - fc) + a[r1 * W + c1] * fc;
    return h0 * (1 - fr) + h1 * fr;
  }

  dedans(x, z, marge = 0) {
    const b = this.bornes;
    return x >= b.x0 + marge && x <= b.x1 - marge && z >= b.z0 + marge && z <= b.z1 - marge;
  }

  // Poids de l'encart (0 au bord, 1 à plus de FONDU km du bord).
  poids(x, z) {
    const b = this.bornes;
    return lisse(0, FONDU, Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z));
  }

  // Fond l'encart dans la carte générale : le grand relief vient du Hijaz, le relief fin de
  // l'encart (atténué), avec un poids nul au bord pour un raccord exact.
  fondre(R) {
    this.final = new Float32Array(this.W * this.H);
    for (let r = 0; r < this.H; r++) for (let c = 0; c < this.W; c++) {
      const [x, z] = R.xz(this.latLig(r), this.lonCol(c)), w = this.poids(x, z), base = R.metres(x, z);
      this.final[r * this.W + c] = base + w * DETAIL * (this.alt[r * this.W + c] - base);
    }
  }
}

// Carte générale + encarts : même interface qu'un Relief pour le reste du code.
export class Reliefs {
  constructor(R, encarts) {
    this.R = R; this.encarts = encarts;
    this.meta = R.meta; this.bornes = R.bornes; this.exag = R.exag;
  }
  xz(lat, lon) { return this.R.xz(lat, lon); }
  latlon(x, z) { return this.R.latlon(x, z); }
  encartEn(x, z) { return this.encarts.find((E) => E.dedans(x, z)); }
  metres(x, z) { const E = this.encartEn(x, z); return E ? E.metres(x, z) : this.R.metres(x, z); }
  y(x, z) { return this.metres(x, z) * this.exag; }
  sol(x, z) { return Math.max(0, this.y(x, z)); }
  // Pente locale (dénivelé en mètres par km), pour placer maisons et arbres sur le plat.
  pente(x, z) {
    const d = 0.25;
    return Math.hypot(this.metres(x + d, z) - this.metres(x - d, z), this.metres(x, z + d) - this.metres(x, z - d)) / (2 * d);
  }
  dedans(x, z, marge = 0) { return this.R.dedans(x, z, marge); }
}
