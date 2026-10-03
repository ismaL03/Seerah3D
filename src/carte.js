// Scène 3D : lumière, caméra, épingles, étiquettes, trajets animés.
import * as THREE from 'three';
import { creerTerrain } from './terrain.js';
import { creerDecor, OASIS } from './decor.js';
import { pointsTrajet, positionLieu } from './donnees.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const R_MIN = 2.5, R_MAX = 1400;
// Distance de caméra au-delà de laquelle un lieu de niveau 2 ou 3 est masqué.
const PORTEE = { 1: Infinity, 2: 320, 3: 90 };

export async function creerCarte({ canvas, etiquettes, R, D, mobile, reduit, surLieu, surInteraction, zoneLibre }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 5000);
  scene.fog = new THREE.Fog(0xE6ECEA, 1000, 4000);

  const hemi = new THREE.HemisphereLight(0xF3F6F8, 0xD8C29B, 2.4);
  const soleil = new THREE.DirectionalLight(0xFFF2DC, 3);
  soleil.castShadow = true;
  soleil.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  const amb = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(hemi, soleil, soleil.target, amb);
  const DIR_SOLEIL = new THREE.Vector3(0.45, 0.78, 0.3).normalize();

  const terrain = await creerTerrain(R, { renderer, pas: mobile ? 2 : 1, oasis: OASIS });
  scene.add(terrain.groupe);
  const decor = creerDecor(R, D);
  scene.add(decor.groupe);

  // ---------- épingles ----------
  const geoTete = new THREE.SphereGeometry(1.15, 24, 16), geoPointe = new THREE.ConeGeometry(0.78, 1.9, 24);
  geoPointe.rotateX(Math.PI); geoPointe.translate(0, -1.25, 0);
  const geoDisque = new THREE.CircleGeometry(0.48, 24);
  const M = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.1 });
  const matPin = M(0x0E6B53), matPinOn = M(0xC9962F), matPinBord = M(0xD4A243);
  const matDisque = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const PINS = {}, cliquables = [];
  for (const l of Object.values(D.LIEUX)) {
    const [x, z] = R.xz(...positionLieu(l)), g = new THREE.Group();
    const tete = new THREE.Mesh(geoTete, l.hors_carte ? matPinBord : matPin), pointe = new THREE.Mesh(geoPointe, tete.material), disque = new THREE.Mesh(geoDisque, matDisque);
    tete.castShadow = pointe.castShadow = true;
    tete.userData.id = pointe.userData.id = l.id;
    g.add(tete, pointe, disque);
    const base = R.sol(x, z);
    g.position.set(x, base, z);
    scene.add(g);
    cliquables.push(tete, pointe);
    PINS[l.id] = { g, tete, pointe, disque, base, x, z, l };
  }
  const onde = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.6, 48), new THREE.MeshBasicMaterial({ color: 0xC9962F, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  onde.rotation.x = -Math.PI / 2;
  scene.add(onde);

  // ---------- étiquettes ----------
  const LBL = {};
  for (const l of Object.values(D.LIEUX)) {
    const d = document.createElement('div');
    d.className = 'lbl' + (l.niveau === 1 ? '' : ' minor') + (l.hors_carte ? ' edge' : '');
    d.innerHTML = `<span class="nm"></span><span class="ar" lang="ar"></span>${l.hors_carte ? '<span class="ev ind"></span>' : ''}<span class="ev cur" hidden></span>`;
    d.querySelector('.nm').textContent = l.nom;
    d.querySelector('.ar').textContent = l.nom_ar;
    if (l.hors_carte) d.querySelector('.ind').textContent = l.hors_carte.indication;
    d.addEventListener('click', () => surLieu(l.id));
    etiquettes.appendChild(d);
    LBL[l.id] = d;
  }

  document.fonts && document.fonts.ready.then(() => Object.values(LBL).forEach((el) => (el._w = 0)));

  // ---------- trajets ----------
  // Lignes d'épaisseur constante à l'écran, quel que soit le zoom ; tirets animés.
  const matTrajet = new LineMaterial({ color: 0xC9962F, linewidth: 5, dashed: true, dashSize: 1, gapSize: 0.6 });
  const matHalo = new LineMaterial({ color: 0xC9962F, linewidth: 14, transparent: true, opacity: 0.25, depthWrite: false });
  let trajet = null; // { groupe, courbe, longueur, type }

  function chameau() {
    const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0xB98D57, roughness: 0.9 }), f = new THREE.MeshStandardMaterial({ color: 0x8C6640, roughness: 0.9 });
    const p = (geo, mat, x, y, z, rx) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); if (rx) o.rotation.x = rx; o.castShadow = true; g.add(o); };
    p(new THREE.BoxGeometry(0.8, 0.85, 1.9), m, 0, 1.55, 0); p(new THREE.BoxGeometry(0.7, 0.55, 0.8), m, 0, 2.15, -0.05);
    p(new THREE.BoxGeometry(0.32, 1.1, 0.32), m, 0, 2.05, 1.05, 0.55); p(new THREE.BoxGeometry(0.34, 0.32, 0.7), m, 0, 2.55, 1.5);
    [[-0.27, -0.7], [0.27, -0.7], [-0.27, 0.7], [0.27, 0.7]].forEach(([x, z]) => p(new THREE.BoxGeometry(0.2, 1.2, 0.2), f, x, 0.6, z));
    p(new THREE.BoxGeometry(0.86, 0.12, 1.0), new THREE.MeshStandardMaterial({ color: 0x2E6C8F }), 0, 1.98, -0.05); // tapis de selle, sans cavalier
    return g;
  }
  function bateau() {
    const g = new THREE.Group(), bois = new THREE.MeshStandardMaterial({ color: 0x8B5E3C, roughness: 0.8 });
    const coque = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.35, 2.6, 8, 1, false, 0, Math.PI), bois);
    coque.rotation.set(Math.PI / 2, 0, Math.PI); coque.position.y = 0.55; coque.scale.set(1, 1, 0.8);
    const mat = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), bois); mat.position.y = 1.7;
    const voile = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.7), new THREE.MeshStandardMaterial({ color: 0xF4EEE2, side: THREE.DoubleSide }));
    voile.position.set(0, 1.9, 0.05); voile.rotation.y = Math.PI / 2;
    [coque, mat, voile].forEach((o) => { o.castShadow = true; g.add(o); });
    return g;
  }
  const caravane = [0, 1, 2].map(() => {
    const c = chameau(), b = bateau(); c.visible = b.visible = false; scene.add(c, b); return { c, b };
  });
  const orbe = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 16), new THREE.MeshBasicMaterial({ color: 0xFFE3A0 }));
  orbe.add(new THREE.Mesh(new THREE.SphereGeometry(2.6, 24, 16), new THREE.MeshBasicMaterial({ color: 0xFFD27A, transparent: true, opacity: 0.25, depthWrite: false })));
  orbe.visible = false; scene.add(orbe);

  function construireTrajet(ev) {
    if (trajet) { scene.remove(trajet.groupe); trajet.groupe.traverse((o) => o.geometry && o.geometry.dispose()); trajet = null; }
    caravane.forEach(({ c, b }) => (c.visible = b.visible = false));
    orbe.visible = false;
    if (!ev.trajet) return;
    const pts = pointsTrajet(D, ev.trajet).map(([la, lo]) => { const [x, z] = R.xz(la, lo); return new THREE.Vector3(x, 0, z); });
    const plan = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.3);
    const longueur = plan.getLength(), nuit = ev.trajet.type === 'nuit';
    const N = Math.min(1500, Math.max(80, Math.round(longueur * 2.5)));
    const suivi = [];
    for (let k = 0; k <= N; k++) {
      const v = plan.getPointAt(k / N);
      const sol = R.sol(v.x, v.z);
      v.y = nuit ? sol + 1 + Math.sin(Math.PI * k / N) * longueur * 0.22 : sol + 0.12;
      suivi.push(v);
    }
    // évite que la ligne passe sous le relief entre deux échantillons
    if (!nuit) for (let k = 1; k < N; k++) suivi[k].y = Math.max(suivi[k].y, (suivi[k - 1].y + suivi[k + 1].y) / 2);
    const courbe = new THREE.CatmullRomCurve3(suivi);
    const geo = new LineGeometry(); geo.setPositions(suivi.flatMap((v) => [v.x, v.y, v.z]));
    const ligne = new Line2(geo, matTrajet); ligne.computeLineDistances();
    // halo sur un tracé allégé : des segments plus courts qu'un pixel se superposeraient et l'opacité saturerait
    const pas = Math.max(1, Math.ceil(N / 120)), allege = suivi.filter((_, k) => k % pas === 0 || k === N);
    const geoHalo = new LineGeometry(); geoHalo.setPositions(allege.flatMap((v) => [v.x, v.y, v.z]));
    const halo = new Line2(geoHalo, matHalo);
    ligne.renderOrder = 3; halo.renderOrder = 2;
    const groupe = new THREE.Group(); groupe.add(halo, ligne);
    scene.add(groupe);
    trajet = { groupe, courbe, longueur, type: ev.trajet.type };
    if (nuit) orbe.visible = true;
  }

  // ---------- caméra ----------
  const cam = { cible: new THREE.Vector3(0, 0, 0), r: 1000, theta: -0.25, phi: 0.8 };
  let vol = null, FIT = 1;
  const b = R.bornes;
  function appliquerCamera() {
    const sp = Math.sin(cam.phi);
    camera.position.set(cam.cible.x + cam.r * sp * Math.sin(cam.theta), cam.cible.y + cam.r * Math.cos(cam.phi), cam.cible.z + cam.r * sp * Math.cos(cam.theta));
    camera.lookAt(cam.cible);
    const near = Math.max(0.01, cam.r * 0.004), far = cam.r * 6 + 800;
    if (Math.abs(camera.near - near) > near * 0.05 || Math.abs(camera.far - far) > far * 0.05) {
      camera.near = near; camera.far = far; camera.updateProjectionMatrix();
    }
  }
  function volVers(cible, r, theta, phi, duree) {
    let dt = (theta ?? cam.theta) - cam.theta; dt = Math.atan2(Math.sin(dt), Math.cos(dt));
    vol = { t0: performance.now(), duree: reduit ? 0 : (duree ?? 1600), a: { c: cam.cible.clone(), r: cam.r, th: cam.theta, ph: cam.phi }, b: { c: cible.clone(), r, th: cam.theta + dt, ph: phi ?? cam.phi } };
  }
  const pos = (id) => { const p = PINS[id]; return new THREE.Vector3(p.x, p.base, p.z); };
  // Distance de caméra pour que tous les points tiennent dans la zone libre (projection réelle).
  const vp = new THREE.Vector3();
  function distancePour(cible, theta, phi, points, r0, marge = 0.86) {
    const w = canvas.clientWidth, h = canvas.clientHeight, zl = zoneLibre(w, h);
    const cx = (zl.l + zl.r) / w - 1, cy = 1 - (zl.t + zl.b) / h, hx = (zl.r - zl.l) / w, hy = (zl.b - zl.t) / h;
    const avant = { c: cam.cible.clone(), r: cam.r, th: cam.theta, ph: cam.phi };
    let r = r0;
    for (let k = 0; k < 6; k++) {
      cam.cible.copy(cible); cam.r = r; cam.theta = theta; cam.phi = phi;
      appliquerCamera(); camera.updateMatrixWorld();
      let s = 0;
      for (const p of points) {
        vp.copy(p).project(camera);
        s = Math.max(s, vp.z > 1 ? 4 : Math.max(Math.abs(vp.x - cx) / hx, Math.abs(vp.y - cy) / hy));
      }
      r = Math.min(R_MAX, Math.max(R_MIN, r * Math.max(0.5, Math.min(2, s / marge))));
    }
    cam.cible.copy(avant.c); cam.r = avant.r; cam.theta = avant.th; cam.phi = avant.ph; appliquerCamera();
    return r;
  }
  function cadrerPoints(points, theta, phi, rMin, duree) {
    const bb = new THREE.Box3().setFromPoints(points), c = bb.getCenter(new THREE.Vector3());
    c.y = R.sol(c.x, c.z);
    const r0 = Math.max(rMin, bb.getSize(new THREE.Vector3()).length() * 1.2);
    volVers(c, Math.max(rMin, distancePour(c, theta, phi, points, r0)), theta, phi, duree);
  }
  const pointsSol = (ev) => pointsTrajet(D, ev.trajet).map(([la, lo]) => { const [x, z] = R.xz(la, lo); return new THREE.Vector3(x, R.sol(x, z), z); });
  function cadrer(ev, duree) {
    majVue();
    const L = D.LIEUX[ev.lieu];
    if (ev.trajet) {
      // le tracé complet, échantillonné, plus de la hauteur pour l'arc d'al-Isrâ'
      const plan = new THREE.CatmullRomCurve3(pointsSol(ev), false, 'catmullrom', 0.3), pts = plan.getSpacedPoints(40);
      if (ev.trajet.type === 'nuit') pts.forEach((p, k) => (p.y += Math.sin(Math.PI * k / 40) * plan.getLength() * 0.22));
      cadrerPoints(pts, -0.3, plan.getLength() > 40 ? 0.78 : 0.95, 12, duree);
    } else {
      volVers(pos(L.id), ({ 1: 22, 2: 26, 3: 14 }[L.niveau] || 20) * Math.sqrt(FIT), -0.45, 0.95, duree);
    }
  }
  function accueil() {
    majVue();
    const pts = [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]].map(([x, z]) => new THREE.Vector3(x, 0, z));
    cadrerPoints(pts, -0.5, 0.78, 100);
  }
  function vueLieu(id) { majVue(); volVers(pos(id), (D.LIEUX[id].niveau === 1 ? 30 : 16) * Math.sqrt(FIT), -0.45, 0.9); }

  // ---------- commandes ----------
  const pointeurs = new Map(); let appui = null, pince = 0;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    appui = { x: e.clientX, y: e.clientY, t: performance.now(), b: e.button, shift: e.shiftKey };
    vol = null; surInteraction(); canvas.classList.add('drag');
    if (pointeurs.size === 2) { const [p, q] = [...pointeurs.values()]; pince = Math.hypot(p.x - q.x, p.y - q.y); }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointeurs.has(e.pointerId)) { canvas.classList.toggle('hover', !!viser(e)); return; }
    const p = pointeurs.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pointeurs.size === 2) {
      const [a, c] = [...pointeurs.values()], d = Math.hypot(a.x - c.x, a.y - c.y);
      if (pince) cam.r = Math.min(R_MAX, Math.max(R_MIN, cam.r * pince / d));
      pince = d; return;
    }
    if (appui && (appui.b === 2 || appui.shift)) {
      const k = cam.r * 0.0016, ct = Math.cos(cam.theta), st = Math.sin(cam.theta);
      cam.cible.x = Math.max(b.x0, Math.min(b.x1, cam.cible.x + (-dx * ct - dy * st) * k));
      cam.cible.z = Math.max(b.z0, Math.min(b.z1, cam.cible.z + (dx * st - dy * ct) * k));
      cam.cible.y = R.sol(cam.cible.x, cam.cible.z);
    } else {
      cam.theta -= dx * 0.005;
      cam.phi = Math.max(0.25, Math.min(1.3, cam.phi - dy * 0.004));
    }
  });
  function fin(e) {
    pointeurs.delete(e.pointerId);
    if (pointeurs.size < 2) pince = 0;
    canvas.classList.remove('drag');
    if (appui && pointeurs.size === 0) {
      const bouge = Math.hypot(e.clientX - appui.x, e.clientY - appui.y);
      if (bouge < 6 && performance.now() - appui.t < 500) { const id = viser(e); if (id) surLieu(id); }
      appui = null;
    }
  }
  canvas.addEventListener('pointerup', fin);
  canvas.addEventListener('pointercancel', fin);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault(); vol = null;
    cam.r = Math.min(R_MAX, Math.max(R_MIN, cam.r * (1 + Math.sign(e.deltaY) * Math.min(0.25, Math.abs(e.deltaY) * 0.0012))));
  }, { passive: false });
  const rayon = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function viser(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    rayon.setFromCamera(ndc, camera);
    const h = rayon.intersectObjects(cliquables.filter((o) => o.parent.visible), false)[0];
    return h && h.object.userData.id;
  }

  // ---------- thème ----------
  const JOUR = { ciel: 0xE6ECEA, hs: 0xF3F6F8, hg: 0xD8C29B, hi: 2.4, sol: 0xFFF2DC, si: 3.0, amb: 0.35, ter: 0xffffff, paroi: 0xB79770, eau: 0x4FAFC6 };
  const NUIT = { ciel: 0x0C1524, hs: 0x6478A8, hg: 0x2A2A34, hi: 1.9, sol: 0xB4C6FF, si: 1.5, amb: 0.25, ter: 0xAEB6D0, paroi: 0x4A4552, eau: 0x1E4E69 };
  let sombre = false;
  function theme(estSombre, couleurCategorie) {
    sombre = estSombre;
    const S = sombre ? NUIT : JOUR;
    scene.background = new THREE.Color(S.ciel); scene.fog.color.setHex(S.ciel);
    hemi.color.setHex(S.hs); hemi.groundColor.setHex(S.hg); hemi.intensity = S.hi;
    soleil.color.setHex(S.sol); soleil.intensity = S.si; amb.intensity = S.amb;
    terrain.materiaux.forEach((m) => m.color.setHex(S.ter)); terrain.matParoi.color.setHex(S.paroi); terrain.matEau.color.setHex(S.eau);
    decor.nuit.forEach((o) => (o.visible = sombre));
    if (couleurCategorie) colorerTrajet(couleurCategorie);
  }
  function colorerTrajet(couleur) { const c = new THREE.Color(couleur); matTrajet.color.copy(c); matHalo.color.copy(c); }

  // ---------- sélection ----------
  let courant = null, lieuxTrajet = [];
  function selectionner(ev, index, couleur) {
    courant = ev;
    decor.ere.forEach((e) => (e.o.visible = e.visible(index)));
    construireTrajet(ev);
    colorerTrajet(couleur);
    lieuxTrajet = ev.trajet ? ev.trajet.etapes.filter((x) => typeof x === 'string' && D.LIEUX[x]) : [];
    for (const id in PINS) {
      const p = PINS[id];
      p.tete.material = p.pointe.material = id === ev.lieu ? matPinOn : (p.l.hors_carte ? matPinBord : matPin);
    }
    for (const id in LBL) {
      const on = id === ev.lieu, el = LBL[id], cur = el.querySelector('.ev.cur');
      el.classList.toggle('on', on); cur.hidden = !on; if (on) cur.textContent = ev.titre;
      el._w = 0; // à remesurer
    }
    const p = PINS[ev.lieu];
    onde.position.set(p.x, p.base + 0.02, p.z);
  }

  // ---------- centre optique : la vue vise le milieu de la zone laissée libre par les panneaux ----------
  let cleVue = '';
  function majVue() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const z = zoneLibre(w, h), cle = [w, h, z.l, z.r, z.t, z.b].join();
    if (cle === cleVue) return;
    cleVue = cle;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.setViewOffset(w, h, w / 2 - (z.l + z.r) / 2, h / 2 - (z.t + z.b) / 2, w, h);
    matTrajet.resolution.set(w, h); matHalo.resolution.set(w, h);
    camera.updateProjectionMatrix();
    FIT = Math.min(2.2, Math.max(1, Math.max(w / (z.r - z.l), h / (z.b - z.t)) * 0.92));
  }

  function ordreEtiquettes() {
    const rang = (id) => (courant && courant.lieu === id ? 0 : PINS[id].l.niveau === 1 ? 1 : lieuxTrajet.includes(id) ? 2 : 2 + PINS[id].l.niveau);
    return Object.keys(LBL).sort((a, c) => rang(a) - rang(c));
  }

  // ---------- boucle ----------
  const lisse = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const v3 = new THREE.Vector3(), avant = new THREE.Vector3();
  let dernier = performance.now(), u = 0;
  function boucle(now) {
    const dt = Math.min(0.05, Math.max(0, (now - dernier) / 1000)); dernier = now;
    if (vol) {
      const t = vol.duree ? Math.min(1, (now - vol.t0) / vol.duree) : 1, k = lisse(t), a = vol.a, c = vol.b;
      cam.cible.lerpVectors(a.c, c.c, k);
      // trajectoire en « saut » : on prend de la hauteur entre deux lieux éloignés
      const saut = Math.min(600, a.c.distanceTo(c.c) * 0.35) * Math.sin(Math.PI * k);
      cam.r = a.r + (c.r - a.r) * k + saut;
      cam.theta = a.th + (c.th - a.th) * k; cam.phi = a.ph + (c.ph - a.ph) * k;
      if (t >= 1) vol = null;
    }
    majVue();
    appliquerCamera();
    // facettes « maquette » vues de loin, relief lissé de près (grille de 600 m)
    const facettes = cam.r > 110;
    for (const m of terrain.materiaux) if (m.flatShading !== facettes) { m.flatShading = facettes; m.needsUpdate = true; }
    // soleil et ombres centrés sur la vue
    const D_SOL = cam.r * 1.5 + 60;
    soleil.position.copy(cam.cible).addScaledVector(DIR_SOLEIL, D_SOL);
    soleil.target.position.copy(cam.cible); soleil.target.updateMatrixWorld();
    const s = Math.min(800, Math.max(2, cam.r * 0.75)), sc = soleil.shadow.camera;
    if (Math.abs(sc.right - s) > s * 0.03) {
      sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s; sc.near = 0.1; sc.far = D_SOL + cam.r * 2 + 50;
      sc.updateProjectionMatrix(); soleil.shadow.normalBias = s * 0.0015;
    }
    scene.fog.near = cam.r * 1.4; scene.fog.far = cam.r * 5;
    // épingles
    const ps = cam.r / 140;
    for (const id in PINS) {
      const p = PINS[id], sel = courant && courant.lieu === id, visible = sel || lieuxTrajet.includes(id) || cam.r < PORTEE[p.l.niveau];
      p.g.visible = visible;
      if (!visible) continue;
      const sz = ps * (sel ? 1.35 : 1);
      p.g.scale.setScalar(sz);
      p.g.position.y = p.base + 3.2 * sz + (reduit ? 0 : Math.sin(now / 600 + p.x) * 0.3 * sz);
      p.disque.quaternion.copy(camera.quaternion);
      p.disque.position.copy(avant.set(0, 0, 1).applyQuaternion(camera.quaternion).multiplyScalar(1.16));
    }
    const pt = reduit ? 0.5 : (now % 1800) / 1800;
    onde.scale.setScalar((1 + pt * 3.5) * ps); onde.material.opacity = 0.7 * (1 - pt);
    // trajet animé
    if (trajet) {
      matTrajet.dashSize = cam.r * 0.022; matTrajet.gapSize = cam.r * 0.014;
      if (!reduit) matTrajet.dashOffset -= dt * cam.r * 0.06;
      u = reduit ? 0.5 : (u + dt * Math.max(0.05, 1 / Math.max(6, trajet.longueur / 25))) % 1;
      if (trajet.type === 'nuit') {
        orbe.position.copy(trajet.courbe.getPointAt(u)); orbe.scale.setScalar(ps * 0.9);
      } else {
        const cs = Math.max(0.012, cam.r * 0.008), loin = cam.r > 450;
        caravane.forEach(({ c, b: bt }, j) => {
          const uj = ((u - j * 3.2 * cs / trajet.longueur) % 1 + 1) % 1;
          const p = trajet.courbe.getPointAt(uj), p2 = trajet.courbe.getPointAt(Math.min(1, uj + 0.004));
          const mer = R.y(p.x, p.z) <= 0, o = mer ? bt : c;
          c.visible = !loin && !mer && uj < 0.995; bt.visible = !loin && mer && uj < 0.995;
          o.position.set(p.x, Math.max(R.y(p.x, p.z), 0) + (mer ? -0.01 * cs : 0), p.z); o.scale.setScalar(cs);
          if (p2.distanceTo(p) > 1e-5) o.lookAt(p2.x, o.position.y, p2.z);
        });
      }
    }
    renderer.render(scene, camera);
    // étiquettes : les plus importantes d'abord, une étiquette qui en chevauche une autre est masquée
    const w = canvas.clientWidth, h = canvas.clientHeight, placees = [];
    for (const id of ordreEtiquettes()) {
      const p = PINS[id], el = LBL[id];
      let montre = p.g.visible, x = 0, y = 0;
      if (montre) { v3.set(p.x, p.g.position.y + 1.4 * p.g.scale.x, p.z).project(camera); montre = v3.z < 1; }
      if (montre) {
        x = (v3.x * 0.5 + 0.5) * w; y = (-v3.y * 0.5 + 0.5) * h;
        if (!el._w) { el._w = el.offsetWidth; el._h = el.offsetHeight; }
        const tw = el._w || 80, th = el._h || 24;
        const boite = [x - tw / 2, y - th, x + tw / 2, y];
        montre = !placees.some((q) => boite[0] < q[2] && boite[2] > q[0] && boite[1] < q[3] && boite[3] > q[1]);
        if (montre) placees.push(boite);
      }
      el.classList.toggle('off', !montre);
      if (montre) el.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
      el.style.zIndex = courant && courant.lieu === id ? 5 : 1;
    }
    requestAnimationFrame(boucle);
  }
  appliquerCamera();
  requestAnimationFrame(boucle);

  return {
    selectionner, cadrer, accueil, vueLieu, theme,
    zoomLieu: (id) => vueLieu(id),
    satellite: (on) => terrain.habillage(on),
    arreter: () => { vol = null; },
    zoom: (f) => { vol = null; cam.r = Math.min(R_MAX, Math.max(R_MIN, cam.r * f)); },
    pivoter: (a) => volVers(cam.cible, cam.r, cam.theta + a, cam.phi, 600),
    placer: (r, theta, phi) => { cam.r = r; cam.theta = theta; cam.phi = phi; },
    rafraichirVue: () => { cleVue = ''; },
  };
}
