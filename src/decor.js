// Décor : bâtiments, camps, palmeraies, acacias… placés aux vraies coordonnées.
// Tailles « iconiques » (agrandies) pour rester lisibles ; aucune représentation humaine.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Oasis historiques : verdies sur la carte et plantées de palmiers. Positions approximatives.
export const OASIS = [
  { nom: 'Médine', lat: 24.452, lon: 39.612, rayon: 4.2 },
  { nom: "al-'Âliya", lat: 24.438, lon: 39.640, rayon: 2.6 },
  { nom: 'Khaybar', lat: 25.700, lon: 39.290, rayon: 4.0 },
  { nom: "Tâ'if", lat: 21.262, lon: 40.405, rayon: 3.0 },
  { nom: 'Badr', lat: 23.735, lon: 38.770, rayon: 1.0 },
  { nom: 'Marr az-Zahrân', lat: 21.620, lon: 39.690, rayon: 3.0 },
];

// Tracé approximatif du Fossé, au nord de Médine, entre les deux champs de lave.
const FOSSE = [[24.4745, 39.5850], [24.4810, 39.5965], [24.4865, 39.6090], [24.4850, 39.6240], [24.4790, 39.6370]];

let graine = 7;
const alea = () => { graine = (graine * 16807) % 2147483647; return (graine - 1) / 2147483646; };
const M = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.9, metalness: 0 }, o || {}));

