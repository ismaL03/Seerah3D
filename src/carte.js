// Scène 3D : lumière, caméra (orbite ou vol libre), épingles, étiquettes, trajets et convois,
// batailles. Unités : 1 = 1 km ; x vers l'est, z vers le sud.
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { creerTerrain } from './terrain.js';
import { creerDecor, OASIS, HARRAT } from './decor.js';
import { creerBataille } from './bataille.js';
import { chameau, cheval, bateau, etendard, agiter } from './montures.js';
import { creerMiseEnScene } from './scene.js';
import { pointsTrajet, positionLieu } from './donnees.js';

const R_MIN = 0.08, R_MAX = 1400;
// Distance de vue au-delà de laquelle un lieu de niveau 2, 3 ou 4 (monument dans une ville) est masqué.
const PORTEE = { 1: Infinity, 2: 320, 3: 90, 4: 14 };
// Composition des convois, selon le type de trajet.
const CONVOIS = { caravane: ['c', 'cc', 'c', 'cc'], armee: ['h', 'ce', 'h', 'c', 'h', 'cc'], mer: ['c', 'cc', 'c'], nuit: [], poursuite: ['h', 'h', 'h', 'h', 'h'] };

export async function creerCarte({ canvas, etiquettes, R, D, mobile, reduit, surLieu, surInteraction, zoneLibre, surImage }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.toneMapping = THREE.NeutralToneMapping; // hautes lumières adoucies, couleurs préservées
  renderer.toneMappingExposure = 1.05;
  const DPR_MAX = Math.min(devicePixelRatio, mobile ? 1.5 : 2);
  let dpr = DPR_MAX;
  renderer.setPixelRatio(dpr);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap; // ombres douces
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.002, 8000);
  camera.rotation.order = 'YXZ';
  scene.fog = new THREE.Fog(0xE6ECEA, 1000, 4000);

  const hemi = new THREE.HemisphereLight(0xDCE8F2, 0xC9A57C, 1.2);
  const soleil = new THREE.DirectionalLight(0xFFF0D8, 3.6);
  soleil.castShadow = true;
  soleil.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  const amb = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(hemi, soleil, soleil.target, amb);
  const DIR_SOLEIL = new THREE.Vector3(0.62, 0.5, 0.42).normalize(); // lumière assez rasante pour lire le relief (modifiée par l'ambiance)
  // Ciel : dôme en dégradé (zénith, horizon voilé de poussière, halo du soleil), dessiné derrière tout le reste.
  const ciel = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({
    uniforms: { haut: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, bas: { value: new THREE.Color() }, dirSoleil: { value: DIR_SOLEIL }, halo: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 haut, horizon, bas, dirSoleil, halo; varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 c = d.y > 0.0 ? mix(horizon, haut, pow(d.y, 0.55)) : mix(horizon, bas, pow(-d.y, 0.4));
        float s = max(0.0, dot(d, normalize(dirSoleil)));
        c += halo * (pow(s, 8.0) * 0.25 + pow(s, 200.0) * 0.6);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  }));
  ciel.frustumCulled = false; ciel.renderOrder = -10;
  scene.add(ciel);

  const terrain = await creerTerrain(R, { renderer, mobile, oasis: OASIS, harrat: HARRAT });
  scene.add(terrain.groupe);
  const decor = creerDecor(R, D);
  scene.add(decor.groupe);
  const bataille = creerBataille({ scene, R, etiquettes, reduit });
  // missions : repères cliquables, accessoires et effets posés sur la carte
  let surRepere = () => {};
  const mise = creerMiseEnScene({ scene, R, etiquettes, reduit, surRepere: (id) => surRepere(id) });
  const b = R.bornes;

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

  // ---------- trajets et convois ----------
  // Lignes d'épaisseur constante à l'écran, quel que soit le zoom ; tirets animés.
  const matTrajet = new LineMaterial({ color: 0xC9962F, linewidth: 5, dashed: true, dashSize: 1, gapSize: 0.6 });
  const matHalo = new LineMaterial({ color: 0xC9962F, linewidth: 14, transparent: true, opacity: 0.25, depthWrite: false });
  let trajet = null; // { groupe, courbe, longueur, type, convoi: [{o, mer, decalage}] }
  const orbe = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 16), new THREE.MeshBasicMaterial({ color: 0xFFE3A0 }));
  orbe.add(new THREE.Mesh(new THREE.SphereGeometry(2.6, 24, 16), new THREE.MeshBasicMaterial({ color: 0xFFD27A, transparent: true, opacity: 0.25, depthWrite: false })));
  orbe.visible = false; scene.add(orbe);

  function membre(code, k) {
    if (code === 'h') return cheval(k);
    if (code === 'cc') return chameau(true);
    if (code === 'ce') { const c = chameau(false), e = etendard(0x0E7A5A); e.position.set(0, 2, -0.5); c.add(e); c.userData.etendard = e; return c; }
    return chameau(false);
  }

  // Points d'un tracé posé sur le relief (arc lumineux pour un voyage de nuit).
  function echantillonner(etapes, nuit) {
    const pts = pointsTrajet(D, { etapes }).map(([la, lo]) => { const [x, z] = R.xz(la, lo); return new THREE.Vector3(x, 0, z); });
    const plan = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.3);
    const longueur = plan.getLength();
    const N = Math.min(1500, Math.max(80, Math.round(longueur * 2.5)));
    const suivi = [];
    for (let k = 0; k <= N; k++) {
      const v = plan.getPointAt(k / N);
      v.y = nuit ? R.sol(v.x, v.z) + 1 + Math.sin(Math.PI * k / N) * longueur * 0.22 : R.sol(v.x, v.z) + 0.02;
      suivi.push(v);
    }
    // évite que la ligne passe sous le relief entre deux échantillons
    if (!nuit) for (let k = 1; k < N; k++) suivi[k].y = Math.max(suivi[k].y, (suivi[k - 1].y + suivi[k + 1].y) / 2);
    return { suivi, longueur, N };
  }

  function construireTrajet(ev) {
    if (trajet) {
      scene.remove(trajet.groupe);
      trajet.groupe.traverse((o) => o.geometry && o.geometry.dispose());
      trajet = null;
    }
    orbe.visible = false;
    if (!ev.trajet) return;
    const nuit = ev.trajet.type === 'nuit', { suivi, longueur, N } = echantillonner(ev.trajet.etapes, nuit);
    const courbe = new THREE.CatmullRomCurve3(suivi);
    const geo = new LineGeometry(); geo.setPositions(suivi.flatMap((v) => [v.x, v.y, v.z]));
    const ligne = new Line2(geo, matTrajet); ligne.computeLineDistances();
    // halo sur un tracé allégé : des segments plus courts qu'un pixel se superposeraient et l'opacité saturerait
    const pas = Math.max(1, Math.ceil(N / 120)), allege = suivi.filter((_, k) => k % pas === 0 || k === N);
    const geoHalo = new LineGeometry(); geoHalo.setPositions(allege.flatMap((v) => [v.x, v.y, v.z]));
    const halo = new Line2(geoHalo, matHalo);
    ligne.renderOrder = 3; halo.renderOrder = 2;
    const groupe = new THREE.Group(); groupe.add(halo, ligne);
    // convoi : montures sur terre ; pour une traversée, des boutres prennent le relais sur l'eau
    const convoi = (CONVOIS[ev.trajet.type] || CONVOIS.caravane).map((code, k) => {
      const o = membre(code, k); groupe.add(o);
      return { o, rang: k };
    });
    const flotte = ev.trajet.type === 'mer' ? [0, 1, 2].map((k) => { const o = bateau(); groupe.add(o); return { o, rang: k, lateral: [0, 2.6, -2.6][k] }; }) : [];
    scene.add(groupe);
    trajet = { groupe, courbe, longueur, type: ev.trajet.type, convoi, flotte };
    if (nuit) orbe.visible = true;
  }

  // ---------- caméra ----------
  const cam = { cible: new THREE.Vector3(0, 0, 0), r: 1000, theta: -0.25, phi: 0.8 };
  let FIT = 1, transit = null;
  const phiMax = () => (cam.r < 3 ? 1.47 : cam.r < 30 ? 1.38 : 1.3);
  function appliquerCamera() {
    const sp = Math.sin(cam.phi);
    camera.position.set(cam.cible.x + cam.r * sp * Math.sin(cam.theta), cam.cible.y + cam.r * Math.cos(cam.phi), cam.cible.z + cam.r * sp * Math.cos(cam.theta));
    // la caméra ne passe jamais sous le relief
    const sol = R.sol(camera.position.x, camera.position.z) + Math.max(0.012, cam.r * 0.02);
    if (camera.position.y < sol) camera.position.y = sol;
    camera.lookAt(cam.cible);
  }
  // Plans proche et lointain selon la hauteur de la caméra : bonne précision de profondeur de près comme de loin.
  function plans(vue) {
    const h = camera.position.y - R.sol(camera.position.x, camera.position.z);
    const near = Math.min(30, Math.max(0.002, h * 0.3)), far = (vue * 6 + 40) * 1.4 + 60;
    if (Math.abs(camera.near - near) > near * 0.1 || Math.abs(camera.far - far) > far * 0.1) {
      camera.near = near; camera.far = far; camera.updateProjectionMatrix();
    }
  }
  // Finesse adaptative : si les images tardent, on dessine moins de pixels.
  const chrono = { n: 0, t: 0 };
  function adapter(dtReel) {
    chrono.n++; chrono.t += dtReel;
    if (chrono.n < 90) return;
    const moyen = chrono.t / chrono.n; chrono.n = 0; chrono.t = 0;
    const cible = moyen > 0.034 ? Math.max(1, dpr - 0.25) : moyen < 0.015 ? Math.min(DPR_MAX, dpr + 0.25) : dpr;
    if (cible !== dpr) { dpr = cible; renderer.setPixelRatio(dpr); cleVue = ''; }
  }
  function volVers(cible, r, theta, phi, duree) {
    if (libre.actif) return; // en vol libre, c'est l'utilisateur qui pilote
    let dt = (theta ?? cam.theta) - cam.theta; dt = Math.atan2(Math.sin(dt), Math.cos(dt));
    zoom.r = null; elan.x = elan.z = elan.theta = 0; inclinaisonAuto = true;
    transit = { t0: performance.now(), duree: reduit ? 0 : (duree ?? 1600), a: { c: cam.cible.clone(), r: cam.r, th: cam.theta, ph: cam.phi }, b: { c: cible.clone(), r, th: cam.theta + dt, ph: phi ?? cam.phi } };
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
    majVue();
    const bb = new THREE.Box3().setFromPoints(points), c = bb.getCenter(new THREE.Vector3());
    c.y = R.sol(c.x, c.z);
    const r0 = Math.max(rMin, bb.getSize(new THREE.Vector3()).length() * 1.2);
    volVers(c, Math.max(rMin, distancePour(c, theta, phi, points, r0)), theta, phi, duree);
  }
  const pointsSol = (ev) => pointsTrajet(D, ev.trajet).map(([la, lo]) => { const [x, z] = R.xz(la, lo); return new THREE.Vector3(x, R.sol(x, z), z); });
  const PRES = { 1: 3.2, 2: 4.5, 3: 2.4, 4: 0.9 }; // distance de vue rapprochée selon le niveau du lieu
  function cadrer(ev, duree) {
    majVue();
    const L = D.LIEUX[ev.lieu];
    if (ev.trajet) {
      const plan = new THREE.CatmullRomCurve3(pointsSol(ev), false, 'catmullrom', 0.3), pts = plan.getSpacedPoints(40);
      if (ev.trajet.type === 'nuit') pts.forEach((p, k) => (p.y += Math.sin(Math.PI * k / 40) * plan.getLength() * 0.22));
      cadrerPoints(pts, -0.3, plan.getLength() > 40 ? 0.78 : 1.0, 2, duree);
    } else {
      volVers(pos(L.id), (PRES[L.niveau] || 3) * Math.sqrt(FIT), -0.45, 1.05, duree);
    }
  }
  function accueil() {
    majVue();
    const pts = [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]].map(([x, z]) => new THREE.Vector3(x, 0, z));
    cadrerPoints(pts, -0.5, 0.78, 100);
  }
  function vueLieu(id, r) {
    majVue();
    r = r || (PRES[D.LIEUX[id].niveau] || 3) * 0.8;
    volVers(pos(id), r, cam.theta, Math.min(phiAuto(r), 1.12));
  }

  // Point du sol sous un pixel de l'écran (marche le long du rayon, puis affine).
  const rayon = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function solSous(clientX, clientY) {
    const rc = canvas.getBoundingClientRect();
    ndc.set((clientX - rc.left) / rc.width * 2 - 1, -(clientY - rc.top) / rc.height * 2 + 1);
    rayon.setFromCamera(ndc, camera);
    const o = rayon.ray.origin, d = rayon.ray.direction, p = new THREE.Vector3();
    let t = 0, pas = Math.max(0.01, (o.y - R.sol(o.x, o.z)) * 0.05), avant = 0, entre = false;
    for (let k = 0; k < 600; k++) {
      p.copy(o).addScaledVector(d, t);
      // la caméra peut être hors de l'emprise (vue d'ensemble inclinée) : on avance jusqu'à y entrer
      if (!R.dedans(p.x, p.z)) {
        if (entre || p.y < -10) return null;
        avant = t; t += pas; pas *= 1.04; continue;
      }
      entre = true;
      if (p.y <= R.sol(p.x, p.z)) {
        let a = avant, c = t; // dichotomie entre le dernier point au-dessus et le premier en dessous
        for (let j = 0; j < 20; j++) { const m = (a + c) / 2; p.copy(o).addScaledVector(d, m); if (p.y <= R.sol(p.x, p.z)) c = m; else a = m; }
        p.copy(o).addScaledVector(d, c); p.y = R.sol(p.x, p.z);
        return p;
      }
      avant = t; t += pas; pas *= 1.04;
    }
    return null;
  }

  // ---------- vol libre ----------
  const libre = { actif: false, pos: new THREE.Vector3(), lacet: 0, tangage: 0, touches: new Set(), pad: new Set(), glisse: null };
  const COMMANDES = {
    avant: ['KeyW', 'ArrowUp'], arriere: ['KeyS', 'ArrowDown'], gauche: ['KeyA', 'ArrowLeft'], droite: ['KeyD', 'ArrowRight'],
    haut: ['Space', 'KeyE', 'PageUp'], bas: ['KeyC', 'KeyQ', 'PageDown'], vite: ['ShiftLeft', 'ShiftRight'],
  };
  // Sur un clavier AZERTY, KeyW est la touche Z et KeyA la touche Q : on lit la position physique (e.code).
  const presse = (nom) => COMMANDES[nom].some((c) => libre.touches.has(c)) || libre.pad.has(nom);
  addEventListener('keydown', (e) => {
    if (!libre.actif || e.target.tagName === 'INPUT') return;
    if (Object.values(COMMANDES).flat().includes(e.code)) { libre.touches.add(e.code); e.preventDefault(); }
  });
  addEventListener('keyup', (e) => libre.touches.delete(e.code));
  addEventListener('blur', () => libre.touches.clear());
  function entrerVol() {
    transit = null;
    libre.actif = true;
    libre.pos.copy(camera.position);
    const d = new THREE.Vector3().subVectors(cam.cible, camera.position).normalize();
    libre.lacet = Math.atan2(-d.x, -d.z);
    libre.tangage = Math.max(-1.2, Math.min(0.3, Math.asin(d.y) * 0.6));
    // on descend volontiers près du sol pour commencer
    const sol = R.sol(libre.pos.x, libre.pos.z);
    if (libre.pos.y - sol > 8) libre.glisse = { t0: performance.now(), a: libre.pos.clone(), b: new THREE.Vector3(cam.cible.x, R.sol(cam.cible.x, cam.cible.z) + Math.min(2, cam.r * 0.15) + 0.15, cam.cible.z + Math.min(4, cam.r * 0.3)), duree: 1800 };
  }
  function finVol() {
    if (!libre.actif) return;
    libre.actif = false; libre.touches.clear(); libre.pad.clear();
    // retour à l'orbite autour du point visé
    const avant = new THREE.Vector3(-Math.sin(libre.lacet) * Math.cos(libre.tangage), Math.sin(libre.tangage), -Math.cos(libre.lacet) * Math.cos(libre.tangage));
    let c = null;
    if (libre.tangage < -0.05) { const t = (libre.pos.y - R.sol(libre.pos.x, libre.pos.z)) / -avant.y; c = libre.pos.clone().addScaledVector(avant, Math.min(t, 20)); }
    if (!c) c = libre.pos.clone().addScaledVector(avant, 3);
    c.x = Math.max(b.x0, Math.min(b.x1, c.x)); c.z = Math.max(b.z0, Math.min(b.z1, c.z)); c.y = R.sol(c.x, c.z);
    const v = libre.pos.clone().sub(c);
    cam.cible.copy(c); cam.r = Math.max(R_MIN, v.length()); cam.theta = Math.atan2(v.x, v.z); cam.phi = Math.min(phiMax(), Math.acos(Math.max(-1, Math.min(1, v.y / cam.r))));
  }
  function avancerVol(dt, now) {
    if (libre.glisse) {
      const g = libre.glisse, t = Math.min(1, (now - g.t0) / g.duree), k = lisse(t);
      libre.pos.lerpVectors(g.a, g.b, k);
      if (t >= 1) libre.glisse = null;
    }
    const avant = new THREE.Vector3(-Math.sin(libre.lacet) * Math.cos(libre.tangage), Math.sin(libre.tangage), -Math.cos(libre.lacet) * Math.cos(libre.tangage));
    const droite = new THREE.Vector3(Math.cos(libre.lacet), 0, -Math.sin(libre.lacet));
    const m = new THREE.Vector3();
    if (presse('avant')) m.add(avant); if (presse('arriere')) m.sub(avant);
    if (presse('droite')) m.add(droite); if (presse('gauche')) m.sub(droite);
    if (presse('haut')) m.y += 1; if (presse('bas')) m.y -= 1;
    const sol = R.sol(libre.pos.x, libre.pos.z), h = libre.pos.y - sol;
    const vitesse = Math.min(30, Math.max(0.04, h * 1.2 + 0.03)) * (presse('vite') ? 4 : 1);
    if (m.lengthSq() > 0) { libre.glisse = null; libre.pos.addScaledVector(m.normalize(), vitesse * dt); }
    libre.pos.x = Math.max(b.x0, Math.min(b.x1, libre.pos.x)); libre.pos.z = Math.max(b.z0, Math.min(b.z1, libre.pos.z));
    libre.pos.y = Math.min(500, Math.max(R.sol(libre.pos.x, libre.pos.z) + 0.008, libre.pos.y));
    camera.position.copy(libre.pos);
    camera.rotation.set(libre.tangage, libre.lacet, 0, 'YXZ');
    return { vitesse: m.lengthSq() > 0 ? vitesse : 0, h };
  }
  function lieuProche(x, z) {
    let best = null, dmin = Infinity;
    for (const p of Object.values(PINS)) { if (p.l.hors_carte) continue; const d = Math.hypot(p.x - x, p.z - z); if (d < dmin) { dmin = d; best = p.l; } }
    return { nom: best ? best.nom : '', distance: dmin };
  }

  // ---------- commandes à la souris et au doigt ----------
  // Glisser : le point du sol saisi reste sous le pointeur (avec un élan au lâcher).
  // Clic droit (ou Maj) : tourner et incliner. Molette : zoom progressif vers le point visé ;
  // en s'approchant, la vue s'incline d'elle-même (carte vue d'en haut de loin, relief de près).
  const pointeurs = new Map(); let appui = null, geste = null, prise = null, inclinaisonAuto = true;
  const elan = { x: 0, z: 0, theta: 0 }, zoom = { r: null, point: null }, clavier = new Set();
  const plan = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const phiAuto = (r) => 1.2 - 0.5 * Math.min(1, Math.max(0, Math.log(r / 1.5) / Math.log(500 / 1.5)));
  function deplacer(dx, dz) {
    cam.cible.x = Math.max(b.x0, Math.min(b.x1, cam.cible.x + dx));
    cam.cible.z = Math.max(b.z0, Math.min(b.z1, cam.cible.z + dz));
    cam.cible.y = R.sol(cam.cible.x, cam.cible.z);
  }
  function surPlan(clientX, clientY, y) {
    appliquerCamera(); camera.updateMatrixWorld();
    const rc = canvas.getBoundingClientRect();
    ndc.set((clientX - rc.left) / rc.width * 2 - 1, -(clientY - rc.top) / rc.height * 2 + 1);
    rayon.setFromCamera(ndc, camera);
    plan.constant = -y;
    return rayon.ray.intersectPlane(plan, new THREE.Vector3());
  }
  function zoomer(f, point) {
    zoom.r = Math.min(R_MAX, Math.max(R_MIN, (zoom.r ?? cam.r) * f));
    zoom.point = point || null;
  }
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    appui = { x: e.clientX, y: e.clientY, t: performance.now(), b: e.button, mod: e.shiftKey || e.ctrlKey || e.altKey };
    transit = null; zoom.r = null; elan.x = elan.z = elan.theta = 0; derive = 0;
    if (libre.actif) libre.glisse = null;
    surInteraction(); canvas.classList.add('drag');
    prise = null;
    if (!libre.actif && pointeurs.size === 1 && e.button === 0 && !appui.mod) {
      const p = solSous(e.clientX, e.clientY);
      if (p) prise = { point: p, t: e.timeStamp };
    }
    if (pointeurs.size === 2) {
      prise = null;
      const [p, q] = [...pointeurs.values()];
      geste = { d: Math.hypot(p.x - q.x, p.y - q.y), a: Math.atan2(q.y - p.y, q.x - p.x), y: (p.y + q.y) / 2, point: solSous((p.x + q.x) / 2, (p.y + q.y) / 2) };
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointeurs.has(e.pointerId)) { if (!libre.actif && !visee) canvas.classList.toggle('hover', !!viser(e)); return; }
    const p = pointeurs.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (libre.actif) { // regarder autour de soi
      libre.lacet -= dx * 0.004; libre.tangage = Math.max(-1.45, Math.min(1.2, libre.tangage - dy * 0.004));
      return;
    }
    if (pointeurs.size === 2 && geste) { // pincer pour zoomer (vers le milieu des doigts), tourner, incliner
      const [a, c] = [...pointeurs.values()], d = Math.hypot(a.x - c.x, a.y - c.y), ang = Math.atan2(c.y - a.y, c.x - a.x), my = (a.y + c.y) / 2;
      const r = Math.min(R_MAX, Math.max(R_MIN, cam.r * geste.d / d));
      if (geste.point) cam.cible.lerp(geste.point, 1 - r / cam.r);
      cam.r = r;
      cam.theta -= ang - geste.a;
      if (Math.abs(my - geste.y) > 0.5) { cam.phi = Math.max(0.2, Math.min(phiMax(), cam.phi - (my - geste.y) * 0.004)); inclinaisonAuto = false; }
      geste = { ...geste, d, a: ang, y: my };
      return;
    }
    if (appui && (appui.b === 2 || appui.mod)) { // clic droit (ou Maj) : tourner et incliner
      cam.theta -= dx * 0.005; elan.theta = -dx * 0.005 * 60;
      if (dy) { cam.phi = Math.max(0.2, Math.min(phiMax(), cam.phi - dy * 0.004)); inclinaisonAuto = false; }
    } else if (prise) { // le point saisi reste sous le pointeur
      const q = surPlan(e.clientX, e.clientY, prise.point.y);
      if (q) {
        const ddx = prise.point.x - q.x, ddz = prise.point.z - q.z, dt = Math.max(8, e.timeStamp - prise.t) / 1000;
        deplacer(ddx, ddz);
        elan.x = elan.x * 0.3 + (ddx / dt) * 0.7; elan.z = elan.z * 0.3 + (ddz / dt) * 0.7;
        prise.t = e.timeStamp;
      }
    }
  });
  function fin(e) {
    pointeurs.delete(e.pointerId);
    if (pointeurs.size < 2) geste = null;
    canvas.classList.remove('drag');
    if (prise && e.timeStamp - prise.t > 80) elan.x = elan.z = 0; // geste arrêté avant de lâcher : pas d'élan
    prise = null;
    if (appui && pointeurs.size === 0) {
      const bouge = Math.hypot(e.clientX - appui.x, e.clientY - appui.y);
      if (bouge < 6) {
        elan.x = elan.z = elan.theta = 0;
        if (performance.now() - appui.t < 500 && !libre.actif) {
          if (visee) { const p = solSous(e.clientX, e.clientY); if (p) { const [lat, lon] = R.latlon(p.x, p.z); visee({ lat, lon }); } }
          else { const id = viser(e); if (id) surLieu(id); }
        }
      }
      appui = null;
    }
  }
  canvas.addEventListener('pointerup', fin);
  canvas.addEventListener('pointercancel', fin);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault(); transit = null; elan.x = elan.z = elan.theta = 0; derive = 0;
    surInteraction();
    const f = Math.exp(Math.sign(e.deltaY) * Math.min(0.35, Math.abs(e.deltaY) * 0.0016));
    if (libre.actif) { const h = libre.pos.y - R.sol(libre.pos.x, libre.pos.z), avant = new THREE.Vector3(-Math.sin(libre.lacet), Math.sin(libre.tangage), -Math.cos(libre.lacet)); libre.pos.addScaledVector(avant, -(f - 1) * 4 * (h + 0.2)); return; }
    zoomer(f, solSous(e.clientX, e.clientY));
  }, { passive: false });
  // Double-clic : plonger vers le point
  canvas.addEventListener('dblclick', (e) => {
    if (visee) return; // en visée, un double clic compterait deux essais : pas de plongée
    const p = solSous(e.clientX, e.clientY); if (!p) return;
    surInteraction();
    if (libre.actif) { libre.glisse = { t0: performance.now(), a: libre.pos.clone(), b: new THREE.Vector3(p.x, p.y + Math.max(0.15, (libre.pos.y - p.y) * 0.4), p.z), duree: 1400 }; return; }
    inclinaisonAuto = true;
    zoomer(0.35, p);
  });
  // Clavier (hors vol libre) : flèches pour se déplacer, Maj + flèches pour tourner et incliner, + et − pour zoomer
  const TOUCHES_ORBITE = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract', 'ShiftLeft', 'ShiftRight'];
  addEventListener('keydown', (e) => {
    if (libre.actif || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (TOUCHES_ORBITE.includes(e.code)) { clavier.add(e.code); if (!e.code.startsWith('Shift')) { e.preventDefault(); transit = null; surInteraction(); } }
  });
  addEventListener('keyup', (e) => clavier.delete(e.code));
  addEventListener('blur', () => clavier.clear());
  function piloterOrbite(dt) {
    // zoom progressif
    if (zoom.r != null) {
      const r1 = cam.r + (zoom.r - cam.r) * (1 - Math.exp(-dt * 10));
      if (zoom.point) { cam.cible.lerp(zoom.point, 1 - r1 / cam.r); deplacer(0, 0); }
      cam.r = r1;
      if (inclinaisonAuto) cam.phi += (phiAuto(cam.r) - cam.phi) * (1 - Math.exp(-dt * 5));
      if (Math.abs(zoom.r - cam.r) < zoom.r * 0.003) zoom.r = null;
    }
    // élan après un glisser
    if (!pointeurs.size && (elan.x || elan.z || elan.theta)) {
      deplacer(elan.x * dt, elan.z * dt); cam.theta += elan.theta * dt;
      const k = Math.exp(-dt * 4.5);
      elan.x *= k; elan.z *= k; elan.theta *= k;
      if (Math.hypot(elan.x, elan.z) < cam.r * 0.002 && Math.abs(elan.theta) < 0.002) elan.x = elan.z = elan.theta = 0;
    }
    // clavier
    if (clavier.size) {
      const has = (c) => clavier.has(c), maj = has('ShiftLeft') || has('ShiftRight');
      const av = (has('ArrowUp') ? 1 : 0) - (has('ArrowDown') ? 1 : 0), dr = (has('ArrowRight') ? 1 : 0) - (has('ArrowLeft') ? 1 : 0);
      if (maj) {
        cam.theta -= dr * 1.4 * dt;
        if (av) { cam.phi = Math.max(0.2, Math.min(phiMax(), cam.phi + av * 0.9 * dt)); inclinaisonAuto = false; }
      } else if (av || dr) {
        const v = cam.r * 0.8 * dt, ct = Math.cos(cam.theta), st = Math.sin(cam.theta);
        deplacer((-st * av + ct * dr) * v, (-ct * av - st * dr) * v);
      }
      const z = (has('Equal') || has('NumpadAdd') ? 1 : 0) - (has('Minus') || has('NumpadSubtract') ? 1 : 0);
      if (z) zoomer(Math.exp(-z * 1.6 * dt), null);
    }
  }
  function viser(e) {
    const rc = canvas.getBoundingClientRect();
    ndc.set((e.clientX - rc.left) / rc.width * 2 - 1, -(e.clientY - rc.top) / rc.height * 2 + 1);
    rayon.setFromCamera(ndc, camera);
    const h = rayon.intersectObjects(cliquables.filter((o) => o.parent.visible), false)[0];
    return h && h.object.userData.id;
  }

  // ---------- thème ----------
  // ciel : horizon (et brume) ; zenith, sous : haut et bas du dôme ; halo : autour du soleil
  const JOUR = { ciel: 0xEDE3D0, zenith: 0x8FB6D3, sous: 0xE3D6BE, halo: 0xFFF1D6, hs: 0xDCE8F2, hg: 0xC9A57C, hi: 1.15, sol: 0xFFF0D8, si: 3.7, amb: 0.12, ter: 0xffffff, paroi: 0xB79770, eau: 0x4FAFC6 };
  const NUIT = { ciel: 0x1A2438, zenith: 0x060B16, sous: 0x141A28, halo: 0x3A4C78, hs: 0x6478A8, hg: 0x2A2A34, hi: 1.6, sol: 0xB4C6FF, si: 1.4, amb: 0.2, ter: 0xAEB6D0, paroi: 0x4A4552, eau: 0x1E4E69 };
  // Aube (ou crépuscule) : soleil bas à l'ouest, lumière chaude, ombres longues.
  const AUBE = { ciel: 0xF2CDA4, zenith: 0x7C93B4, sous: 0xD9B892, halo: 0xFFC488, hs: 0xFFE4C8, hg: 0xA7805E, hi: 1.1, sol: 0xFFC490, si: 3.7, amb: 0.12, ter: 0xFFEEDD, paroi: 0xB08462, eau: 0x5C9FB5, dir: [-0.78, 0.3, 0.3] };
  const AMBIANCES = { jour: JOUR, nuit: NUIT, aube: AUBE };
  function theme(sombre, couleurCategorie) {
    appliquerAmbiance(sombre ? NUIT : JOUR, sombre);
    if (couleurCategorie) colorerTrajet(couleurCategorie);
  }
  function appliquerAmbiance(S, sombre) {
    DIR_SOLEIL.set(...(S.dir || [0.62, 0.5, 0.42])).normalize();
    scene.background = new THREE.Color(S.ciel); scene.fog.color.setHex(S.ciel);
    const u = ciel.material.uniforms;
    u.haut.value.setHex(S.zenith); u.horizon.value.setHex(S.ciel); u.bas.value.setHex(S.sous); u.halo.value.setHex(S.halo);
    hemi.color.setHex(S.hs); hemi.groundColor.setHex(S.hg); hemi.intensity = S.hi;
    soleil.color.setHex(S.sol); soleil.intensity = S.si; amb.intensity = S.amb;
    terrain.materiaux.forEach((m) => m.color.setHex(S.ter)); terrain.matParoi.color.setHex(S.paroi); terrain.matEau.color.setHex(S.eau);
    decor.nuit(sombre);
  }
  function colorerTrajet(couleur) { const c = new THREE.Color(couleur); matTrajet.color.copy(c); matHalo.color.copy(c); }

  // ---------- sélection ----------
  // « marque » : le lieu mis en avant (celui de l'événement courant, ou celui dont la fiche est ouverte).
  let marque = null, lieuxTrajet = [];
  function surligner(id, titre) {
    marque = id;
    for (const k in PINS) {
      const p = PINS[k];
      p.tete.material = p.pointe.material = k === id ? matPinOn : (p.l.hors_carte ? matPinBord : matPin);
    }
    for (const k in LBL) {
      const on = k === id, el = LBL[k], cur = el.querySelector('.ev.cur');
      el.classList.toggle('on', on); cur.hidden = !on || !titre; if (on && titre) cur.textContent = titre;
      el._w = 0; // à remesurer
    }
    const p = PINS[id];
    onde.visible = !!p;
    if (p) onde.position.set(p.x, p.base + 0.002, p.z);
  }
  function selectionner(ev, index, couleur) {
    decor.ere.forEach((e) => (e.o.visible = e.visible(index)));
    construireTrajet(ev);
    colorerTrajet(couleur);
    lieuxTrajet = ev.trajet ? ev.trajet.etapes.filter((x) => typeof x === 'string' && D.LIEUX[x]) : [];
    surligner(ev.lieu, ev.titre);
  }
  // Fiche d'un lieu : on retire le trajet et la bataille, on met le lieu en avant et on s'en approche.
  function montrerLieu(id, r) {
    bataille.masquer();
    construireTrajet({});
    lieuxTrajet = [];
    surligner(id, null);
    vueLieu(id, r);
  }

  // ---------- centre optique : la vue vise le milieu de la zone laissée libre par les panneaux ----------
  let cleVue = '';
  function majVue() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const z = zoneLibre(w, h), cle = [w, h, z.l, z.r, z.t, z.b, libre.actif].join();
    if (cle === cleVue) return;
    cleVue = cle;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    if (libre.actif) camera.clearViewOffset();
    else camera.setViewOffset(w, h, w / 2 - (z.l + z.r) / 2, h / 2 - (z.t + z.b) / 2, w, h);
    camera.updateProjectionMatrix();
    matTrajet.resolution.set(w, h); matHalo.resolution.set(w, h);
    FIT = Math.min(2.2, Math.max(1, Math.max(w / (z.r - z.l), h / (z.b - z.t)) * 0.92));
  }

  function ordreEtiquettes() {
    const rang = (id) => (marque === id ? 0 : PINS[id].l.niveau === 1 ? 1 : lieuxTrajet.includes(id) ? 2 : 2 + PINS[id].l.niveau);
    return Object.keys(LBL).sort((a, c) => rang(a) - rang(c));
  }

  // ---------- mise en scène (mode histoire) ----------
  let derive = 0, filtreLieux = null, visee = null;
  // Caméra vers un lieu (identifiant) ou un point [lat, lon] ; cap = direction du regard en degrés (0 = vers le nord),
  // incl = inclinaison en degrés (0 = vue de dessus).
  function viser(cible, r, cap, incl, duree) {
    majVue();
    const [la, lo] = typeof cible === 'string' ? positionLieu(D.LIEUX[cible]) : cible;
    const [x, z] = R.xz(la, lo);
    volVers(new THREE.Vector3(x, R.sol(x, z), z), Math.min(R_MAX, Math.max(R_MIN, r || cam.r)),
      cap == null ? cam.theta : -cap * Math.PI / 180, incl == null ? cam.phi : Math.min(phiMax(), incl * Math.PI / 180), duree ?? 2200);
  }
  // Marques posées sur la carte : essai (rouge), juste (or, colonne de lumière), indice (cercle qui pulse), éclat (onde qui s'élargit).
  const marques = new THREE.Group(); scene.add(marques);
  const geoAnneau = new THREE.RingGeometry(0.75, 1.15, 48), geoColonne = new THREE.CylinderGeometry(0.16, 0.16, 1, 12, 1, true);
  geoAnneau.rotateX(-Math.PI / 2); geoColonne.translate(0, 0.5, 0);
  function poserMarque(lat, lon, genre = 'essai') {
    const [x, z] = R.xz(lat, lon), g = new THREE.Group();
    g.position.set(x, R.sol(x, z) + 0.001, z);
    const couleur = genre === 'essai' ? 0xC4533A : 0xE8BC5E;
    const mat = new THREE.MeshBasicMaterial({ color: couleur, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const anneau = new THREE.Mesh(geoAnneau, mat); anneau.renderOrder = 6; g.add(anneau);
    if (genre === 'juste' || genre === 'essai') {
      const colonne = new THREE.Mesh(geoColonne, new THREE.MeshBasicMaterial({ color: couleur, transparent: true, opacity: genre === 'juste' ? 0.55 : 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
      colonne.renderOrder = 6; g.add(colonne); g.userData.colonne = colonne;
    }
    g.userData = { ...g.userData, genre, t0: performance.now(), anneau, mat };
    marques.add(g);
    return g;
  }
  function animerMarques(now) {
    for (const g of [...marques.children]) {
      const u = g.userData, t = (now - u.t0) / 1000, s = camera.position.distanceTo(g.position) / 140;
      if (u.genre === 'eclat') {
        g.scale.setScalar(s * (1 + t * 9)); u.mat.opacity = Math.max(0, 1 - t / 1.6);
        if (t > 1.6) marques.remove(g);
        continue;
      }
      const pouls = u.genre === 'indice' ? 1 + (reduit ? 0.5 : (t % 1.4) / 1.4) * 2.5 : 1 + Math.min(1, t * 3) * 0.2;
      g.scale.set(s * pouls, s * (u.genre === 'juste' ? Math.min(1, t * 1.5) * 60 : 18), s * pouls);
      if (u.genre === 'indice') u.mat.opacity = reduit ? 0.8 : 1 - (t % 1.4) / 1.4;
    }
  }
  // Itinéraires candidats : tracés en pointillés, chacun avec sa lettre.
  const candidats = { groupe: new THREE.Group(), mats: [], lbls: [] };
  scene.add(candidats.groupe);
  function itineraires(liste) {
    effacerItineraires();
    for (const it of liste || []) {
      const { suivi } = echantillonner(it.etapes, false);
      const geo = new LineGeometry(); geo.setPositions(suivi.flatMap((v) => [v.x, v.y + 0.01, v.z]));
      const m = new LineMaterial({ color: it.couleur, linewidth: 5, dashed: true, dashSize: 1, gapSize: 0.7, transparent: true, opacity: 0.95 });
      const l = new Line2(geo, m); l.computeLineDistances(); l.renderOrder = 3;
      candidats.groupe.add(l); candidats.mats.push(m);
      const el = document.createElement('div');
      el.className = 'lbl candidat'; el.style.setProperty('--uc', it.couleur);
      el.innerHTML = `<b>${it.lettre}</b><span></span>`; el.querySelector('span').textContent = it.nom;
      etiquettes.appendChild(el);
      candidats.lbls.push({ el, p: suivi[Math.round(suivi.length * (it.ancre ?? 0.55))] });
    }
  }
  function effacerItineraires() {
    candidats.groupe.clear(); candidats.mats.forEach((m) => m.dispose()); candidats.mats = [];
    candidats.lbls.forEach((c) => c.el.remove()); candidats.lbls = [];
  }
  // Feux de camp (la nuit de Marr az-Zahrân) : flammes qui vacillent, halo additif.
  let feux = null;
  function allumerFeux(lat, lon, n, rayon) {
    eteindreFeux(); if (!n) return;
    const [cx, cz] = R.xz(lat, lon), geo = new THREE.SphereGeometry(1, 8, 6);
    const coeur = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xFFC46B }), n);
    const halo = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xFF7A1F, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }), n);
    coeur.frustumCulled = halo.frustumCulled = false;
    const pts = [];
    for (let k = 0; pts.length < n && k < n * 4; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * rayon, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r * 0.7;
      if (R.y(x, z) > 0.01 && R.pente(x, z) < 0.25) pts.push({ x, y: R.y(x, z), z, ph: Math.random() * 6 });
    }
    coeur.count = halo.count = pts.length;
    scene.add(coeur, halo);
    feux = { coeur, halo, pts };
  }
  function eteindreFeux() { if (!feux) return; scene.remove(feux.coeur, feux.halo); feux.coeur.dispose(); feux.halo.dispose(); feux = null; }
  const mFeu = new THREE.Matrix4(), qFeu = new THREE.Quaternion(), sFeu = new THREE.Vector3(), pFeu = new THREE.Vector3();
  function animerFeux(now) {
    if (!feux) return;
    const t = now / 1000, s = Math.min(0.06, Math.max(0.0035, camera.position.distanceTo(cam.cible) * 0.0016));
    feux.pts.forEach((f, i) => {
      const v = reduit ? 1 : 0.8 + 0.25 * Math.sin(t * 11 + f.ph) + 0.1 * Math.sin(t * 23 + f.ph * 2);
      mFeu.compose(pFeu.set(f.x, f.y + s * 0.8, f.z), qFeu, sFeu.set(s * v * 0.7, s * v * 1.3, s * v * 0.7)); feux.coeur.setMatrixAt(i, mFeu);
      mFeu.compose(pFeu, qFeu, sFeu.setScalar(s * v * 2.6)); feux.halo.setMatrixAt(i, mFeu);
    });
    feux.coeur.instanceMatrix.needsUpdate = feux.halo.instanceMatrix.needsUpdate = true;
  }

  // ---------- boucle ----------
  const lisse = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const v3 = new THREE.Vector3(), avantV = new THREE.Vector3();
  let dernier = performance.now(), u = 0;
  function boucle(now) {
    const dtReel = Math.max(0, (now - dernier) / 1000), dt = Math.min(0.05, dtReel); dernier = now;
    adapter(dtReel);
    let infoVol = null;
    majVue();
    if (libre.actif) {
      infoVol = avancerVol(dt, now);
    } else {
      if (transit) {
        const t = transit.duree ? Math.min(1, (now - transit.t0) / transit.duree) : 1, k = lisse(t), a = transit.a, c = transit.b;
        cam.cible.lerpVectors(a.c, c.c, k);
        // trajectoire en « saut » : on prend de la hauteur entre deux lieux éloignés
        const saut = Math.min(600, a.c.distanceTo(c.c) * 0.35) * Math.sin(Math.PI * k);
        cam.r = a.r + (c.r - a.r) * k + saut;
        cam.theta = a.th + (c.th - a.th) * k; cam.phi = a.ph + (c.ph - a.ph) * k;
        if (t >= 1) transit = null;
      }
      if (!transit) piloterOrbite(dt);
      if (!transit && derive && !pointeurs.size) cam.theta += derive * dt * (reduit ? 0 : 1);
      cam.phi = Math.min(cam.phi, phiMax());
      appliquerCamera();
    }
    // distance de vue équivalente (orbite : rayon ; vol : hauteur au-dessus du sol)
    const vue = libre.actif ? Math.max(0.3, infoVol.h * 2.5) : cam.r;
    // soleil et ombres centrés sur la vue
    const centre = libre.actif ? v3.set(libre.pos.x, R.sol(libre.pos.x, libre.pos.z), libre.pos.z) : cam.cible;
    const D_SOL = vue * 1.5 + 2;
    soleil.position.copy(centre).addScaledVector(DIR_SOLEIL, D_SOL);
    soleil.target.position.copy(centre); soleil.target.updateMatrixWorld();
    const s = Math.min(800, Math.max(0.25, vue * 0.75)), sc = soleil.shadow.camera;
    if (Math.abs(sc.right - s) > s * 0.03) {
      sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s; sc.near = 0.01; sc.far = D_SOL + vue * 2 + 5;
      sc.updateProjectionMatrix(); soleil.shadow.normalBias = s * 0.0015;
    }
    scene.fog.near = vue * 1.5 + 2; scene.fog.far = vue * 6 + 40;
    plans(vue);
    decor.majBlocs(camera.position);
    // épingles : taille constante à l'écran
    for (const id in PINS) {
      const p = PINS[id], sel = marque === id, visible = filtreLieux ? filtreLieux.includes(id) : sel || lieuxTrajet.includes(id) || vue < PORTEE[p.l.niveau];
      p.g.visible = visible;
      if (!visible) continue;
      const dist = camera.position.distanceTo(v3.set(p.x, p.base, p.z));
      const sz = Math.max(0.0005, dist / 140) * (sel ? 1.35 : 1);
      p.g.scale.setScalar(sz);
      p.g.position.y = p.base + 3.2 * sz + (reduit ? 0 : Math.sin(now / 600 + p.x) * 0.3 * sz);
      p.disque.quaternion.copy(camera.quaternion);
      p.disque.position.copy(avantV.set(0, 0, 1).applyQuaternion(camera.quaternion).multiplyScalar(1.16));
    }
    const ps = camera.position.distanceTo(onde.position) / 140;
    const pt = reduit ? 0.5 : (now % 1800) / 1800;
    onde.scale.setScalar((1 + pt * 3.5) * ps); onde.material.opacity = 0.7 * (1 - pt);
    // trajet animé
    if (trajet) {
      matTrajet.dashSize = vue * 0.022; matTrajet.gapSize = vue * 0.014;
      if (!reduit) matTrajet.dashOffset -= dt * vue * 0.06;
      // vitesse liée au zoom : de loin le convoi parcourt le trajet en quelques secondes, de près il chemine
      const kmParS = Math.min(80, Math.max(0.03, vue * 0.12)) * (trajet.type === 'poursuite' ? 1.8 : 1), duree = Math.max(trajet.type === 'poursuite' ? 3.5 : 6, trajet.longueur / kmParS);
      u = reduit ? 0.5 : (u + dt / duree) % 1;
      if (trajet.type === 'nuit') {
        orbe.position.copy(trajet.courbe.getPointAt(u)); orbe.scale.setScalar(ps * 0.9);
      } else {
        const cs = Math.min(1.2, Math.max(0.0018, vue * 0.006));
        for (const m of trajet.convoi) {
          const uj = ((u - m.rang * 3.4 * cs / trajet.longueur) % 1 + 1) % 1;
          const p = trajet.courbe.getPointAt(uj), p2 = trajet.courbe.getPointAt(Math.min(1, uj + 0.004));
          const mer = R.y(p.x, p.z) <= 0;
          m.o.visible = !mer && uj < 0.995;
          m.o.position.set(p.x, R.sol(p.x, p.z), p.z); m.o.scale.setScalar(cs);
          if (p2.distanceTo(p) > 1e-5) m.o.lookAt(p2.x, m.o.position.y, p2.z);
          if (!reduit && m.o.userData.etendard && m.o.visible) agiter(m.o.userData.etendard, now / 1000);
        }
        for (const f of trajet.flotte) {
          const uj = ((u - f.rang * 2.5 * cs / trajet.longueur) % 1 + 1) % 1;
          const p = trajet.courbe.getPointAt(uj), p2 = trajet.courbe.getPointAt(Math.min(1, uj + 0.004));
          const dir = v3.subVectors(p2, p).setY(0).normalize(), lat = f.lateral * cs * 1.4;
          const x = p.x - dir.z * lat, z = p.z + dir.x * lat;
          f.o.visible = R.y(x, z) <= 0 && uj < 0.995;
          f.o.position.set(x, -0.004, z); f.o.scale.setScalar(cs * 1.5);
          f.o.lookAt(x + dir.x, -0.004, z + dir.z);
          f.o.rotation.z += Math.sin(now / 700 + f.rang) * 0.04; // houle
        }
      }
    }
    const w = canvas.clientWidth, h = canvas.clientHeight;
    bataille.maj(dt, camera, w, h);
    animerMarques(now); animerFeux(now);
    mise.maj(dt, now, camera, w, h, vue);
    for (const m of candidats.mats) { m.resolution.set(w, h); m.dashSize = vue * 0.02; m.gapSize = vue * 0.013; if (!reduit) m.dashOffset -= dt * vue * 0.05; }
    for (const c of candidats.lbls) {
      v3.copy(c.p).project(camera);
      c.el.classList.toggle('off', v3.z >= 1);
      c.el.style.transform = `translate(${(v3.x * 0.5 + 0.5) * w}px,${(-v3.y * 0.5 + 0.5) * h}px) translate(-50%,-50%)`;
    }
    ciel.position.copy(camera.position); ciel.scale.setScalar((camera.near + camera.far) / 2);
    camera.updateMatrixWorld(); terrain.maj(camera); // tuiles du relief, plus fines près de la caméra
    renderer.render(scene, camera);
    // étiquettes : les plus importantes d'abord, une étiquette qui en chevauche une autre est masquée
    const placees = [];
    for (const id of ordreEtiquettes()) {
      const p = PINS[id], el = LBL[id];
      let montre = p.g.visible, x = 0, y = 0;
      if (montre) { v3.set(p.x, p.g.position.y + 1.4 * p.g.scale.x, p.z).project(camera); montre = v3.z < 1; }
      if (montre) {
        x = (v3.x * 0.5 + 0.5) * w; y = (-v3.y * 0.5 + 0.5) * h;
        if (!el._w) { el._w = el.offsetWidth; el._h = el.offsetHeight; }
        const tw = el._w || 80, th = el._h || 24, boite = [x - tw / 2, y - th, x + tw / 2, y];
        montre = !placees.some((q) => boite[0] < q[2] && boite[2] > q[0] && boite[1] < q[3] && boite[3] > q[1]);
        if (montre) placees.push(boite);
      }
      el.classList.toggle('off', !montre);
      if (montre) el.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
      el.style.zIndex = marque === id ? 5 : 1;
    }
    // état de la vue, pour la boussole et la mini-carte
    const ici = libre.actif ? libre.pos : cam.cible, [lat, lon] = R.latlon(ici.x, ici.z);
    const etat = { lat, lon, cap: libre.actif ? -libre.lacet : -cam.theta, portee: libre.actif ? 3 : cam.r * 0.8, emprise: R.meta.emprise };
    if (libre.actif) etat.vol = { vitesse: infoVol.vitesse, ...lieuProche(libre.pos.x, libre.pos.z) };
    surImage(etat);
    requestAnimationFrame(boucle);
  }
  appliquerCamera();
  requestAnimationFrame(boucle);

  return {
    selectionner, cadrer, accueil, vueLieu, montrerLieu, theme,
    // mode histoire
    ambiance: (nom) => appliquerAmbiance(AMBIANCES[nom] || JOUR, nom === 'nuit'),
    viser,
    derive: (v) => { derive = v || 0; },
    etiquettes: (mode) => { filtreLieux = mode === 'toutes' || mode == null ? null : mode === 'aucune' ? [] : mode; Object.values(LBL).forEach((el) => (el._w = 0)); },
    viserSol: (cb) => { visee = cb || null; canvas.classList.toggle('visee', !!cb); canvas.classList.remove('hover'); },
    marque: (lat, lon, genre) => { poserMarque(lat, lon, genre); },
    eclat: (lat, lon) => { poserMarque(lat, lon, 'eclat'); },
    effacerMarques: () => marques.clear(),
    itineraires, effacerItineraires,
    // Tout le Hijaz dans la zone libre (cap et inclinaison en degrés).
    cadrerHijaz(cap = 0, incl = 22, duree) {
      majVue();
      const pts = [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]].map(([x, z]) => new THREE.Vector3(x, 0, z));
      cadrerPoints(pts, -cap * Math.PI / 180, incl * Math.PI / 180, 100, duree ?? 2600);
    },
    // Cadre un ensemble de points [lat, lon] dans la zone libre (cap et inclinaison en degrés, distance minimale en km).
    cadrerLatLon(points, cap, incl, duree, rMin = 0.25) {
      const pts = points.map(([la, lo]) => { const [x, z] = R.xz(la, lo); return new THREE.Vector3(x, R.sol(x, z), z); });
      cadrerPoints(pts, cap == null ? cam.theta : -cap * Math.PI / 180, incl == null ? cam.phi : incl * Math.PI / 180, rMin, duree ?? 2400);
    },
    // Cadre l'ensemble de plusieurs tracés (listes d'étapes) dans la zone libre.
    cadrerTraces(listes, cap, incl, duree) {
      const pts = listes.flatMap((et) => { const { suivi } = echantillonner(et, false); return suivi.filter((_, k) => k % 8 === 0 || k === suivi.length - 1); });
      cadrerPoints(pts, cap == null ? cam.theta : -cap * Math.PI / 180, incl == null ? cam.phi : incl * Math.PI / 180, 2, duree ?? 2400);
    },
    trajetLibre(trajet, couleur) {
      construireTrajet(trajet ? { trajet } : {});
      if (couleur) colorerTrajet(couleur);
      lieuxTrajet = [];
    },
    surligner: (id, titre) => surligner(id, titre || null),
    epoque: (i) => decor.ere.forEach((e) => (e.o.visible = e.visible(i))),
    feux: allumerFeux,
    vue: () => ({ cible: cam.cible.clone(), r: cam.r, theta: cam.theta, phi: cam.phi }),
    // Position à l'écran (pixels CSS du canevas) d'un point [lat, lon] posé sur le sol.
    projeter(lat, lon) {
      const [x, z] = R.xz(lat, lon), rc = canvas.getBoundingClientRect();
      v3.set(x, R.sol(x, z), z).project(camera);
      return { x: rc.left + (v3.x * 0.5 + 0.5) * rc.width, y: rc.top + (-v3.y * 0.5 + 0.5) * rc.height, devant: v3.z < 1 };
    },
    revenir: (v, duree) => volVers(v.cible, v.r, v.theta, v.phi, duree ?? 1400),
    altitude: (lat, lon) => R.metres(...R.xz(lat, lon)),
    zoomLieu: (id) => vueLieu(id),
    satellite: (on) => terrain.habillage(on),
    zoom: (f) => { transit = null; zoomer(f, null); },
    nord: () => { if (libre.actif) libre.lacet = 0; else volVers(cam.cible, cam.r, 0, cam.phi, 700); },
    placer: (r, theta, phi) => { cam.r = r; cam.theta = theta; cam.phi = phi; },
    rafraichirVue: () => { cleVue = ''; },
    // Missions : repères (personnes, lieux, objets), accessoires (tentes, bêtes, feux…), effets.
    mission: { ...mise, surRepere: (f) => { surRepere = f || (() => {}); } },
    apercu: () => terrain.apercu,
    // mesures de rendu (essais de performance)
    statistiques: () => ({ tuiles: terrain.tuiles(), dessins: renderer.info.render.calls, triangles: renderer.info.render.triangles, dpr }),
    emprise: () => R.meta.emprise,
    teleporter(lat, lon) {
      const [x, z] = R.xz(lat, lon), y = R.sol(x, z);
      if (libre.actif) libre.glisse = { t0: performance.now(), a: libre.pos.clone(), b: new THREE.Vector3(x, y + 0.6, z + 1.2), duree: 1600 };
      else volVers(new THREE.Vector3(x, y, z), Math.min(cam.r, 12), cam.theta, cam.phi, 1600);
    },
    vol(on) { if (on) entrerVol(); else finVol(); cleVue = ''; },
    commandeVol(nom, actif) { if (actif) libre.pad.add(nom); else libre.pad.delete(nom); },
    bataille(B, phase) {
      if (!B) { bataille.masquer(); return; }
      const pts = bataille.montrer(B, phase);
      cadrerPoints(pts, B.vue ? B.vue[0] : -0.35, B.vue ? B.vue[1] : 0.95, 0.7, 1500);
    },
  };
}
