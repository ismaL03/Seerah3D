// Mode histoire : la Sîra en chapitres interactifs, joués sur la carte 3D (data/histoire.json).
// Le joueur est un chroniqueur : à chaque étape, il retrouve ce qui s'est réellement passé.
// Un mauvais choix déclenche une conséquence imaginaire, présentée comme telle, puis un retour
// dans le temps jusqu'au moment du choix. Aucun personnage n'est représenté ; aucune musique
// (vent et effets seulement).
import { ic, remplirIcones } from './icones.js';
import { creerMissions } from './mission.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CLE = 'sira3d.histoire';
const LETTRES = ['A', 'B', 'C', 'D'];
const COULEURS_ITI = ['#4F8FD6', '#D9A13B', '#B07CC6', '#5FB59A'];
const ANNULE = Symbol('annulé');
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
const melanger = (t) => { t = [...t]; for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; } return t; };

export function creerHistoire({ D, carte, ouvrirCarte, reduit }) {
  const H = D.HISTOIRE, CH = H.chapitres, LIEUX = D.LIEUX;
  const jeu = $('#jeu'), corps = document.body;
  const evDe = (c) => D.EVENEMENTS[D.INDEX[c.evenement]];
  const livreDe = (c) => H.livres.findIndex((l) => l.chapitres.includes(c.evenement));
  // Nombre de « jeux » d'un chapitre (une lumière possible pour chacun ; une mission en compte plusieurs).
  const JEUX = ['choix', 'trouver', 'itineraire', 'ordre', 'associer', 'vraifaux', 'estimer'];
  const interactives = (c) => c.etapes.reduce((n, e) => n + (e.type === 'mission' ? e.epreuves || 0 : JEUX.includes(e.type) ? 1 : 0), 0);
  const LUM_MAX = CH.reduce((n, c) => n + interactives(c), 0);
  const couleurCat = (cat) => getComputedStyle(document.documentElement).getPropertyValue('--c-' + cat).trim() || '#C9962F';

  let actif = false, jeton = 0, etat = null, attente = null;
  const sauve = lire();
  const son = creerSon(() => sauve.son !== false);
  const voix = creerVoix(() => !!sauve.voix);
  const sable = creerSable($('#jSable'), reduit);
  const mobile = matchMedia('(pointer: coarse)').matches;
  const missions = creerMissions({
    hote: $('#jMonde'),
    ui: {
      reduit, mobile, son, ANNULE,
      dire: (t, g) => dire(t, g),
      proposer: (q, o, t, g, i) => proposer(q, o, t, g, i),
      boutonOption: (i) => boutonOption(i),
      succes: (el) => succes(el),
      gagnerLumiere: (el) => gagnerLumiere(el),
      consequence: (o, ok, av) => consequence(o, ok, av),
      masquerDialogue: () => masquerDialogue(),
      pause,
      erreur: () => { if (etat) etat.erreurs++; },
      // la scène à la première personne remplace la carte (rendu de la carte suspendu)
      entrerMonde(on) { corps.classList.toggle('jeu-monde', on); carte.pause(on); if (on) { cinema(false); disposition(null); } },
    },
  });

  function lire() {
    try { return Object.assign({ faits: {}, son: true }, JSON.parse(localStorage.getItem(CLE)) || {}); } catch { return { faits: {}, son: true }; }
  }
  function ecrire() { try { localStorage.setItem(CLE, JSON.stringify(sauve)); } catch { /* stockage indisponible */ } }
  const totalLumieres = () => Object.values(sauve.faits).reduce((n, f) => n + (f.lumieres || 0), 0);
  const lumAffichees = () => totalLumieres() - (etat && sauve.faits[etat.c.evenement] ? sauve.faits[etat.c.evenement].lumieres || 0 : 0) + (etat ? etat.lumieres : 0);
  const totalEtoiles = () => Object.values(sauve.faits).reduce((n, f) => n + (f.etoiles || 0), 0);

  // ---------- entrée, sortie ----------
  function entrer() {
    if (!actif) {
      actif = true; jeu.hidden = false; corps.classList.add('histoire');
      carte.rafraichirVue();
    }
  }
  function nettoyerCarte() {
    carte.bataille(null); carte.trajetLibre(null); carte.effacerItineraires(); carte.effacerMarques();
    carte.feux(0, 0, 0); carte.viserSol(null); carte.derive(0); carte.surligner(null);
  }
  function toutMasquer() {
    missions.arreter();
    ['#jTitre', '#jHud', '#jChapCarte', '#jConsigne', '#jDialogue', '#jConseq', '#jRetour', '#jBilan', '#jPanneau', '#jMini'].forEach((s) => ($(s).hidden = true));
    corps.classList.remove('tempete', 'retour', 'jeu-options', 'jeu-consigne'); cinema(false); attente = null;
  }
  function quitter(idEv) {
    jeton++;
    const ev = idEv || (etat ? etat.c.evenement : null);
    toutMasquer(); nettoyerCarte(); sable.mode(null); son.vent(false); voix.taire();
    carte.etiquettes('toutes');
    actif = false; jeu.hidden = true; corps.classList.remove('histoire');
    carte.rafraichirVue();
    ouvrirCarte(ev);
  }
  const cinema = (on) => jeu.classList.toggle('cinema', !!on && !reduit);
  // Mise en page de l'étape : la caméra se centre dans la partie de l'écran laissée visible.
  function disposition(genre) {
    corps.classList.toggle('jeu-options', genre === 'options');
    corps.classList.toggle('jeu-consigne', genre === 'consigne');
    carte.rafraichirVue();
  }

  // ---------- écran titre ----------
  function accueil() {
    jeton++; entrer(); toutMasquer(); nettoyerCarte();
    carte.ambiance('aube'); carte.etiquettes('aucune'); carte.epoque(0);
    carte.viser('makkah', 15, 25, 66, reduit ? 0 : 4200); carte.derive(0.03);
    sable.mode('poussiere');
    $('#jtAr').textContent = H.titre_ar; $('#jtTitre').textContent = H.titre;
    $('#jtSous').textContent = `${H.sous_titre} · ${CH.length} chapitres`;
    const suivant = CH.findIndex((c) => !sauve.faits[c.evenement]), commence = Object.keys(sauve.faits).length > 0;
    const actions = [];
    if (commence && suivant >= 0) actions.push(`<button class="j-btn or" data-a="suite">${ic('play')}Continuer<small>· chapitre ${suivant + 1}</small></button>`);
    else actions.push(`<button class="j-btn or" data-a="debut">${ic('play')}${commence ? 'Rejouer depuis le début' : 'Commencer'}</button>`);
    actions.push(`<button class="j-btn" data-a="chapitres">Chapitres</button>`);
    if (commence) actions.push(`<button class="j-btn" data-a="carnet">${ic('book')}Carnet</button>`);
    actions.push(`<button class="j-btn fantome" data-a="carte">Explorer la carte</button>`);
    $('#jtActions').innerHTML = actions.join('');
    const st = $('#jtStats');
    st.hidden = !commence;
    if (commence) st.innerHTML = `<span><b>${Object.keys(sauve.faits).length}</b> chapitres sur ${CH.length}</span><span><b>★ ${totalEtoiles()}</b> étoiles</span><span><b>✦ ${totalLumieres()}</b> lumières sur ${LUM_MAX}</span>`;
    $('#jtActions').querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => {
      son.reveil(); son.vent(true);
      const a = b.dataset.a;
      if (a === 'suite') jouer(suivant);
      else if (a === 'debut') jouer(0);
      else if (a === 'chapitres') panneauChapitres();
      else if (a === 'carnet') panneauCarnet();
      else quitter();
    }));
    $('#jTitre').hidden = false;
  }

  // ---------- HUD ----------
  $('#jFil').innerHTML = CH.map((c, i) => `<i class="${i && livreDe(c) !== livreDe(CH[i - 1]) ? 'saut' : ''}"></i>`).join('');
  function majHud() {
    const c = etat.c, l = H.livres[livreDe(c)];
    $('#jLivre').textContent = `${l.titre} · ${etat.i + 1}/${CH.length}`;
    $('#jChap').textContent = c.titre;
    $('#jLum').textContent = lumAffichees();
    document.querySelectorAll('#jFil i').forEach((b, k) => { b.classList.toggle('fait', !!sauve.faits[CH[k].evenement]); b.classList.toggle('actuel', k === etat.i); });
    $('#jHud').hidden = false;
  }
  function majSon() {
    $('#jSonBtn').innerHTML = ic(sauve.son !== false ? 'son' : 'muet');
    $('#jSonBtn').setAttribute('aria-label', sauve.son !== false ? 'Couper le son' : 'Activer le son');
  }
  $('#jSonBtn').onclick = () => { sauve.son = sauve.son === false; ecrire(); majSon(); son.reveil(); son.vent(sauve.son); };
  function majVoix() { $('#jVoixBtn').setAttribute('aria-pressed', !!sauve.voix); $('#jVoixBtn').title = sauve.voix ? 'Lecture à voix haute : activée' : 'Lecture à voix haute'; }
  $('#jVoixBtn').hidden = !voix.dispo;
  $('#jVoixBtn').onclick = () => { sauve.voix = !sauve.voix; ecrire(); majVoix(); if (!sauve.voix) voix.taire(); else if (!$('#jDialogue').hidden) voix.dire($('#jdTexte').textContent); };
  majVoix();
  $('#jMenuBtn').onclick = () => panneauMenu();
  $('#jCarnetBtn').onclick = () => panneauCarnet();
  majSon(); remplirIcones(jeu);

  // Une lumière gagnée vole jusqu'au compteur.
  function gagnerLumiere(depuis) {
    etat.lumieres++;
    const r = depuis ? depuis.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    const cible = $('#jLumBloc').getBoundingClientRect(), s = document.createElement('span');
    s.textContent = '✦'; $('#jVol').appendChild(s);
    const x0 = r.left + r.width / 2, y0 = r.top + r.height / 2;
    s.style.transform = `translate(${x0}px,${y0}px) scale(1.6)`;
    sable.eclat(x0, y0);
    requestAnimationFrame(() => requestAnimationFrame(() => { s.style.transform = `translate(${cible.left + 12}px,${cible.top + 10}px) scale(.8)`; }));
    setTimeout(() => { s.remove(); $('#jLum').textContent = lumAffichees(); $('#jLumBloc').classList.remove('gagne'); void $('#jLumBloc').offsetWidth; $('#jLumBloc').classList.add('gagne'); }, reduit ? 0 : 900);
  }

  // ---------- attentes (clic, clavier) ----------
  function attendre(type, extra = {}) { return new Promise((ok) => { attente = { type, ok, ...extra }; }); }
  function resoudre(v) { const a = attente; attente = null; if (a) a.ok(v); }
  function avancer() {
    if (!attente) return;
    if (attente.frappe && !attente.frappe.fini) { attente.frappe.saut = true; return; }
    if (attente.type !== 'suite') return;
    son.page(); resoudre();
  }
  $('#jdSuite').onclick = (e) => { e.stopPropagation(); avancer(); };
  $('#jDialogue').addEventListener('click', (e) => { if (!e.target.closest('.j-opt')) avancer(); });
  $('#jdOptions').addEventListener('click', (e) => {
    const b = e.target.closest('.j-opt'); if (!b || b.disabled || !attente || attente.type !== 'option') return;
    resoudre(+b.dataset.i);
  });
  $('#jChapCarte').onclick = () => { if (attente && attente.type === 'carte') resoudre(); };
  $('#jqRetour').onclick = () => { if (attente && attente.type === 'retour') resoudre(); };
  addEventListener('keydown', (e) => {
    if (!actif || e.ctrlKey || e.metaKey || e.altKey || e.target.tagName === 'INPUT') return;
    const k = e.key;
    if (k === 'Escape') { e.preventDefault(); if (!$('#jPanneau').hidden && etat) { $('#jPanneau').hidden = true; missions.pause(false); } else if (etat && $('#jTitre').hidden) panneauMenu(); return; }
    if (!$('#jPanneau').hidden) return;
    const valider = k === ' ' || k === 'Enter' || (corps.classList.contains('jeu-monde') && (k === 'e' || k === 'E'));
    if (!attente) return;
    if (attente.type === 'vf') {
      if ('vV1'.includes(k)) { e.preventDefault(); resoudre(true); } else if ('fF2'.includes(k)) { e.preventDefault(); resoudre(false); }
      return;
    }
    if (attente.type === 'mini' && k === 'Enter') { const b = $('#jMini [data-a="ok"]'); if (b && !b.disabled) { e.preventDefault(); b.click(); } return; }
    if (attente.type === 'option') {
      const n = '1234'.indexOf(k) >= 0 ? '1234'.indexOf(k) : 'abcd'.indexOf(k.toLowerCase());
      const b = n >= 0 && document.querySelector(`#jdOptions .j-opt[data-i="${n}"]`);
      if (b && !b.disabled) { e.preventDefault(); resoudre(n); }
    } else if (valider && ['suite', 'frappe', 'carte', 'retour', 'bilan'].includes(attente.type)) {
      e.preventDefault();
      if (attente.type === 'suite' || attente.type === 'frappe') avancer(); else if (attente.type === 'bilan') $('#jBilan [data-a="suivant"]')?.click(); else resoudre();
    }
  });

  // ---------- dialogue ----------
  // Lieu affiché dans le dialogue : celui de la vue de l'étape, sinon le dernier lieu montré.
  function tag(e) {
    const ev = etat.ev;
    if (e && e.vue && e.vue.lieu) etat.lieu = e.vue.lieu;
    const L = LIEUX[etat.lieu || ev.lieu];
    return { lieu: L ? L.nom : '', date: ev.annee_hegire ? `An ${ev.annee_hegire} H · ${ev.annee_ap_jc}` : ev.annee_ap_jc };
  }
  function afficherDialogue(t) {
    $('#jdLieu').textContent = t.lieu || ''; $('#jdDate').textContent = t.date || '';
    $('#jDialogue').hidden = false;
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  }
  const masquerDialogue = () => { $('#jDialogue').hidden = true; };
  // Machine à écrire : le texte complet occupe sa place dès le début (pas de saut de mise en page).
  function taper(texte, question, frappe) {
    const el = $('#jdTexte');
    el.className = 'j-texte' + (question ? ' question' : '');
    if (reduit || frappe.instant) { el.textContent = texte; frappe.fini = true; return Promise.resolve(); }
    el.innerHTML = `<span class="vu"></span><span class="cache"></span>`;
    const vu = el.firstChild, cache = el.lastChild, t0 = performance.now();
    return new Promise((ok) => {
      function pas(now) {
        const n = frappe.saut ? texte.length : Math.min(texte.length, Math.floor((now - t0) / 1000 * 62));
        vu.textContent = texte.slice(0, n); cache.textContent = texte.slice(n);
        if (n < texte.length) requestAnimationFrame(pas); else { frappe.fini = true; ok(); }
      }
      requestAnimationFrame(pas);
    });
  }
  async function dire(texte, t) {
    afficherDialogue(t);
    $('#jdOptions').innerHTML = ''; $('#jdSuite').hidden = true;
    const frappe = { fini: false, saut: false };
    const fin = attendre('suite', { frappe });
    voix.dire(texte);
    await taper(texte, false, frappe);
    $('#jdSuite').hidden = false;
    return fin;
  }
  async function proposer(question, options, tentes, t, instant) {
    afficherDialogue(t);
    $('#jdOptions').innerHTML = ''; $('#jdSuite').hidden = true;
    const frappe = { fini: false, saut: false, instant };
    attente = { type: 'frappe', frappe };
    voix.dire(question + ' ' + options.map((o, i) => `${LETTRES[i]} : ${o.texte}.`).join(' '));
    await taper(question, true, frappe);
    $('#jdOptions').innerHTML = options.map((o, i) => `<button class="j-opt" data-i="${i}" style="--k:${i}${o.couleur ? `;--oc:${o.couleur}` : ''}" ${tentes.has(i) ? 'disabled' : ''}><span class="lettre">${LETTRES[i]}</span><span>${esc(o.texte)}</span></button>`).join('');
    return attendre('option');
  }
  const boutonOption = (i) => document.querySelector(`#jdOptions .j-opt[data-i="${i}"]`);

  // ---------- caméra, lieux ----------
  const position = (x) => (Array.isArray(x) ? x : LIEUX[x] ? [LIEUX[x].lat, LIEUX[x].lon] : D.ETAPES[x] ? [D.ETAPES[x].lat, D.ETAPES[x].lon] : null);
  function vue(v) {
    if (!v) return;
    if (v.hijaz) carte.cadrerHijaz(v.cap, v.incl, reduit ? 0 : (v.duree ?? 2600));
    else carte.viser(v.lieu || v.point, v.r, v.cap, v.incl, reduit ? 0 : (v.duree ?? 2600));
  }
  function distanceKm([a, b], [c, d]) {
    const R = 6371, r = Math.PI / 180, dl = (c - a) * r, dn = (d - b) * r;
    const h = Math.sin(dl / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dn / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function direction([a, b], [c, d]) {
    const y = Math.sin((d - b) * Math.PI / 180) * Math.cos(c * Math.PI / 180);
    const x = Math.cos(a * Math.PI / 180) * Math.sin(c * Math.PI / 180) - Math.sin(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.cos((d - b) * Math.PI / 180);
    const cap = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    return ['au nord', 'au nord-est', "à l'est", 'au sud-est', 'au sud', 'au sud-ouest', "à l'ouest", 'au nord-ouest'][Math.round(cap / 45) % 8];
  }
  const formatKm = (d) => (d < 1 ? `${Math.round(d * 1000 / 10) * 10} m` : `${d < 10 ? d.toFixed(1).replace('.', ',') : Math.round(d)} km`);

  // ---------- effets ----------
  function filCasse(on) { $('#jFil').classList.toggle('casse', on); }
  async function consequence(o, ok, avantRetour) {
    const doux = o.effet === 'doux';
    son.tempete(doux); filCasse(true);
    if (!doux) { corps.classList.add('tempete'); sable.mode('tempete'); }
    masquerDialogue();
    await pause(reduit ? 100 : doux ? 350 : 1400); ok();
    $('#jqTitre').textContent = o.titre || 'Le fil se brouille';
    $('#jqTexte').textContent = o.consequence || '';
    $('#jqIndice').textContent = o.indice || '';
    $('#jConseq').hidden = false;
    voix.dire(`Ce n'est pas ce qui s'est passé. ${o.titre || ''}. Scénario imaginaire : ${o.consequence || ''} ${o.indice ? 'Indice : ' + o.indice : ''}`);
    await attendre('retour'); ok();
    $('#jConseq').hidden = true;
    // retour dans le temps
    corps.classList.remove('tempete'); corps.classList.add('retour');
    sable.mode(reduit ? null : 'retour'); son.retour();
    $('#jRetour').hidden = false;
    if (avantRetour) avantRetour();
    await pause(reduit ? 150 : 1500); ok();
    $('#jRetour').hidden = true; corps.classList.remove('retour'); sable.mode(null); filCasse(false);
  }
  function succes(el) {
    son.lumiere();
    const r = el ? el.getBoundingClientRect() : null;
    sable.eclat(r ? r.left + r.width / 2 : innerWidth / 2, r ? r.top + r.height / 2 : innerHeight / 2);
  }

  // Un mauvais choix n'est pas signalé tout de suite : l'histoire continue un peu sur cette voie.
  async function poursuivre(o, e, ok) {
    for (const x of o.suite || []) {
      const t = typeof x === 'string' ? { texte: x } : x;
      if (t.vue) { cinema(true); disposition(null); vue(t.vue); }
      if (t.ambiance) carte.ambiance(t.ambiance);
      await dire(t.texte, tag(e)); ok();
    }
  }
  const enTete = (genre, consigne) => `<div class="j-mini-tete"><small>${genre}</small><b>${esc(consigne)}</b></div>`;
  function mini(html) { const m = $('#jMini'); m.innerHTML = html; m.hidden = false; remplirIcones(m); return m; }
  const finMini = () => { $('#jMini').hidden = true; $('#jMini').innerHTML = ''; };

  // ---------- étapes ----------
  const ETAPES = {
    async recit(e, ok) {
      if (e.ambiance) carte.ambiance(e.ambiance);
      if ('feux' in e) { const f = e.feux; if (f) carte.feux(...position(f.lieu || f.point), f.n, f.rayon); else carte.feux(0, 0, 0); }
      if (e.epoque) carte.epoque(etat.evIndex);
      cinema(true); disposition(null);
      vue(e.vue);
      const ids = e.etiquettes ?? (e.vue && e.vue.lieu ? [e.vue.lieu] : []);
      carte.etiquettes(ids);
      carte.surligner(e.vue && ids.includes(e.vue.lieu) ? e.vue.lieu : null);
      await dire(e.texte, tag(e)); ok();
    },
    async choix(e, ok) {
      cinema(false); disposition(null);
      const ordre = e._ordre || (e._ordre = melanger(e.options.map((_, k) => k)));
      const tentes = new Set();
      for (;;) {
        const i = await proposer(e.question, ordre.map((k) => e.options[k]), tentes, tag(e), tentes.size > 0); ok();
        const o = e.options[ordre[i]];
        if (o.juste) {
          const b = boutonOption(i); b.classList.add('juste');
          document.querySelectorAll('#jdOptions .j-opt').forEach((x) => { if (x !== b) x.disabled = true; });
          succes(b); if (!tentes.size) gagnerLumiere(b);
          await pause(reduit ? 0 : 900); ok();
          await dire(o.reponse, tag(e)); ok();
          return;
        }
        tentes.add(i); etat.erreurs++;
        await poursuivre(o, e, ok);
        await consequence(o, ok); ok();
      }
    },
    async trouver(e, ok) {
      cinema(false); masquerDialogue(); disposition('consigne');
      vue(e.vue); carte.etiquettes('aucune'); carte.surligner(null); carte.trajetLibre(null); // rien ne doit trahir la réponse
      const cible = position(e.cible);
      $('#jcQ').textContent = e.consigne; const retour = $('#jcRetour'); retour.textContent = ''; retour.className = '';
      $('#jIndiceBtn').hidden = !e.indice;
      $('#jIndiceBtn').onclick = () => { retour.textContent = e.indice; retour.className = ''; };
      $('#jConsigne').hidden = false;
      voix.dire(e.consigne);
      let essais = 0, dernier = 0;
      for (;;) {
        const p = await new Promise((r) => carte.viserSol(r)); ok();
        const t = performance.now(); if (t - dernier < 450) continue; dernier = t;
        const d = distanceKm([p.lat, p.lon], cible);
        if (d <= e.rayon) break;
        essais++;
        carte.marque(p.lat, p.lon, 'essai'); son.erreur();
        filCasse(true); setTimeout(() => filCasse(false), 700);
        retour.className = 'loin';
        retour.textContent = `Pas tout à fait : vous êtes à ${formatKm(d)}. Cherchez plus ${direction([p.lat, p.lon], cible)}.` + (essais >= 3 ? ' Le cercle doré vous montre l\'endroit.' : '');
        if (essais === 3) carte.marque(cible[0], cible[1], 'indice');
      }
      carte.viserSol(null); carte.effacerMarques();
      carte.marque(cible[0], cible[1], 'juste'); carte.eclat(cible[0], cible[1]);
      if (typeof e.cible === 'string') { carte.etiquettes([e.cible]); carte.surligner(e.cible); }
      succes($('#jConsigne'));
      if (essais <= 1) gagnerLumiere($('#jConsigne')); else etat.erreurs++;
      retour.className = ''; retour.textContent = essais ? `Trouvé, après ${essais + 1} essais.` : 'Trouvé du premier coup !';
      await pause(reduit ? 0 : 1100); ok();
      $('#jConsigne').hidden = true; disposition(null);
      await dire(e.reussite, tag(typeof e.cible === 'string' ? { vue: { lieu: e.cible } } : null)); ok();
    },
    async itineraire(e, ok) {
      cinema(false); disposition('options');
      const ordre = e._ordre || (e._ordre = melanger(e.options.map((_, k) => k)));
      const liste = ordre.map((k, i) => ({ ...e.options[k], lettre: LETTRES[i], couleur: COULEURS_ITI[i], texte: e.options[k].nom }));
      const bouts = [...new Set(liste.flatMap((o) => [o.etapes[0], o.etapes[o.etapes.length - 1]]).filter((x) => typeof x === 'string' && LIEUX[x]))];
      carte.etiquettes(bouts); carte.surligner(null);
      carte.cadrerTraces(liste.map((o) => o.etapes), e.vue ? e.vue.cap : 0, e.vue ? e.vue.incl : 25, reduit ? 0 : 2600);
      const tentes = new Set();
      for (;;) {
        carte.trajetLibre(null);
        carte.itineraires(liste.map((o, i) => ({ ...o, ancre: 0.35 + i * 0.15 })).filter((_, i) => !tentes.has(i)));
        const i = await proposer(e.question, liste, tentes, tag(e), tentes.size > 0); ok();
        const o = liste[i];
        carte.effacerItineraires();
        if (o.juste) {
          const b = boutonOption(i); b.classList.add('juste');
          carte.trajetLibre({ type: 'caravane', etapes: o.etapes }, '#E6BE6A');
          disposition(null);
          succes(b); if (!tentes.size) gagnerLumiere(b);
          await pause(reduit ? 0 : 900); ok();
          await dire(o.reponse, tag(e)); ok();
          return;
        }
        tentes.add(i); etat.erreurs++;
        carte.trajetLibre({ type: o.effet === 'eclaireurs' ? 'poursuite' : 'caravane', etapes: o.etapes }, '#D9694E');
        masquerDialogue();
        await pause(reduit ? 300 : 2800); ok();
        await consequence(o, ok, () => carte.trajetLibre(null)); ok();
      }
    },
    async trajet(e, ok) {
      if (e.ambiance) carte.ambiance(e.ambiance);
      cinema(true); disposition(null);
      const ev = etat.ev;
      etat.lieu = ev.lieu;
      carte.selectionner(ev, etat.evIndex, couleurCat(ev.categorie));
      carte.cadrer(ev, reduit ? 0 : 2800);
      carte.etiquettes([...new Set([ev.lieu, ...(ev.trajet ? ev.trajet.etapes.filter((x) => typeof x === 'string' && LIEUX[x]) : [])])]);
      await dire(e.texte, tag(e)); ok();
    },
    // Mission à la première personne (data/missions/<id>.json)
    async mission(e, ok) {
      cinema(false); disposition(null); masquerDialogue();
      await missions.jouer(e.mission, ok); ok();
      masquerDialogue();
    },
    // Remettre dans l'ordre (des étapes, des lieux : le tracé se dessine sur la carte au fur et à mesure)
    async ordre(e, ok) {
      cinema(false); masquerDialogue(); disposition('options');
      if (e.vue) vue(e.vue);
      carte.etiquettes('aucune'); carte.trajetLibre(null); carte.surligner(null);
      const items = e.elements.map((x, k) => ({ ...(typeof x === 'string' ? { texte: x } : x), k }));
      const ordre = e._ordre || (e._ordre = (() => { let o; do { o = melanger(items.map((x) => x.k)); } while (o.every((k, i) => k === i)); return o; })());
      voix.dire(e.consigne);
      for (let essai = 0; ; essai++) {
        const place = [];
        const m = mini(enTete('Remettre dans l\'ordre', e.consigne) + `<ol class="j-cases">${items.map((_, i) => `<li data-i="${i}"><span>${i + 1}</span><em></em></li>`).join('')}</ol>
          <div class="j-cartes">${ordre.map((k) => `<button class="j-carte" data-k="${k}">${esc(items[k].texte)}</button>`).join('')}</div>
          <div class="j-mini-pied"><small class="j-mini-retour"></small><button class="j-btn petit fantome" data-a="raz">Recommencer</button><button class="j-btn petit or" data-a="ok" disabled>Valider</button></div>`);
        const maj = () => {
          m.querySelectorAll('.j-cases li').forEach((li, i) => { li.classList.toggle('pris', i < place.length); li.querySelector('em').textContent = i < place.length ? items[place[i]].texte : ''; });
          m.querySelectorAll('.j-carte').forEach((b) => (b.disabled = place.includes(+b.dataset.k)));
          m.querySelector('[data-a="ok"]').disabled = place.length < items.length;
          const lieux = place.map((k) => items[k].lieu).filter(Boolean);
          if (items.some((x) => x.lieu)) { carte.etiquettes(lieux); carte.trajetLibre(lieux.length > 1 ? { type: 'caravane', etapes: lieux } : null, '#E6BE6A'); }
        };
        m.querySelectorAll('.j-carte').forEach((b) => (b.onclick = () => { if (!place.includes(+b.dataset.k)) { place.push(+b.dataset.k); son.page(); maj(); } }));
        m.querySelectorAll('.j-cases li').forEach((li) => (li.onclick = () => { const i = +li.dataset.i; if (i < place.length) { place.splice(i); maj(); } }));
        m.querySelector('[data-a="raz"]').onclick = () => { place.length = 0; maj(); };
        m.querySelector('[data-a="ok"]').onclick = () => resoudre();
        maj();
        await attendre('mini'); ok();
        const faux = place.findIndex((k, i) => k !== i);
        if (faux < 0) {
          m.querySelectorAll('.j-cases li').forEach((li) => li.classList.add('juste'));
          succes(m); if (!essai) gagnerLumiere(m);
          await pause(reduit ? 0 : 1100); ok();
          finMini(); disposition(null);
          await dire(e.reponse, tag(e)); ok();
          return;
        }
        etat.erreurs++;
        m.querySelectorAll('.j-cases li').forEach((li, i) => li.classList.toggle('faux', i >= faux));
        m.querySelector('.j-mini-retour').textContent = faux === 0 ? 'Dès la première case, le fil se brouille…' : `Les ${faux} première${faux > 1 ? 's' : ''} case${faux > 1 ? 's sont justes' : ' est juste'}… puis le fil se brouille.`;
        await pause(reduit ? 0 : 1600); ok();
        finMini();
        if (e.lieux_faux !== false && items.some((x) => x.lieu)) carte.trajetLibre({ type: 'caravane', etapes: place.map((k) => items[k].lieu).filter(Boolean) }, '#D9694E');
        await consequence({ titre: e.titre_erreur || 'Le fil s\'emmêle', consequence: e.consequence || 'Dans cet ordre, l\'histoire ne tient pas debout.', indice: e.indice, effet: e.effet }, ok, () => carte.trajetLibre(null)); ok();
        disposition('options');
      }
    },
    // Associer deux à deux (cliquer à gauche puis à droite)
    async associer(e, ok) {
      cinema(false); masquerDialogue(); disposition('options');
      if (e.vue) vue(e.vue);
      const droite = e._ordre || (e._ordre = melanger(e.paires.map((_, k) => k)));
      const m = mini(enTete('Associer', e.consigne) + `<div class="j-paires"><div>${e.paires.map((p, k) => `<button class="j-carte g" data-k="${k}">${esc(p[0])}</button>`).join('')}</div>
        <div>${droite.map((k) => `<button class="j-carte d" data-k="${k}">${esc(e.paires[k][1])}</button>`).join('')}</div></div><div class="j-mini-pied"><small class="j-mini-retour"></small></div>`);
      voix.dire(e.consigne);
      let g = null, d = null, faits = 0, fautes = 0; const montres = [];
      carte.etiquettes('aucune'); carte.surligner(null);
      const essayer = () => {
        if (g == null || d == null) return;
        const bg = m.querySelector(`.g[data-k="${g}"]`), bd = m.querySelector(`.d[data-k="${d}"]`);
        if (g === d) {
          [bg, bd].forEach((b) => { b.classList.remove('choisi'); b.classList.add('lie'); b.disabled = true; b.style.setProperty('--h', `${(faits * 67) % 360}`); });
          faits++; son.lumiere();
          if (e.lieux && e.lieux[g]) { montres.push(e.lieux[g]); carte.etiquettes(montres); carte.surligner(e.lieux[g]); }
          if (faits === e.paires.length) resoudre();
        } else {
          fautes++; etat.erreurs++; son.erreur();
          [bg, bd].forEach((b) => { b.classList.remove('choisi'); b.classList.add('non'); setTimeout(() => b.classList.remove('non'), 600); });
          m.querySelector('.j-mini-retour').textContent = e.paires[g][2] || 'Ces deux-là ne vont pas ensemble.';
        }
        g = d = null;
      };
      m.querySelectorAll('.j-carte').forEach((b) => (b.onclick = () => {
        const k = +b.dataset.k;
        if (b.classList.contains('g')) { m.querySelectorAll('.g').forEach((x) => x.classList.remove('choisi')); g = k; } else { m.querySelectorAll('.d').forEach((x) => x.classList.remove('choisi')); d = k; }
        b.classList.add('choisi'); essayer();
      }));
      await attendre('mini'); ok();
      succes(m); if (!fautes) gagnerLumiere(m);
      await pause(reduit ? 0 : 1000); ok();
      finMini(); disposition(null);
      await dire(e.reponse, tag(e)); ok();
    },
    // Vrai ou faux : une série d'affirmations, chacune expliquée
    async vraifaux(e, ok) {
      cinema(false); masquerDialogue(); disposition('options');
      if (e.vue) vue(e.vue);
      let fautes = 0;
      for (let k = 0; k < e.affirmations.length; k++) {
        const a = e.affirmations[k];
        const m = mini(enTete(`Vrai ou faux · ${k + 1} / ${e.affirmations.length}`, e.consigne || 'Vrai ou faux ?') + `<p class="j-affirmation">${esc(a.texte)}</p>
          <div class="j-vf"><button class="j-btn" data-v="1">Vrai<kbd>V</kbd></button><button class="j-btn" data-v="0">Faux<kbd>F</kbd></button></div><p class="j-explication" hidden></p>
          <div class="j-mini-pied"><button class="j-suite" data-a="suite" hidden>Continuer<kbd>Espace</kbd></button></div>`);
        voix.dire(a.texte);
        const v = await new Promise((r) => {
          m.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => r(b.dataset.v === '1')));
          attente = { type: 'vf', ok: r };
        }); ok(); attente = null;
        const juste = v === !!a.vrai, b = m.querySelector(`[data-v="${v ? 1 : 0}"]`);
        m.querySelectorAll('[data-v]').forEach((x) => (x.disabled = true));
        b.classList.add(juste ? 'juste' : 'non');
        if (!juste) { fautes++; etat.erreurs++; son.erreur(); filCasse(true); setTimeout(() => filCasse(false), 700); } else son.lumiere();
        const ex = m.querySelector('.j-explication'); ex.hidden = false;
        ex.innerHTML = `<b>${a.vrai ? 'Vrai' : 'Faux'}.</b> ${esc(a.explication || '')}`;
        voix.dire(`${a.vrai ? 'Vrai' : 'Faux'}. ${a.explication || ''}`);
        const sb = m.querySelector('[data-a="suite"]'); sb.hidden = false;
        await new Promise((r) => { sb.onclick = () => r(); attente = { type: 'suite', ok: r }; }); ok();
      }
      succes($('#jMini')); if (!fautes) gagnerLumiere($('#jMini'));
      finMini(); disposition(null);
      if (e.reponse) { await dire(e.reponse, tag(e)); ok(); }
    },
    // Estimer une distance, une durée, un nombre (curseur), avec une marge
    async estimer(e, ok) {
      cinema(false); masquerDialogue(); disposition('options');
      if (e.vue) vue(e.vue);
      if (e.trace) { carte.trajetLibre({ type: 'caravane', etapes: e.trace }, '#E6BE6A'); carte.etiquettes(e.trace.filter((x) => typeof x === 'string' && LIEUX[x])); }
      const milieu = Math.round((e.min + e.max) / 2 / (e.pas || 1)) * (e.pas || 1);
      for (let essai = 0; ; essai++) {
        const m = mini(enTete('Estimer', e.question) + `<div class="j-estime"><output>${milieu}</output><span>${esc(e.unite || '')}</span></div>
          <input class="j-curseur" type="range" min="${e.min}" max="${e.max}" step="${e.pas || 1}" value="${milieu}" aria-label="${esc(e.question)}">
          <div class="j-bornes"><span>${e.min} ${esc(e.unite || '')}</span><span>${e.max} ${esc(e.unite || '')}</span></div>
          <div class="j-mini-pied"><small class="j-mini-retour"></small><button class="j-btn petit or" data-a="ok">Valider</button></div>`);
        voix.dire(e.question);
        const cur = m.querySelector('input'), out = m.querySelector('output');
        cur.oninput = () => { out.textContent = cur.value; };
        m.querySelector('[data-a="ok"]').onclick = () => resoudre(+cur.value);
        cur.focus();
        const v = await attendre('mini'); ok();
        const ecart = v - e.juste;
        if (Math.abs(ecart) <= e.tolerance) {
          succes(m); if (!essai) gagnerLumiere(m);
          m.querySelector('.j-mini-retour').textContent = `Bonne estimation : environ ${e.juste} ${e.unite || ''}.`;
          await pause(reduit ? 0 : 1100); ok();
          finMini(); disposition(null);
          await dire(e.reponse, tag(e)); ok();
          return;
        }
        etat.erreurs++; son.erreur(); filCasse(true); setTimeout(() => filCasse(false), 700);
        m.querySelector('.j-mini-retour').textContent = ecart < 0 ? `C'est davantage. ${e.indice_plus || ''}` : `C'est moins. ${e.indice_moins || ''}`;
        m.querySelector('.j-mini-retour').className = 'j-mini-retour loin';
        await pause(reduit ? 0 : 1800); ok();
      }
    },
    async bataille(e, ok) {
      cinema(true); disposition(null);
      const B = D.BATAILLES[etat.ev.id], P = B.phases[e.phase];
      etat.lieu = etat.ev.lieu;
      carte.trajetLibre(null); carte.etiquettes([]); carte.surligner(null);
      carte.bataille(B, e.phase);
      await dire(e.texte || P.texte, { lieu: P.titre, date: `Étape ${e.phase + 1} sur ${B.phases.length}` }); ok();
    },
  };

  // ---------- chapitre ----------
  async function jouer(i, depuis = 0) {
    const j = ++jeton, ok = () => { if (j !== jeton) throw ANNULE; };
    entrer(); toutMasquer(); nettoyerCarte(); sable.mode(null);
    const c = CH[i], ev = evDe(c);
    etat = { i, c, ev, evIndex: D.INDEX[c.evenement], erreurs: 0, lumieres: 0 };
    sauve.dernier = i; ecrire();
    carte.ambiance(c.ambiance || 'jour'); carte.epoque(Math.max(0, etat.evIndex - 1));
    carte.etiquettes('aucune');
    majHud();
    try {
      // carte de chapitre (la caméra rejoint la première vue pendant ce temps)
      const l = H.livres[livreDe(c)];
      $('#jcLivre').textContent = `${l.titre} · Chapitre ${i + 1}`;
      $('#jcAr').textContent = c.titre_ar; $('#jcTitre').textContent = c.titre;
      $('#jcDate').textContent = `${ev.date} · ${ev.annee_ap_jc} · ${LIEUX[ev.lieu].nom}`;
      const premiere = c.etapes.find((e) => e.vue);
      if (premiere) vue({ ...premiere.vue, duree: 3200 });
      $('#jChapCarte').hidden = false; son.chapitre();
      await Promise.race([attendre('carte'), pause(reduit ? 1500 : 4200)]); ok();
      attente = null; $('#jChapCarte').hidden = true;
      for (let k = depuis; k < c.etapes.length; k++) {
        etat.k = k; carte.effacerMarques();
        await ETAPES[c.etapes[k].type](c.etapes[k], ok); ok();
      }
      await bilan(ok);
    } catch (err) { if (err !== ANNULE) console.error(err); }
  }

  async function bilan(ok) {
    const { c, ev, i } = etat, max = interactives(c);
    masquerDialogue(); cinema(false);
    const etoiles = etat.erreurs === 0 ? 3 : etat.erreurs <= 2 ? 2 : 1;
    const avant = sauve.faits[c.evenement];
    sauve.faits[c.evenement] = { etoiles: Math.max(etoiles, avant ? avant.etoiles : 0), lumieres: Math.max(etat.lumieres, avant ? avant.lumieres : 0) };
    etat.lumieres = sauve.faits[c.evenement].lumieres; ecrire(); majHud();
    const derniere = i === CH.length - 1, suivant = CH[i + 1];
    const src = (c.sources || []).map((s) => {
      const o = D.OUVRAGES[s.ouvrage] || { titre: s.ouvrage };
      return `<li><b>${esc(o.titre)}</b>${s.passage ? ` · ${esc(s.passage)}` : ''} · ${s.page != null ? 'p. ' + esc(s.page) : '<span class="manque">page à compléter</span>'}</li>`;
    }).join('');
    const div = (ev.divergences || []).map((d) => `<li><b>${esc(d.sujet)} :</b> ${esc(d.texte)}</li>`).join('');
    $('#jBilan').innerHTML = `<small class="sur">Chapitre ${i + 1} terminé</small>
      <div class="j-ar" lang="ar">${esc(c.titre_ar)}</div><h3>${esc(c.titre)}</h3>
      <div class="j-etoiles">${[0, 1, 2].map((k) => `<span class="${k < etoiles ? 'on' : ''}" style="--k:${k}">★</span>`).join('')}</div>
      <p class="compte">${etat.erreurs === 0 ? 'Aucune erreur : le fil de l\'histoire est resté intact.' : `${etat.erreurs} retour${etat.erreurs > 1 ? 's' : ''} dans le temps`} · ${sauve.faits[c.evenement].lumieres} lumière${max > 1 ? 's' : ''} sur ${max}</p>
      <div class="j-retenir"><b>À retenir</b><p>${esc(c.a_retenir)}</p></div>
      ${div ? `<div class="j-retenir"><b>Les sources divergent</b><ul>${div}</ul></div>` : ''}
      <div class="j-retenir"><b>Sources · brouillon à vérifier</b><ul>${src}</ul></div>
      <div class="j-actions">
        <button class="j-btn or" data-a="suivant">${derniere ? 'Terminer le récit' : `Chapitre ${i + 2} : ${esc(suivant.titre)}`}${ic('chev')}</button>
        <button class="j-btn" data-a="carte">Revoir sur la carte</button>
        <button class="j-btn fantome" data-a="rejouer">Rejouer</button>
      </div>`;
    $('#jBilan').hidden = false; son.lumiere();
    if (!reduit) sable.eclat(innerWidth / 2, innerHeight * 0.35);
    $('#jBilan').querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'suivant') { if (derniere) fin(); else jouer(i + 1); }
      else if (a === 'carte') quitter(c.evenement);
      else jouer(i);
    }));
    await attendre('bilan'); ok();
  }

  // ---------- panneaux ----------
  function panneau(html) {
    const p = $('#jPanneau'); p.innerHTML = html; p.hidden = false; p.scrollTop = 0;
    remplirIcones(p); missions.pause(true);
    p.querySelectorAll('[data-fermer]').forEach((b) => (b.onclick = () => { p.hidden = true; missions.pause(false); if (!etat && $('#jTitre').hidden) accueil(); }));
    return p;
  }
  function panneauMenu() {
    const p = panneau(`<div class="j-menu"><h2>Pause</h2>
      <button class="j-btn or" data-fermer>Reprendre</button>
      <button class="j-btn" data-a="rejouer">Recommencer ce chapitre</button>
      <button class="j-btn" data-a="chapitres">Chapitres</button>
      <button class="j-btn" data-a="carnet">${ic('book')}Carnet de route</button>
      <button class="j-btn" data-a="titre">Écran titre</button>
      <button class="j-btn fantome" data-a="carte">Quitter vers la carte</button></div>`);
    p.querySelector('[data-a="rejouer"]').onclick = () => jouer(etat.i);
    p.querySelector('[data-a="chapitres"]').onclick = () => panneauChapitres();
    p.querySelector('[data-a="carnet"]').onclick = () => panneauCarnet();
    p.querySelector('[data-a="titre"]').onclick = () => { etat = null; accueil(); };
    p.querySelector('[data-a="carte"]').onclick = () => quitter();
  }
  function tete(titre, ar) {
    return `<div class="j-panneau-tete"><h2>${titre}</h2><span class="j-ar" lang="ar">${ar}</span><button class="j-rond" data-fermer aria-label="Fermer"><span data-ic="close"></span></button></div>`;
  }
  function livres(tuile) {
    return H.livres.map((l) => `<section class="j-livre"><h4>${esc(l.titre)} <span>${esc(l.titre_ar)}</span></h4><div class="j-grille">${
      l.chapitres.map((id) => tuile(CH.findIndex((c) => c.evenement === id))).join('')}</div></section>`).join('');
  }
  function panneauChapitres() {
    const p = panneau(tete('Chapitres', 'الفصول') + livres((i) => {
      const c = CH[i], f = sauve.faits[c.evenement], ev = evDe(c);
      return `<button class="j-tuile ${f ? 'fait' : ''}" data-i="${i}"><span class="n">CHAPITRE ${i + 1}</span>${f ? `<span class="et">${'★'.repeat(f.etoiles)}${'☆'.repeat(3 - f.etoiles)}</span>` : ''}
        <span class="j-ar" lang="ar">${esc(c.titre_ar)}</span><b>${esc(c.titre)}</b><small>${esc(ev.annee_ap_jc)} · ${esc(LIEUX[ev.lieu].nom)}</small></button>`;
    }));
    p.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => jouer(+b.dataset.i)));
  }
  function panneauCarnet() {
    const n = Object.keys(sauve.faits).length;
    const p = panneau(tete(`Carnet de route <small style="font:600 14px var(--f-ui);color:var(--j-doux)">· ${n} / ${CH.length} · ✦ ${totalLumieres()} / ${LUM_MAX}</small>`, 'دفتر الرحلة') + livres((i) => {
      const c = CH[i], f = sauve.faits[c.evenement], ev = evDe(c);
      if (!f) return `<div class="j-tuile verrou"><span class="n">CHAPITRE ${i + 1}</span><span class="j-ar" lang="ar">${esc(c.titre_ar)}</span><b>${esc(c.titre)}</b><small>À découvrir</small></div>`;
      return `<button class="j-tuile fait" data-c="${i}"><span class="n">CHAPITRE ${i + 1}</span><span class="et">${'★'.repeat(f.etoiles)}${'☆'.repeat(3 - f.etoiles)}</span>
        <span class="j-ar" lang="ar">${esc(c.titre_ar)}</span><b>${esc(c.titre)}</b><small>${esc(c.a_retenir)}</small></button>`;
    }));
    p.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => {
      const c = CH[+b.dataset.c];
      const q = panneau(`<div class="j-fin"><div class="j-ar" lang="ar">${esc(c.titre_ar)}</div><h2>${esc(c.titre)}</h2>
        <div class="j-retenir"><b>À retenir</b><p>${esc(c.a_retenir)}</p></div>
        <div class="j-actions" style="justify-content:center"><button class="j-btn or" data-a="carte">Voir sur la carte</button><button class="j-btn" data-a="jouer">Rejouer le chapitre</button><button class="j-btn fantome" data-a="retour">Retour au carnet</button></div></div>`);
      q.querySelector('[data-a="carte"]').onclick = () => quitter(c.evenement);
      q.querySelector('[data-a="jouer"]').onclick = () => jouer(+b.dataset.c);
      q.querySelector('[data-a="retour"]').onclick = () => panneauCarnet();
    }));
  }
  function fin() {
    toutMasquer(); nettoyerCarte();
    carte.ambiance('aube'); carte.etiquettes(['makkah', 'madinah']);
    carte.viser([22.9, 39.5], 900, 0, 32, reduit ? 0 : 5000); carte.derive(0.02);
    sable.mode('poussiere');
    const p = panneau(`<div class="j-fin"><div class="j-ar" lang="ar">${esc(H.titre_ar)}</div><h2>Vous avez parcouru la Sîra</h2>
      <p>De l'année de l'Éléphant au Compagnon suprême : vingt-trois chapitres, de La Mecque à Médine.</p>
      <div class="j-chiffres"><div><b>${Object.keys(sauve.faits).length}/${CH.length}</b><small>chapitres</small></div><div><b>${totalEtoiles()}/${CH.length * 3}</b><small>étoiles</small></div><div><b>✦ ${totalLumieres()}/${LUM_MAX}</b><small>lumières</small></div></div>
      <p style="font-size:13px">Ce récit est un brouillon : chaque fiche doit encore être vérifiée par un enseignant, avec les pages des ouvrages cités.</p>
      <div class="j-actions" style="justify-content:center"><button class="j-btn or" data-a="carnet">${ic('book')}Carnet de route</button><button class="j-btn" data-a="rejouer">Rejouer depuis le début</button><button class="j-btn fantome" data-a="carte">Explorer la carte</button></div></div>`);
    p.querySelector('[data-a="carnet"]').onclick = () => panneauCarnet();
    p.querySelector('[data-a="rejouer"]').onclick = () => jouer(0);
    p.querySelector('[data-a="carte"]').onclick = () => quitter('wafat');
    etat = null;
  }

  return {
    accueil,
    jouer: (i, k) => jouer(typeof i === 'string' ? CH.findIndex((c) => c.evenement === i) : i, k),
    mission: missions.test, // essais automatisés
    actif: () => actif,
    etat: () => etat && { i: etat.i, k: etat.k, erreurs: etat.erreurs, lumieres: etat.lumieres }, // pour les tests
  };
}

