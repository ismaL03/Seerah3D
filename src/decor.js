// Décor : villes, monuments, camps, palmeraies… placés aux vraies coordonnées.
// Les bâtiments sont agrandis d'environ 1,6 fois pour rester lisibles ; aucune représentation humaine.
// Maisons et arbres sont regroupés par blocs d'un kilomètre, masqués quand la caméra s'éloigne.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Oasis historiques : verdies sur la carte et plantées de palmiers. Positions approximatives.
export const OASIS = [
  { nom: 'Médine', lat: 24.452, lon: 39.612, rayon: 4.2, densite: 190 },
  { nom: "al-'Âliya", lat: 24.438, lon: 39.640, rayon: 2.6, densite: 190 },
  { nom: 'Khaybar', lat: 25.700, lon: 39.290, rayon: 4.0, densite: 120 },
  { nom: "Tâ'if", lat: 21.262, lon: 40.405, rayon: 3.0, densite: 80 },
  { nom: 'Badr', lat: 23.735, lon: 38.770, rayon: 0.8, densite: 60 },
  { nom: 'Marr az-Zahrân', lat: 21.620, lon: 39.690, rayon: 3.0, densite: 90 },
];

// Tracé approximatif du Fossé, au nord de Médine, entre les deux champs de lave.
const FOSSE = [[24.4745, 39.5850], [24.4810, 39.5965], [24.4865, 39.6090], [24.4850, 39.6240], [24.4790, 39.6370]];

// Hameaux de Yathrib (positions indicatives, sans attribution aux clans).
const HAMEAUX = [
  [24.4672, 39.6112, 0.38, 170, 2], [24.4393, 39.6173, 0.30, 60, 2], [24.4450, 39.6350, 0.35, 55, 3],
  [24.4500, 39.6260, 0.30, 45, 2], [24.4760, 39.6200, 0.30, 45, 2], [24.4640, 39.5990, 0.30, 40, 2], [24.4570, 39.6080, 0.25, 35, 1],
];

const BLOC = 1;            // km
const PORTEE_MAISONS = 14; // km : au-delà, maisons masquées
const PORTEE_ARBRES = 6.5; // km : au-delà, arbres masqués

let graine = 7;
const alea = () => { graine = (graine * 16807) % 2147483647; return (graine - 1) / 2147483646; };
const M = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.9, metalness: 0 }, o || {}));

