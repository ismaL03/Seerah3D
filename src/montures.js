// Montures et embarcations, sans cavalier ni personnage (règle du projet).
// Unité : environ un mètre ; la mise à l'échelle se fait à l'usage.
import * as THREE from 'three';

const mat = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.85 }, o || {}));
const POIL = mat(0xB98D57), PATTES = mat(0x8C6640), TAPIS = mat(0x2E6C8F), BALLOT = mat(0xD9C7A2);
const ROBE = [mat(0x6B4428), mat(0x3B2A20), mat(0xC9B79C)], SELLE = mat(0x7A2E22), BOIS = mat(0x8B5E3C), TOILE = mat(0xF4EEE2, { side: THREE.DoubleSide });

function piece(g, geo, m, x, y, z, rx = 0, rz = 0) {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); o.castShadow = true; g.add(o); return o;
}

// Formes arrondies (ellipsoïdes, membres effilés) : des bêtes lisibles de loin, sans arêtes vives.
const boule = (rx, ry, rz) => { const g = new THREE.SphereGeometry(1, 14, 10); g.scale(rx, ry, rz); return g; };
function membre(g, m, x0, y0, z0, x1, y1, z1, r0, r1) {
  const L = Math.hypot(x1 - x0, y1 - y0, z1 - z0), geo = new THREE.CylinderGeometry(r1, r0, L, 8);
  geo.translate(0, L / 2, 0);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize()));
  return piece(g, geo, m, x0, y0, z0);
}
// Cou ou trompe : tube qui suit une courbe.
function tube(g, m, pts, r0, r1) {
  const c = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const geo = new THREE.TubeGeometry(c, 10, 1, 8, false), p = geo.attributes.position, n = geo.parameters.tubularSegments;
  // rayon décroissant le long du tube
  for (let k = 0; k < p.count; k++) {
    const i = Math.floor(k / 9), t = Math.min(1, i / n), q = c.getPointAt(t), r = r0 + (r1 - r0) * t;
    p.setXYZ(k, q.x + (p.getX(k) - q.x) * r, q.y + (p.getY(k) - q.y) * r, q.z + (p.getZ(k) - q.z) * r);
  }
  geo.computeVertexNormals();
  return piece(g, geo, m, 0, 0, 0);
}

export function chameau(charge = false) {
  const g = new THREE.Group();
  piece(g, boule(0.42, 0.42, 0.95), POIL, 0, 1.6, 0);
  piece(g, boule(0.34, 0.36, 0.42), POIL, 0, 2.0, -0.05);                       // bosse
  tube(g, POIL, [[0, 1.8, 0.8], [0, 1.62, 1.22], [0, 1.85, 1.55], [0, 2.15, 1.7]], 0.2, 0.12); // cou en col de cygne
  piece(g, boule(0.14, 0.14, 0.3), POIL, 0, 2.2, 1.88);                           // tête
  [[-0.24, -0.6], [0.24, -0.6], [-0.24, 0.62], [0.24, 0.62]].forEach(([x, z]) => membre(g, PATTES, x, 0, z, x, 1.45, z * 0.9, 0.07, 0.11));
  piece(g, boule(0.46, 0.08, 0.5), TAPIS, 0, 2.28, -0.05);                       // tapis de selle, sans cavalier
  if (charge) [-0.5, 0.5].forEach((x) => piece(g, boule(0.2, 0.3, 0.36), BALLOT, x, 1.85, -0.05));
  return g;
}

export function cheval(robe = 0) {
  const g = new THREE.Group(), m = ROBE[robe % ROBE.length];
  piece(g, boule(0.3, 0.33, 0.72), m, 0, 1.3, 0);
  tube(g, m, [[0, 1.45, 0.55], [0, 1.75, 0.8], [0, 2.0, 0.95]], 0.17, 0.12);   // encolure
  piece(g, boule(0.12, 0.13, 0.32), m, 0, 2.02, 1.12);                         // tête
  [[-0.16, -0.5], [0.16, -0.5], [-0.16, 0.5], [0.16, 0.5]].forEach(([x, z]) => membre(g, m, x, 0, z, x, 1.15, z * 0.95, 0.05, 0.08));
  membre(g, m, 0, 1.35, -0.7, 0, 0.75, -0.95, 0.07, 0.04);                     // queue
  piece(g, boule(0.32, 0.07, 0.3), SELLE, 0, 1.62, 0.05);                       // selle vide
  return g;
}