// ---------- lecture à voix haute (synthèse vocale du navigateur, en option) ----------
function creerVoix(permis) {
  const S = window.speechSynthesis, dispo = !!S && typeof SpeechSynthesisUtterance !== 'undefined';
  let choisie = null;
  const trouver = () => { if (dispo && !choisie) choisie = S.getVoices().find((v) => /^fr(-|_|$)/i.test(v.lang)) || null; return choisie; };
  if (dispo) S.addEventListener?.('voiceschanged', trouver);
  // Prononciation : la formule ﷺ en entier, les références coraniques lisibles.
  const prononcer = (t) => t.replace(/ﷺ/g, ', sallallahou alayhi wa sallam,')
    .replace(/(\d+):(\d+)-(\d+)/g, '$1, versets $2 à $3').replace(/(\d+):(\d+)/g, '$1, verset $2')
    .replace(/[«»]/g, '').replace(/≈/g, 'environ ').replace(/ H\b/g, ' de l\'Hégire');
  return {
    dispo,
    dire(t) {
      if (!dispo || !permis() || !t) return;
      S.cancel();
      const u = new SpeechSynthesisUtterance(prononcer(t));
      u.lang = 'fr-FR'; u.rate = 0.98;
      const v = trouver(); if (v) u.voice = v;
      S.speak(u);
    },
    taire() { if (dispo) S.cancel(); },
  };
}