// ---------- modèles (unité = emprise d'une maison, couleurs par sommet) ----------
const BLANC = [1, 1, 1], PORTE = [0.34, 0.24, 0.17], BAIE = [0.3, 0.24, 0.2], RIVE = [0.9, 0.88, 0.85];
function boite(w, h, d, x, y, z, rgb) {
  const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z);
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(rgb).flat(), 3));
  return g;
}
function parapet(w, d, y, e = 0.07, h = 0.09) {
  return [boite(w, h, e, 0, y, -d / 2 + e / 2, RIVE), boite(w, h, e, 0, y, d / 2 - e / 2, RIVE),
    boite(e, h, d - 2 * e, -w / 2 + e / 2, y, 0, RIVE), boite(e, h, d - 2 * e, w / 2 - e / 2, y, 0, RIVE)];
}
const MODELES = {
  basse: () => mergeGeometries([boite(1, 0.55, 1, 0, 0.275, 0, BLANC), ...parapet(1, 1, 0.595),
    boite(0.2, 0.32, 0.03, 0.15, 0.16, 0.505, PORTE), boite(0.12, 0.1, 0.03, -0.25, 0.38, 0.505, BAIE), boite(0.03, 0.1, 0.12, 0.505, 0.38, 0.1, BAIE)]),
  etage: () => mergeGeometries([boite(1, 0.5, 1, 0, 0.25, 0, BLANC), boite(0.55, 0.42, 0.55, -0.2, 0.71, -0.2, BLANC),
    ...parapet(0.55, 0.55, 0.965).map((g) => g.translate(-0.2, 0, -0.2)), boite(0.45, 0.07, 0.07, 0.25, 0.535, 0.465, RIVE), boite(0.07, 0.07, 0.4, 0.465, 0.535, 0.28, RIVE),
    boite(0.2, 0.3, 0.03, 0.2, 0.15, 0.505, PORTE), boite(0.1, 0.1, 0.03, -0.2, 0.75, 0.08, BAIE)]),
  cour: () => mergeGeometries([boite(1, 0.5, 0.32, 0, 0.25, -0.34, BLANC), boite(0.3, 0.5, 0.68, -0.35, 0.25, 0.16, BLANC), boite(0.3, 0.5, 0.68, 0.35, 0.25, 0.16, BLANC),
    boite(0.4, 0.22, 0.06, 0, 0.11, 0.47, BLANC), boite(0.16, 0.26, 0.03, -0.35, 0.13, 0.505, PORTE), boite(0.1, 0.09, 0.03, 0.35, 0.33, 0.505, BAIE)]),
  tour: () => mergeGeometries([boite(0.55, 1.5, 0.55, 0, 0.75, 0, BLANC),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]].map(([a, b]) => boite(0.12, 0.13, 0.12, a * 0.215, 1.565, b * 0.215, RIVE)),
    boite(0.16, 0.26, 0.03, 0, 0.13, 0.29, PORTE), boite(0.05, 0.16, 0.03, 0, 0.9, 0.29, BAIE), boite(0.03, 0.16, 0.05, 0.29, 1.15, 0, BAIE)]),
  palmier: () => {
    const tronc = new THREE.CylinderGeometry(0.035, 0.06, 1, 5, 1, true); tronc.translate(0, 0.5, 0);
    tronc.setAttribute('color', new THREE.Float32BufferAttribute(new Array(tronc.attributes.position.count).fill([0.55, 0.42, 0.28]).flat(), 3));
    const palmes = [];
    for (let k = 0; k < 7; k++) {
      const p = new THREE.PlaneGeometry(0.15, 0.72); p.rotateX(-Math.PI / 2); p.translate(0, 0, 0.36); p.rotateX(0.32 + (k % 2) * 0.18);
      p.rotateY(k * Math.PI * 2 / 7); p.translate(0, 1, 0);
      p.setAttribute('color', new THREE.Float32BufferAttribute(new Array(p.attributes.position.count).fill([0.36, 0.56, 0.24]).flat(), 3));
      palmes.push(p.toNonIndexed());
    }
    return mergeGeometries([tronc.toNonIndexed(), ...palmes]);
  },
  acacia: () => {
    const t = new THREE.CylinderGeometry(0.05, 0.07, 0.6, 5, 1, true); t.translate(0, 0.3, 0);
    t.setAttribute('color', new THREE.Float32BufferAttribute(new Array(t.attributes.position.count).fill([0.48, 0.36, 0.24]).flat(), 3));
    const c = new THREE.IcosahedronGeometry(0.5, 0); c.scale(1.3, 0.38, 1.3); c.translate(0, 0.7, 0);
    c.setAttribute('color', new THREE.Float32BufferAttribute(new Array(c.attributes.position.count).fill([0.45, 0.56, 0.28]).flat(), 3));
    return mergeGeometries([t.toNonIndexed(), c]); // l'icosaèdre n'est pas indexé
  },
  lanterne: () => new THREE.SphereGeometry(0.06, 6, 4),
};