export function creerDecor(R, D) {
  const groupe = new THREE.Group();
  const P = (lat, lon) => R.xz(lat, lon);
  const ici = (id) => P(D.LIEUX[id].lat, D.LIEUX[id].lon);
  const i = (id) => D.INDEX[id];
  const ere = [];          // objets dont la visibilité dépend de l'événement courant
  const nuit = [];         // objets visibles la nuit seulement
  const ajoute = (m, x, y, z, parent = groupe) => { m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };

  // Groupe posé au sol, construit dans une unité locale puis mis à l'échelle (km).
  function pose(x, z, echelle, parent = groupe) {
    const g = new THREE.Group(); g.position.set(x, R.y(x, z), z); g.scale.setScalar(echelle); parent.add(g); return g;
  }

  function semer(cx, cz, r0, r1, n, test) {
    const out = []; let essais = 0;
    while (out.length < n && essais < n * 40) {
      essais++;
      const a = alea() * Math.PI * 2, r = r0 + Math.sqrt(alea()) * (r1 - r0);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (test && !test(x, z)) continue;
      out.push([x, z]);
    }
    return out;
  }

  function instances(geo, mat, liste, couleur) {
    if (!liste.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, liste.length), o = new THREE.Object3D(), c = new THREE.Color();
    im.castShadow = im.receiveShadow = true;
    liste.forEach((p, k) => {
      o.position.set(p.x, p.y, p.z); o.rotation.set(p.rx || 0, p.ry || 0, p.rz || 0); o.scale.set(p.sx || 1, p.sy || 1, p.sz || 1);
      o.updateMatrix(); im.setMatrixAt(k, o.matrix);
      if (couleur) { couleur(c, k); im.setColorAt(k, c); }
    });
    groupe.add(im);
    return im;
  }

  // ---------- Ka'ba ----------
  {
    const [x, z] = ici('makkah'), g = pose(x, z, 0.1);
    const mataf = ajoute(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.12, 48), M(0xEFE8DA)), 0, 0.04, 0, g); mataf.castShadow = false;
    ajoute(new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.2, 0.9), M(0x1B1B1D, { roughness: 0.7 })), 0, 0.65, 0, g);
    ajoute(new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.12, 0.92), M(0xC9A043, { metalness: 0.5, roughness: 0.4 })), 0, 0.95, 0, g);
  }

  // ---------- Mosquée du Prophète ﷺ (briques crues, toiture de palmes) ----------
  {
    const [x, z] = ici('madinah'), g = pose(x, z, 0.06), boue = M(0xB98C5F), toit = M(0x7F6143);
    ajoute(new THREE.Mesh(new THREE.BoxGeometry(7, 0.1, 6.4), M(0xE2CDA6)), 0, 0.05, 0, g);
    [[0, -3.1, 7, 0.3], [0, 3.1, 7, 0.3]].forEach(([a, b, w, d]) => ajoute(new THREE.Mesh(new THREE.BoxGeometry(w, 1, d), boue), a, 0.5, b, g));
    ajoute(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1, 6.4), boue), -3.4, 0.5, 0, g);
    ajoute(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1, 2.4), boue), 3.4, 0.5, -2, g);
    ajoute(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1, 2.4), boue), 3.4, 0.5, 2, g);
    ajoute(new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.14, 1.9), toit), 0, 1.15, -2, g);
    ajoute(new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.14, 1.3), toit), 0, 1.15, 2.4, g);
    for (let k = 0; k < 5; k++) ajoute(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 5), toit), -2.6 + k * 1.3, 0.55, -1.3, g);
    for (let k = 0; k < 4; k++) ajoute(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 1.2), M(0xC9A27A)), 4.3, 0.45, -2.6 + k * 1.4, g);
    ere.push({ o: g, visible: (k) => k >= i('hijra') });
  }

  // ---------- Mosquée de Qubâ' ----------
  {
    const [x, z] = ici('quba'), g = pose(x, z, 0.06), boue = M(0xB98C5F);
    [[0, -1.4, 3, 0.25], [0, 1.4, 3, 0.25]].forEach(([a, b, w, d]) => ajoute(new THREE.Mesh(new THREE.BoxGeometry(w, 0.8, d), boue), a, 0.4, b, g));
    [-1.4, 1.4].forEach((a) => ajoute(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.8, 3), boue), a, 0.4, 0, g));
    ere.push({ o: g, visible: (k) => k >= i('hijra') });
  }

  // ---------- Le Fossé ----------
  {
    const g = new THREE.Group(); groupe.add(g);
    const sombre = M(0x4E3B2D), terre = M(0xC9A37A);
    for (let k = 0; k < FOSSE.length - 1; k++) {
      const [ax, az] = P(...FOSSE[k]), [bx, bz] = P(...FOSSE[k + 1]);
      const L = Math.hypot(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2, ang = Math.atan2(bz - az, bx - ax);
      const t = ajoute(new THREE.Mesh(new THREE.BoxGeometry(L + 0.03, 0.02, 0.06), sombre), mx, R.y(mx, mz) + 0.006, mz, g);
      t.rotation.y = -ang; t.castShadow = false;
      const nx = Math.sin(ang) * 0.07, nz = -Math.cos(ang) * 0.07; // remblai côté nord
      const m = ajoute(new THREE.Mesh(new THREE.BoxGeometry(L + 0.03, 0.03, 0.05), terre), mx + nx, R.y(mx + nx, mz + nz) + 0.01, mz + nz, g);
      m.rotation.y = -ang;
    }
    ere.push({ o: g, visible: (k) => k >= i('khandaq') });
  }

  // ---------- Camps (tentes, sans personnages) ----------
  const tente = new THREE.ConeGeometry(0.75, 0.9, 4); tente.rotateY(Math.PI / 4); tente.translate(0, 0.45, 0);
  function camp(lat, lon, rayon, n, couleur, quand) {
    const [cx, cz] = P(lat, lon), g = new THREE.Group(), mat = M(couleur);
    semer(cx, cz, 0.05, rayon, n, (x, z) => R.pente(x, z) < 120).forEach(([x, z]) => {
      const t = new THREE.Mesh(tente, mat); t.position.set(x, R.y(x, z) - 0.002, z); t.rotation.y = alea() * 6; t.scale.setScalar(0.06);
      t.castShadow = true; g.add(t);
    });
    groupe.add(g); ere.push({ o: g, visible: quand });
  }
  camp(23.743, 38.779, 0.45, 14, 0xF4EEE2, (k) => k === i('badr'));       // musulmans, côté proche (al-'Udwa ad-Dunyâ)
  camp(23.722, 38.756, 0.6, 26, 0x7C4B3C, (k) => k === i('badr'));        // Quraysh, côté éloigné (al-'Udwa al-Quswâ)
  camp(21.444, 39.620, 0.6, 26, 0xF4EEE2, (k) => k === i('hudaybiya'));
  camp(21.618, 39.695, 1.2, 60, 0xF4EEE2, (k) => k === i('fath'));        // Marr az-Zahrân
  camp(21.352, 39.975, 1.0, 50, 0xF4EEE2, (k) => k === i('hajj'));        // 'Arafa

  // ---------- Puits de Badr ----------
  {
    const [x0, z0] = ici('badr'), mat = M(0x9B8466, { side: THREE.DoubleSide });
    for (let k = 0; k < 3; k++) {
      const x = x0 + 0.12 * k - 0.1, z = z0 + 0.05 * k;
      ajoute(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.025, 12, 1, true), mat), x, R.y(x, z) + 0.01, z);
    }
  }

  // ---------- Fortins de Khaybar ----------
  {
    const pierre = M(0xA88B6A), base = D.LIEUX.khaybar;
    [[0.022, 0.012], [-0.016, 0.020], [0.030, -0.018], [-0.020, -0.026], [0.004, 0.034]].forEach(([dla, dlo]) => {
      const [x, z] = P(base.lat + dla, base.lon + dlo), g = pose(x, z, 0.08);
      ajoute(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 3, 10), pierre), 0, 1.4, 0, g);
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; ajoute(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), pierre), Math.cos(a) * 1.05, 3.05, Math.sin(a) * 1.05, g); }
      ajoute(new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 2.6), pierre), 1.4, 0.5, 0.6, g);
    });
  }

  // ---------- Rempart de Tâ'if ----------
  {
    const [cx, cz] = ici('taif'), pierre = M(0xB79C78), r = 0.9;
    for (let k = 0; k < 36; k++) {
      if (k === 8 || k === 26) continue; // portes
      const a = k / 36 * Math.PI * 2, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const s = ajoute(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.07, 0.04), pierre), x, R.y(x, z) + 0.03, z);
      s.rotation.y = -a + Math.PI / 2;
    }
    // vergers
    const buissons = [];
    semer(cx + 1.5, cz + 1.2, 0, 1.6, 140, (x, z) => R.pente(x, z) < 150).forEach(([x, z]) => buissons.push({ x, y: R.y(x, z) + 0.02, z, sx: 0.05, sy: 0.04, sz: 0.05 }));
    instances(new THREE.IcosahedronGeometry(1, 0), M(0x6E9A45, { flatShading: true }), buissons);
  }

  // ---------- Jabal ar-Rahma ('Arafa) ----------
  {
    const [x, z] = ici('arafat');
    ajoute(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.22, 8), M(0xF5F2EA)), x, R.y(x, z) + 0.11, z);
  }

  // ---------- Maisons ----------
  const maisons = [];
  function bourg(id, r0, r1, n, test, dlat = 0, dlon = 0) {
    const L = D.LIEUX[id], [cx, cz] = P(L.lat + dlat, L.lon + dlon), h0 = R.metres(cx, cz);
    semer(cx, cz, r0, r1, n, (x, z) => R.pente(x, z) < 90 && R.metres(x, z) < h0 + 60 && (!test || test(x, z))).forEach(([x, z]) => {
      const w = 0.05 + alea() * 0.05, d = 0.05 + alea() * 0.05, h = 0.03 + alea() * 0.04;
      maisons.push({ x, z, y: R.y(x, z) + h / 2 - 0.004, sx: w, sy: h, sz: d, ry: (alea() - 0.5) * 0.5 });
    });
  }
  const [mx, mz] = ici('madinah');
  bourg('makkah', 0.22, 1.7, 260);
  bourg('madinah', 0.3, 1.9, 190, (x, z) => Math.hypot(x - mx, z - mz) > 0.3);
  bourg('quba', 0.15, 0.6, 28);
  bourg('nadir', 0.05, 0.6, 26);
  bourg('khaybar', 0.4, 2.2, 60);
  bourg('taif', 0.05, 0.8, 90);
  const teintes = ['#F1E9DA', '#E7D7BC', '#D9C29C', '#CDAE85', '#EEE3CF'].map((c) => new THREE.Color(c));
  instances(new THREE.BoxGeometry(1, 1, 1), M(0xffffff), maisons, (c, k) => c.copy(teintes[k % teintes.length]));

  // Lanternes, la nuit, sur une maison sur cinq.
  {
    const lanternes = maisons.filter((_, k) => k % 5 === 0).map((m) => ({ x: m.x, y: m.y + m.sy / 2 + 0.008, z: m.z, sx: 0.012, sy: 0.012, sz: 0.012 }));
    const im = instances(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xFFC46B }), lanternes);
    if (im) { im.castShadow = false; nuit.push(im); }
  }

  // ---------- Palmiers ----------
  const tronc = new THREE.CylinderGeometry(0.1, 0.16, 2.6, 6); tronc.translate(0, 1.3, 0);
  const palmes = [];
  for (let k = 0; k < 7; k++) { const g = new THREE.BoxGeometry(0.34, 0.05, 1.7); g.translate(0, 0, 0.85); g.rotateX(0.5); g.rotateY(k * Math.PI * 2 / 7); g.translate(0, 2.6, 0); palmes.push(g); }
  const palmesGeo = mergeGeometries(palmes);
  const palmiers = [];
  const ligneFosse = P(...FOSSE[2])[1];
  for (const o of OASIS) {
    const [cx, cz] = P(o.lat, o.lon), n = Math.round(o.rayon * o.rayon * 55);
    semer(cx, cz, 0, o.rayon, n, (x, z) =>
      R.pente(x, z) < 70 && Math.hypot(x - mx, z - mz) > 0.7 && !(o.nom === 'Médine' && z < ligneFosse)
    ).forEach(([x, z]) => {
      const s = 0.03 + alea() * 0.015;
      palmiers.push({ x, z, y: R.y(x, z) - 0.002, ry: alea() * 6.28, rx: (alea() - 0.5) * 0.18, rz: (alea() - 0.5) * 0.18, sx: s, sy: s, sz: s });
    });
  }
  instances(tronc, M(0x8B6A45), palmiers);
  instances(palmesGeo, M(0x5F8F3C, { side: THREE.DoubleSide }), palmiers);

  // ---------- Acacias des oueds, autour des lieux de la Sîra ----------
  const acTronc = new THREE.CylinderGeometry(0.1, 0.14, 1.2, 5); acTronc.translate(0, 0.6, 0);
  const acCime = new THREE.IcosahedronGeometry(1, 0); acCime.scale(1.4, 0.42, 1.4); acCime.translate(0, 1.4, 0);
  const acacias = [];
  for (const id of ['makkah', 'madinah', 'badr', 'hudaybiya', 'hunayn', 'taif', 'khaybar']) {
    const [cx, cz] = ici(id);
    semer(cx, cz, 1.5, 22, 160, (x, z) => R.metres(x, z) > 2 && R.pente(x, z) < 60).forEach(([x, z]) => {
      const s = 0.035 + alea() * 0.035;
      acacias.push({ x, z, y: R.y(x, z) - 0.002, ry: alea() * 6, sx: s, sy: s, sz: s });
    });
  }
  { const [x, z] = ici('hudaybiya'); acacias.push({ x: x + 0.15, z, y: R.y(x + 0.15, z) - 0.002, ry: 0, sx: 0.12, sy: 0.12, sz: 0.12 }); } // l'arbre du serment
  instances(acTronc, M(0x7A5A3C), acacias);
  instances(acCime, M(0x748F48, { flatShading: true }), acacias);

  // ---------- Flèches vers les lieux hors carte ----------
  const forme = new THREE.Shape();
  [[0, -3], [2.4, 0], [0.9, 0], [0.9, 3], [-0.9, 3], [-0.9, 0], [-2.4, 0], [0, -3]].forEach(([a, b], k) => (k ? forme.lineTo(a, b) : forme.moveTo(a, b)));
  const fleche = new THREE.ExtrudeGeometry(forme, { depth: 0.4, bevelEnabled: false }); fleche.rotateX(Math.PI / 2);
  const or = M(0xD4A243, { metalness: 0.3, roughness: 0.5 });
  for (const l of Object.values(D.LIEUX).filter((l) => l.hors_carte)) {
    const [x, z] = P(...l.hors_carte.ancre), [tx, tz] = P(l.lat, l.lon);
    const m = ajoute(new THREE.Mesh(fleche, or), x, R.sol(x, z) + 1.2, z);
    m.scale.setScalar(1.6);
    m.rotation.y = Math.atan2(tx - x, tz - z) + Math.PI; // pointe vers le lieu réel
  }

  return { groupe, ere, nuit };
}