// ---------- sons : souffles de bruit filtré (vent, sable, retour), sans musique ----------
function creerSon(permis) {
  let ctx = null, bruit = null, vent = null;
  function init() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC(); } catch { return false; }
    const n = ctx.sampleRate * 2, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    bruit = b;
    return true;
  }
  function souffle({ duree, f0, f1, q = 1, type = 'bandpass', gain = 0.2, attaque = 0.05 }) {
    if (!permis() || !init() || ctx.state !== 'running') return;
    const t = ctx.currentTime, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = bruit; src.loop = true;
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + duree);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attaque); g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t, Math.random() * 1.5); src.stop(t + duree + 0.05);
  }
  return {
    reveil() { if (init() && ctx.state === 'suspended') ctx.resume(); },
    vent(on) {
      if (!init()) return;
      if (on && permis() && !vent) {
        const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
        src.buffer = bruit; src.loop = true; f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 0.6;
        g.gain.value = 0.035; lfo.frequency.value = 0.07; lg.gain.value = 0.022;
        lfo.connect(lg).connect(g.gain); src.connect(f).connect(g).connect(ctx.destination);
        src.start(); lfo.start();
        vent = { src, lfo, g };
      } else if ((!on || !permis()) && vent) {
        const v = vent; vent = null;
        v.g.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
        setTimeout(() => { v.src.stop(); v.lfo.stop(); }, 1500);
      }
    },
    page: () => souffle({ duree: 0.12, f0: 2600, f1: 1700, q: 2.5, gain: 0.05, attaque: 0.01 }),
    lumiere: () => { souffle({ duree: 1, f0: 2800, f1: 8000, q: 7, gain: 0.07, attaque: 0.04 }); souffle({ duree: 1.3, f0: 6000, f1: 11000, type: 'highpass', gain: 0.025, attaque: 0.15 }); },
    tempete: (doux) => (doux ? souffle({ duree: 0.8, f0: 600, f1: 250, q: 1, gain: 0.07 })
      : (souffle({ duree: 2.8, f0: 250, f1: 1500, q: 0.8, gain: 0.3, attaque: 0.6 }), souffle({ duree: 2.6, f0: 70, f1: 180, type: 'lowpass', gain: 0.22, attaque: 0.4 }))),
    retour: () => souffle({ duree: 1.5, f0: 4500, f1: 160, q: 3, gain: 0.16, attaque: 1.1 }),
    erreur: () => souffle({ duree: 0.35, f0: 320, f1: 120, q: 2, gain: 0.1, attaque: 0.02 }),
    chapitre: () => souffle({ duree: 3, f0: 180, f1: 900, q: 0.7, gain: 0.1, attaque: 1.4 }),
    pas: (course) => souffle({ duree: course ? 0.11 : 0.15, f0: 900 + Math.random() * 400, f1: 300, q: 1.2, gain: course ? 0.05 : 0.035, attaque: 0.01 }),
  };
}