export function creerDecor(R, D) {
  const groupe = new THREE.Group();
  const P = (lat, lon) => R.xz(lat, lon);
  const ici = (id) => P(D.LIEUX[id].lat, D.LIEUX[id].lon);
  const i = (id) => D.INDEX[id];
  const ere = [];          // objets dont la visibilité dépend de l'événement courant
  const ajoute = (m, x, y, z, parent = groupe) => { m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  function pose(x, z, echelle, parent = groupe) {
    const g = new THREE.Group(); g.position.set(x, R.y(x, z), z); g.scale.setScalar(echelle); parent.add(g); return g;
  }

  // ---------- occupation du sol (évite que maisons et arbres se chevauchent) ----------
  const occupe = new Map(), CASE = 0.02;
  const cle = (x, z) => `${Math.floor(x / CASE)},${Math.floor(z / CASE)}`;
  function libre(x, z, r) {
    const n = Math.ceil(r / CASE);
    for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) {
      const v = occupe.get(`${Math.floor(x / CASE) + a},${Math.floor(z / CASE) + b}`);
      if (v && Math.hypot(v[0] - x, v[1] - z) < r + v[2]) return false;
    }
    return true;
  }
  const occuper = (x, z, r) => occupe.set(cle(x, z), [x, z, r]);
  function reserver(x, z, r) { // réserve un disque (monument, place)
    for (let a = -r; a <= r; a += CASE) for (let b = -r; b <= r; b += CASE) if (a * a + b * b <= r * r) occupe.set(cle(x + a, z + b), [x + a, z + b, CASE]);
  }

  // ---------- blocs d'instances ----------
  const blocs = new Map();
  const geos = {}, mats = {
    maison: M(0xffffff, { vertexColors: true }),
    arbre: M(0xffffff, { vertexColors: true, side: THREE.DoubleSide }),
    lanterne: new THREE.MeshBasicMaterial({ color: 0xFFC46B }),
  };
  function placer(modele, x, z, s, ry, couleur, h = s) {
    const k = `${Math.floor(x / BLOC)},${Math.floor(z / BLOC)}`;
    let b = blocs.get(k);
    if (!b) {
      const bx = (Math.floor(x / BLOC) + 0.5) * BLOC, bz = (Math.floor(z / BLOC) + 0.5) * BLOC;
      b = { x: bx, z: bz, y: R.y(bx, bz), lots: {}, meshes: [] }; blocs.set(k, b);
    }
    (b.lots[modele] ||= []).push({ x, y: R.y(x, z) - 0.001, z, s, h, ry, couleur });
  }

  function semer(cx, cz, rayon, n, test, gauss = false) {
    const out = []; let essais = 0;
    while (out.length < n && essais < n * 30) {
      essais++;
      const a = alea() * Math.PI * 2;
      const r = gauss ? Math.min(rayon, Math.abs(rayon * 0.45 * Math.sqrt(-2 * Math.log(alea() + 1e-9)))) : Math.sqrt(alea()) * rayon;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (test && !test(x, z)) continue;
      out.push([x, z]);
    }
    return out;
  }

  // Une ville : maisons regroupées autour d'un centre, sur les fonds de vallée.
  const TEINTES_MECQUE = ['#E3D2B1', '#D8C29C', '#CDB48C', '#E8DCC4', '#C9AE86'].map((c) => new THREE.Color(c));
  const TEINTES_MEDINE = ['#C9A27A', '#BD9369', '#D2B08A', '#B48A60', '#D8BC96'].map((c) => new THREE.Color(c));
  function ville(lat, lon, rayon, n, { teintes, melange, tours = 0, denivele = 45, pente = 260 }) {
    const [cx, cz] = P(lat, lon), h0 = R.metres(cx, cz);
    const ok = (x, z, r) => R.pente(x, z) < pente && R.metres(x, z) < h0 + denivele && libre(x, z, r);
    for (const [x, z] of semer(cx, cz, rayon, n, (x, z) => ok(x, z, 0.016), true)) {
      const t = alea(), modele = t < melange[0] ? 'basse' : t < melange[0] + melange[1] ? 'etage' : 'cour';
      const s = 0.02 + alea() * 0.012;
      occuper(x, z, s * 0.62);
      placer(modele, x, z, s, Math.round(alea() * 4) * Math.PI / 2 + (alea() - 0.5) * 0.3, teintes[Math.floor(alea() * teintes.length)]);
    }
    for (const [x, z] of semer(cx, cz, rayon * 0.8, tours, (x, z) => ok(x, z, 0.02), false)) {
      occuper(x, z, 0.016);
      placer('tour', x, z, 0.024, alea() * 6, teintes[Math.floor(alea() * teintes.length)]);
    }
  }

  // ---------- Ka'ba, Hijr Ismâ'îl, Zamzam (taille ×2) ----------
  {
    const [x, z] = ici('makkah'), g = pose(x, z, 0.002); // unité : le mètre, taille ×2
    const sable = M(0xEDE3CC), noir = M(0x1B1B1D, { roughness: 0.7 }), or = M(0xC9A043, { metalness: 0.5, roughness: 0.4 });
    const parvis = ajoute(new THREE.Mesh(new THREE.CylinderGeometry(26, 26, 0.6, 48), sable), 0, 0.2, 0, g); parvis.castShadow = false;
    const k = new THREE.Group(); k.rotation.y = Math.PI / 4; g.add(k); // angles orientés vers les points cardinaux
    ajoute(new THREE.Mesh(new THREE.BoxGeometry(12, 13, 10), noir), 0, 6.5, 0, k);
    ajoute(new THREE.Mesh(new THREE.BoxGeometry(12.15, 1, 10.15), or), 0, 9.6, 0, k);
    ajoute(new THREE.Mesh(new THREE.BoxGeometry(1.8, 3.2, 0.2), or), 1.8, 3.6, 5.05, k); // porte, surélevée
    // Hijr Ismâ'îl : muret en arc devant la face nord-ouest
    const hijr = new THREE.Mesh(new THREE.TorusGeometry(7.5, 0.6, 6, 24, Math.PI), M(0xEFEAE0));
    hijr.rotation.set(-Math.PI / 2, 0, 0); ajoute(hijr, 0, 0.6, -5, k); hijr.scale.z = 2.4; // arc vers l'extérieur
    ajoute(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 1.2, 16), M(0xB9A27E)), 14, 0.6, 9); // Zamzam
    reserver(x, z, 0.05);
  }

  // ---------- Mosquée du Prophète ﷺ (briques crues, toiture de palmes) ----------
  {
    const [x, z] = ici('madinah'), g = pose(x, z, 0.011), boue = M(0xB98C5F), toit = M(0x7F6143);
    ajoute(new THREE.Mesh(new THREE.BoxGeometry(7, 0.1, 6.4), M(0xE2CDA6)), 0, 0.05, 0, g);
    [[0, -3.1], [0, 3.1]].forEach(([a, b]) => ajoute(new THREE.Mesh(new THREE.BoxGeometry(7, 1, 0.3), boue), a, 0.5, b, g));
    ajoute(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1, 6.4), boue), -3.4, 0.5, 0, g);
    ajoute(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1, 2.4), boue), 3.4, 0.5, -2, g);
    ajoute(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1, 2.4), boue), 3.4, 0.5, 2, g);
    ajoute(new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.14, 1.9), toit), 0, 1.15, -2, g);
    ajoute(new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.14, 1.3), toit), 0, 1.15, 2.4, g);
    for (let k = 0; k < 5; k++) ajoute(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 5), toit), -2.6 + k * 1.3, 0.55, -1.3, g);
    // al-Hujurât : les chambres des épouses, accolées au mur est, toits de palmes, portes sur la mosquée
    const brique = M(0xD2B48C), palmes = M(0x6E5538);
    for (let k = 0; k < 5; k++) {
      const zz = -2.6 + k * 1.3;
      ajoute(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 1.15), brique), 4.2, 0.4, zz, g);
      ajoute(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 1.25), palmes), 4.2, 0.85, zz, g);
      ajoute(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.35), palmes), 3.58, 0.25, zz, g); // porte (rideau)
    }
    ere.push({ o: g, visible: (k) => k >= i('hijra') });
    reserver(x, z, 0.08);
  }

  // ---------- Mosquée de Qubâ' ----------
  {
    const [x, z] = ici('quba'), g = pose(x, z, 0.009), boue = M(0xB98C5F);
    [[0, -1.4], [0, 1.4]].forEach(([a, b]) => ajoute(new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 0.25), boue), a, 0.4, b, g));
    [-1.4, 1.4].forEach((a) => ajoute(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.8, 3), boue), a, 0.4, 0, g));
    ere.push({ o: g, visible: (k) => k >= i('hijra') });
    reserver(x, z, 0.03);
  }

  // ---------- Le Fossé ----------
  {
    const g = new THREE.Group(); groupe.add(g);
    const sombre = M(0x4E3B2D), terre = M(0xC9A37A);
    for (let k = 0; k < FOSSE.length - 1; k++) {
      const [ax, az] = P(...FOSSE[k]), [bx, bz] = P(...FOSSE[k + 1]);
      const L = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bz - az, bx - ax), n = Math.ceil(L / 0.1);
      for (let s = 0; s < n; s++) { // tronçons courts, pour épouser le relief
        const t = (s + 0.5) / n, mx = ax + (bx - ax) * t, mz = az + (bz - az) * t;
        const f = ajoute(new THREE.Mesh(new THREE.BoxGeometry(L / n + 0.004, 0.004, 0.014), sombre), mx, R.y(mx, mz) + 0.001, mz, g);
        f.rotation.y = -ang; f.castShadow = false;
        const nx = Math.sin(ang) * 0.016, nz = -Math.cos(ang) * 0.016; // remblai côté nord
        const m = ajoute(new THREE.Mesh(new THREE.BoxGeometry(L / n + 0.004, 0.006, 0.01), terre), mx + nx, R.y(mx + nx, mz + nz) + 0.002, mz + nz, g);
        m.rotation.y = -ang;
      }
    }
    ere.push({ o: g, visible: (k) => k >= i('khandaq') });
  }

  // ---------- Camps (tentes, sans personnages) ----------
  const tente = new THREE.ConeGeometry(0.75, 0.9, 4); tente.rotateY(Math.PI / 4); tente.translate(0, 0.45, 0);
  function camp(lat, lon, rayon, n, couleur, quand) {
    const [cx, cz] = P(lat, lon), g = new THREE.Group(), mat = M(couleur);
    semer(cx, cz, rayon, n, (x, z) => R.pente(x, z) < 200).forEach(([x, z]) => {
      const t = new THREE.Mesh(tente, mat); t.position.set(x, R.y(x, z) - 0.001, z); t.rotation.y = alea() * 6; t.scale.setScalar(0.012 + alea() * 0.004);
      t.castShadow = true; g.add(t);
    });
    groupe.add(g); ere.push({ o: g, visible: quand });
  }
  camp(23.743, 38.779, 0.25, 26, 0xF4EEE2, (k) => k === i('badr'));   // musulmans, côté proche (al-'Udwa ad-Dunyâ)
  camp(23.721, 38.764, 0.35, 50, 0x7C4B3C, (k) => k === i('badr'));   // Quraysh, côté éloigné (al-'Udwa al-Quswâ)
  camp(24.4955, 39.6000, 0.3, 50, 0x7C4B3C, (k) => k === i('uhud')); // Quraysh à Uhud
  camp(21.444, 39.620, 0.4, 60, 0xF4EEE2, (k) => k === i('hudaybiya'));
  camp(21.618, 39.695, 0.8, 140, 0xF4EEE2, (k) => k === i('fath'));    // Marr az-Zahrân
  camp(21.352, 39.975, 0.7, 120, 0xF4EEE2, (k) => k === i('hajj'));    // 'Arafa

  // ---------- Puits de Badr ----------
  {
    const [x0, z0] = ici('badr'), mat = M(0x9B8466);
    for (let k = 0; k < 4; k++) {
      const x = x0 + 0.05 * k - 0.07, z = z0 + 0.03 * k;
      ajoute(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.006, 12), mat), x, R.y(x, z) + 0.002, z);
    }
  }

  // ---------- Fortins de Khaybar ----------
  {
    const pierre = M(0xA88B6A), base = D.LIEUX.khaybar;
    [[0.022, 0.012], [-0.016, 0.020], [0.030, -0.018], [-0.020, -0.026], [0.004, 0.034], [0.012, -0.034]].forEach(([dla, dlo]) => {
      const [x, z] = P(base.lat + dla, base.lon + dlo), g = pose(x, z, 0.02);
      ajoute(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 3, 10), pierre), 0, 1.4, 0, g);
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; ajoute(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), pierre), Math.cos(a) * 1.05, 3.05, Math.sin(a) * 1.05, g); }
      ajoute(new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 2.6), pierre), 1.4, 0.5, 0.6, g);
      reserver(x, z, 0.06);
    });
  }

  // ---------- Rempart de Tâ'if ----------
  {
    const [cx, cz] = ici('taif'), pierre = M(0xB79C78), r = 0.75, n = 90;
    for (let k = 0; k < n; k++) {
      if (k % 30 === 7) continue; // portes
      const a = k / n * Math.PI * 2, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const tour = k % 6 === 0;
      const s = ajoute(new THREE.Mesh(new THREE.BoxGeometry(tour ? 0.03 : 0.054, tour ? 0.024 : 0.014, tour ? 0.03 : 0.01), pierre), x, R.y(x, z) + (tour ? 0.012 : 0.007), z);
      s.rotation.y = -a + Math.PI / 2;
    }
  }

  // ---------- Jabal ar-Rahma ('Arafa) ----------
  {
    const [x, z] = ici('arafat');
    ajoute(new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.003, 0.03, 8), M(0xF5F2EA)), x, R.y(x, z) + 0.015, z);
  }

  // ---------- Lieux importants de Médine et de La Mecque (taille iconique) ----------
  const site = (id) => { const L = D.LIEUX[id]; return L ? P(L.lat, L.lon) : null; };
  const pierre = M(0xA48E72), stele = M(0xCFC3AE), toile = [M(0xC9893A), M(0x3F5E8C), M(0x9E3B2E), M(0xE4D3A8)].map((m) => { m.side = THREE.DoubleSide; return m; });
  function batisse(id, modele, taille, couleur, ry = 0) { // une maison remarquable (modèle à couleurs par sommet)
    const xz = site(id); if (!xz) return null;
    const m = new THREE.Mesh(MODELES[modele](), M(couleur, { vertexColors: true }));
    m.scale.setScalar(taille); m.rotation.y = ry;
    ajoute(m, xz[0], R.y(...xz) - 0.001, xz[1]);
    reserver(xz[0], xz[1], taille * 0.8);
    return m;
  }
  function cimetiere(id, w, d, n, murs = true) {
    const xz = site(id); if (!xz) return;
    const [cx, cz] = xz, g = new THREE.Group(); groupe.add(g);
    if (murs) [[0, -d / 2, w, 0.003], [0, d / 2, w, 0.003], [-w / 2, 0, 0.003, d], [w / 2, 0, 0.003, d]].forEach(([a, b, ww, dd]) =>
      ajoute(new THREE.Mesh(new THREE.BoxGeometry(ww, 0.005, dd), pierre), cx + a, R.y(cx + a, cz + b) + 0.0025, cz + b, g));
    for (let k = 0; k < n; k++) {
      const x = cx + (alea() - 0.5) * w * 0.9, z = cz + (alea() - 0.5) * d * 0.9;
      const t = ajoute(new THREE.Mesh(new THREE.BoxGeometry(0.0016, 0.0022, 0.0035), stele), x, R.y(x, z) + 0.001, z, g);
      t.rotation.y = 0.3; t.castShadow = false;
    }
    reserver(cx, cz, Math.max(w, d) * 0.6);
  }
  function enclos(id, cote, quand) { // petite mosquée en briques crues, comme celle de Qubâ'
    const xz = site(id); if (!xz) return;
    const g = pose(xz[0], xz[1], cote / 3), boue = M(0xB98C5F);
    [[0, -1.4], [0, 1.4]].forEach(([a, b]) => ajoute(new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 0.25), boue), a, 0.4, b, g));
    [-1.4, 1.4].forEach((a) => ajoute(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.8, 3), boue), a, 0.4, 0, g));
    ajoute(new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 1.1), M(0x7F6143)), 0, 0.85, -0.85, g);
    if (quand) ere.push({ o: g, visible: quand });
    reserver(xz[0], xz[1], cote * 0.7);
  }
  // Médine
  cimetiere('baqi', 0.12, 0.09, 140);
  batisse('ayyub', 'etage', 0.034, 0xD2B08A, 0.4);
  enclos('qiblatayn', 0.03, (k) => k >= i('hijra'));
  enclos('jumua', 0.026, (k) => k >= i('hijra'));
  { // le marché : deux rangées d'étals sous auvents de toile
    const xz = site('souq');
    if (xz) {
      for (let k = 0; k < 16; k++) {
        const x = xz[0] + (k % 8 - 3.5) * 0.012, z = xz[1] + (k < 8 ? -0.009 : 0.009), y = R.y(x, z);
        ajoute(new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.004, 0.006), M(0xC9A27A)), x, y + 0.002, z);
        const a = ajoute(new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.008), toile[k % toile.length]), x, y + 0.0065, z + (k < 8 ? 0.004 : -0.004));
        a.rotation.x = -Math.PI / 2 + (k < 8 ? 0.35 : -0.35);
      }
      reserver(xz[0], xz[1], 0.06);
    }
  }
  { // la Saqîfa : préau sur poteaux, toit de palmes
    const xz = site('saqifa');
    if (xz) {
      const g = pose(xz[0], xz[1], 0.006), bois = M(0x7F6143);
      [[-1.5, -1], [0, -1], [1.5, -1], [-1.5, 1], [0, 1], [1.5, 1]].forEach(([a, b]) => ajoute(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 5), bois), a, 0.6, b, g));
      ajoute(new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.15, 2.6), M(0x8E7650)), 0, 1.25, 0, g);
      reserver(xz[0], xz[1], 0.02);
    }
  }
  // La Mecque
  for (const id of ['safa', 'marwa']) { // collines rocheuses, plus marquées que ne le montre le relief à 100 m
    const xz = site(id); if (!xz) continue;
    const roc = new THREE.Mesh(new THREE.IcosahedronGeometry(0.014, 1), M(0x9C8468, { flatShading: true }));
    roc.scale.set(1, 0.55, 0.8); ajoute(roc, xz[0], R.y(...xz) + 0.002, xz[1]);
    reserver(xz[0], xz[1], 0.016);
  }
  { // le parcours entre as-Safâ et al-Marwa
    const a = site('safa'), c = site('marwa');
    if (a && c) {
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]), n = 12;
      for (let k = 0; k <= n; k++) {
        const x = a[0] + (c[0] - a[0]) * k / n, z = a[1] + (c[1] - a[1]) * k / n;
        const t = ajoute(new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.0008, L / n + 0.002), M(0xE6D8B8)), x, R.y(x, z) + 0.0005, z);
        t.rotation.y = Math.atan2(c[0] - a[0], c[1] - a[1]); t.castShadow = false;
        reserver(x, z, 0.008);
      }
    }
  }
  batisse('arqam', 'cour', 0.03, 0xE0CFAF, 0.2);
  batisse('mawlid', 'basse', 0.03, 0xE8DCC4, 0.5);
  batisse('khadija', 'cour', 0.034, 0xDCC8A4, -0.3);
  batisse('nadwa', 'cour', 0.046, 0xD6C09A, 0.1);
  cimetiere('hajun', 0.09, 0.07, 90, false);

  // ---------- Villes ----------
  const m = D.LIEUX.makkah;
  ville(m.lat, m.lon, 1.5, 850, { teintes: TEINTES_MECQUE, melange: [0.5, 0.3], denivele: 50, pente: 320 });
  for (const [la, lo, r, n, t] of HAMEAUX) ville(la, lo, r, n, { teintes: TEINTES_MEDINE, melange: [0.5, 0.15], tours: t, denivele: 25 });
  const kh = D.LIEUX.khaybar;
  ville(kh.lat + 0.006, kh.lon, 1.6, 150, { teintes: TEINTES_MEDINE, melange: [0.55, 0.2], tours: 6, denivele: 40 });
  const ta = D.LIEUX.taif;
  ville(ta.lat, ta.lon, 0.65, 260, { teintes: TEINTES_MECQUE, melange: [0.45, 0.35], denivele: 40 });

  // ---------- Palmeraies ----------
  const [mx, mz] = ici('madinah'), ligneFosse = P(...FOSSE[2])[1];
  const VERTS = ['#FFFFFF', '#E8F0DC', '#D6E6C4', '#F2F0D8'].map((c) => new THREE.Color(c));
  for (const o of OASIS) {
    const [cx, cz] = P(o.lat, o.lon), n = Math.round(Math.PI * o.rayon * o.rayon * o.densite);
    const h0 = R.metres(cx, cz);
    for (const [x, z] of semer(cx, cz, o.rayon, n, (x, z) =>
      R.pente(x, z) < 160 && R.metres(x, z) < h0 + 60 && libre(x, z, 0.008) && !(o.nom === 'Médine' && z < ligneFosse) && Math.hypot(x - mx, z - mz) > 0.12)) {
      const s = 0.02 + alea() * 0.01;
      placer('palmier', x, z, s, alea() * 6.28, VERTS[Math.floor(alea() * VERTS.length)]);
    }
  }

  // ---------- Acacias des oueds, autour des lieux de la Sîra ----------
  for (const id of ['makkah', 'madinah', 'badr', 'hudaybiya', 'hunayn', 'taif', 'khaybar', 'uhud']) {
    const [cx, cz] = ici(id);
    semer(cx, cz, 12, 350, (x, z) => R.metres(x, z) > 2 && R.pente(x, z) < 120 && libre(x, z, 0.01)).forEach(([x, z]) => {
      placer('acacia', x, z, 0.012 + alea() * 0.012, alea() * 6, VERTS[0]);
    });
  }
  { const [x, z] = ici('hudaybiya'); placer('acacia', x + 0.08, z, 0.05, 0, VERTS[0]); } // l'arbre du serment

  // ---------- Flèches vers les lieux hors carte ----------
  const forme = new THREE.Shape();
  [[0, -3], [2.4, 0], [0.9, 0], [0.9, 3], [-0.9, 3], [-0.9, 0], [-2.4, 0], [0, -3]].forEach(([a, b], k) => (k ? forme.lineTo(a, b) : forme.moveTo(a, b)));
  const fleche = new THREE.ExtrudeGeometry(forme, { depth: 0.4, bevelEnabled: false }); fleche.rotateX(Math.PI / 2);
  const orFl = M(0xD4A243, { metalness: 0.3, roughness: 0.5 });
  for (const l of Object.values(D.LIEUX).filter((l) => l.hors_carte)) {
    const [x, z] = P(...l.hors_carte.ancre), [tx, tz] = P(l.lat, l.lon);
    const f = ajoute(new THREE.Mesh(fleche, orFl), x, R.sol(x, z) + 1.2, z);
    f.scale.setScalar(1.6);
    f.rotation.y = Math.atan2(tx - x, tz - z) + Math.PI; // pointe vers le lieu réel
  }

  // ---------- construction des blocs ----------
  const o3 = new THREE.Object3D();
  for (const b of blocs.values()) {
    for (const [modele, liste] of Object.entries(b.lots)) {
      geos[modele] ||= MODELES[modele]();
      const arbre = modele === 'palmier' || modele === 'acacia';
      const im = new THREE.InstancedMesh(geos[modele], arbre ? mats.arbre : mats.maison, liste.length);
      im.castShadow = im.receiveShadow = true;
      liste.forEach((p, k) => {
        o3.position.set(p.x, p.y, p.z); o3.rotation.set(0, p.ry, 0); o3.scale.set(p.s, p.h, p.s);
        if (arbre) o3.rotation.set((alea() - 0.5) * 0.12, p.ry, (alea() - 0.5) * 0.12);
        o3.updateMatrix(); im.setMatrixAt(k, o3.matrix); im.setColorAt(k, p.couleur);
      });
      im.computeBoundingSphere();
      im.userData.portee = arbre ? PORTEE_ARBRES : PORTEE_MAISONS;
      groupe.add(im); b.meshes.push(im);
      // lanternes, la nuit, sur une maison sur quatre
      if (!arbre) {
        const l = liste.filter((_, k) => k % 4 === 0);
        if (l.length) {
          geos.lanterne ||= MODELES.lanterne();
          const lm = new THREE.InstancedMesh(geos.lanterne, mats.lanterne, l.length);
          l.forEach((p, k) => { o3.position.set(p.x + p.s * 0.3, p.y + p.s * 0.62, p.z + p.s * 0.3); o3.rotation.set(0, 0, 0); o3.scale.setScalar(p.s * 1.6); o3.updateMatrix(); lm.setMatrixAt(k, o3.matrix); });
          lm.computeBoundingSphere(); lm.userData.portee = PORTEE_MAISONS; lm.userData.nuit = true; lm.visible = false;
          groupe.add(lm); b.meshes.push(lm);
        }
      }
    }
  }

  let nuit = false;
  return {
    groupe, ere,
    nuit(on) { nuit = on; },
    // Masque les blocs lointains (appelé à chaque image avec la position de la caméra).
    majBlocs(cam) {
      for (const b of blocs.values()) {
        const d = Math.hypot(cam.x - b.x, cam.z - b.z, cam.y - b.y);
        for (const im of b.meshes) im.visible = d < im.userData.portee && (!im.userData.nuit || nuit);
      }
    },
  };
}