// Éléphant (l'armée d'Abraha) : corps massif, grandes oreilles, trompe recourbée, défenses.
const GRIS = mat(0x7D7A78), IVOIRE = mat(0xEFE6D2), HOUSSE = mat(0x7A2E22);
export function elephant() {
  const g = new THREE.Group();
  piece(g, boule(1.05, 1.1, 1.7), GRIS, 0, 2.55, 0);
  piece(g, boule(0.7, 0.75, 0.7), GRIS, 0, 3.05, 1.65);                       // tête
  [-1, 1].forEach((s) => { const o = piece(g, boule(0.08, 0.7, 0.55), GRIS, s * 0.72, 3.05, 1.45); o.rotation.y = s * 0.5; }); // oreilles
  tube(g, GRIS, [[0, 2.7, 2.15], [0, 2.1, 2.45], [0, 1.2, 2.5], [0, 0.6, 2.75]], 0.24, 0.1);  // trompe
  [-1, 1].forEach((s) => membre(g, IVOIRE, s * 0.3, 2.35, 2.05, s * 0.4, 2.0, 2.75, 0.07, 0.02)); // défenses
  [[-0.6, -1.0], [0.6, -1.0], [-0.6, 1.0], [0.6, 1.0]].forEach(([x, z]) => membre(g, GRIS, x, 0, z, x, 2.0, z * 0.9, 0.28, 0.32));
  membre(g, GRIS, 0, 2.6, -1.65, 0, 1.4, -1.9, 0.07, 0.04);                    // queue
  piece(g, boule(1.1, 0.12, 1.1), HOUSSE, 0, 3.55, -0.1);                        // housse d'apparat, sans cornac
  return g;
}

// Oiseau en vol (vue lointaine) : deux ailes qui battent ; userData.ailes pour l'animation.
const PLUME = mat(0x2E2A26, { side: THREE.DoubleSide });
export function oiseau() {
  const g = new THREE.Group();
  piece(g, boule(0.12, 0.1, 0.4), PLUME, 0, 0, 0);
  const ailes = [-1, 1].map((s) => {
    const forme = new THREE.Shape(); forme.moveTo(0, -0.15); forme.lineTo(s * 1.0, 0.1); forme.lineTo(s * 0.9, 0.3); forme.lineTo(0, 0.2);
    const a = new THREE.Mesh(new THREE.ShapeGeometry(forme), PLUME); a.rotation.x = -Math.PI / 2; g.add(a); return a;
  });
  g.userData.ailes = ailes;
  return g;
}

// Boutre de la mer Rouge : coque effilée, mât incliné, voile latine triangulaire.
export function bateau() {
  const g = new THREE.Group();
  const profil = new THREE.Shape();
  profil.moveTo(-2.4, 0.9); profil.quadraticCurveTo(-1.6, 0, 0, 0); profil.quadraticCurveTo(1.8, 0, 2.6, 1.1); profil.lineTo(-2.4, 0.9);
  const coque = new THREE.ExtrudeGeometry(profil, { depth: 1.1, bevelEnabled: false });
  coque.translate(0, 0, -0.55); coque.rotateY(-Math.PI / 2);
  piece(g, coque, BOIS, 0, -0.2, 0);
  piece(g, new THREE.CylinderGeometry(0.05, 0.06, 3.2, 6), BOIS, 0, 2.1, 0.3, 0.18); // mât
  const voile = new THREE.Shape(); voile.moveTo(0, 0); voile.lineTo(0, 3.2); voile.lineTo(2.4, 0.4); voile.lineTo(0, 0);
  const v = piece(g, new THREE.ShapeGeometry(voile), TOILE, 0, 0.9, -0.9);
  v.rotation.y = -Math.PI / 2;
  return g;
}

// Étendard : la toile est accrochée à la hampe (bord gauche en x = 0) pour pouvoir flotter.
export function etendard(couleur) {
  const g = new THREE.Group();
  piece(g, new THREE.CylinderGeometry(0.03, 0.03, 3, 5), BOIS, 0, 1.5, 0);
  const toile = new THREE.PlaneGeometry(1.1, 0.7, 8, 1); toile.translate(0.56, 0, 0);
  const f = piece(g, toile, mat(couleur, { side: THREE.DoubleSide }), 0, 2.6, 0);
  f.userData.repos = Float32Array.from(toile.attributes.position.array);
  g.userData.toile = f; g.userData.phase = Math.random() * 6;
  return g;
}

// Fait flotter un étendard : ondulation qui part de la hampe, plus ample vers le bout de la toile.
export function agiter(e, t, force = 1) {
  const f = e.userData.toile; if (!f) return;
  const pos = f.geometry.attributes.position, r = f.userData.repos, ph = e.userData.phase;
  for (let k = 0; k < pos.count; k++) {
    const x = r[k * 3];
    pos.array[k * 3 + 2] = Math.sin(x * 5 - t * 6 * force + ph) * 0.13 * x * force;
  }
  pos.needsUpdate = true;
  f.geometry.computeVertexNormals();
  f.rotation.y = Math.sin(t * 0.9 + ph) * 0.35;
}