// ---------- particules : poussière dorée, tempête de sable, retour dans le temps, éclats ----------
function creerSable(canvas, reduit) {
  const ctx = canvas.getContext('2d');
  let parts = [], mode = null, anim = 0, w = 0, h = 0, dpr = 1, dernier = 0;
  function taille() {
    dpr = Math.min(2, devicePixelRatio || 1); w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', () => anim && taille());
  function naitre(dt) {
    if (mode === 'poussiere' && parts.length < 70 && Math.random() < dt * 14)
      parts.push({ k: 'mote', x: Math.random() * w, y: h + 10, vx: (Math.random() - 0.3) * 12, vy: -12 - Math.random() * 22, r: 0.8 + Math.random() * 1.8, vie: 0, duree: 6 + Math.random() * 6 });
    if (mode === 'tempete') {
      for (let i = 0; i < dt * 260; i++) parts.push({ k: 'trait', x: -80 - Math.random() * 200, y: Math.random() * h, vx: 900 + Math.random() * 900, vy: 60 + Math.random() * 120, l: 20 + Math.random() * 90, vie: 0, duree: 1.6, a: 0.25 + Math.random() * 0.45, c: Math.random() < 0.5 ? '205,160,105' : '160,118,74' });
      for (let i = 0; i < dt * 6; i++) parts.push({ k: 'nuee', x: -300, y: Math.random() * h, vx: 500 + Math.random() * 400, vy: 30, r: 120 + Math.random() * 200, vie: 0, duree: 2.4 });
    }
    if (mode === 'retour') for (let i = 0; i < dt * 180; i++) parts.push({ k: 'trait', x: w + 80 + Math.random() * 200, y: Math.random() * h, vx: -(1400 + Math.random() * 1200), vy: 0, l: 40 + Math.random() * 140, vie: 0, duree: 1.2, a: 0.2 + Math.random() * 0.4, c: '243,211,142' });
  }
  function boucle(t) {
    const dt = Math.min(0.05, (t - dernier) / 1000 || 0.016); dernier = t;
    ctx.clearRect(0, 0, w, h);
    naitre(dt);
    parts = parts.filter((p) => (p.vie += dt) < p.duree && p.x > -600 && p.x < w + 600);
    for (const p of parts) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.k === 'mote') {
        const a = Math.sin(Math.PI * p.vie / p.duree) * (0.5 + 0.5 * Math.sin(t / 300 + p.x));
        ctx.fillStyle = `rgba(243,211,142,${a * 0.8})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
      } else if (p.k === 'trait') {
        const a = p.a * Math.min(1, (p.duree - p.vie) * 2);
        ctx.strokeStyle = `rgba(${p.c},${a})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - Math.sign(p.vx) * p.l, p.y - p.vy / Math.abs(p.vx) * p.l); ctx.stroke();
      } else if (p.k === 'nuee') {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r), a = 0.22 * Math.sin(Math.PI * p.vie / p.duree);
        g.addColorStop(0, `rgba(176,128,78,${a})`); g.addColorStop(1, 'rgba(176,128,78,0)');
        ctx.fillStyle = g; ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      } else if (p.k === 'etincelle') {
        p.vy += 260 * dt; p.vx *= 0.985;
        const a = 1 - p.vie / p.duree;
        ctx.fillStyle = `rgba(${p.c},${a})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.6 + a * 0.6), 0, 7); ctx.fill();
      }
    }
    if (parts.length || mode) anim = requestAnimationFrame(boucle);
    else { anim = 0; ctx.clearRect(0, 0, w, h); }
  }
  function lancer() { if (!anim) { taille(); dernier = performance.now(); anim = requestAnimationFrame(boucle); } }
  return {
    mode(m) { mode = reduit ? null : m; if (mode) lancer(); },
    eclat(x, y) {
      if (reduit) return;
      for (let i = 0; i < 46; i++) {
        const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 340;
        parts.push({ k: 'etincelle', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, r: 1.2 + Math.random() * 2.2, vie: 0, duree: 0.9 + Math.random() * 0.7, c: Math.random() < 0.7 ? '243,211,142' : '255,250,235' });
      }
      lancer();
    },
  };
}
