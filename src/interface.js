// Interface : récit de l'événement, contexte, ruban chronologique, index, recherche,
// mini-carte, visite guidée, modes immersif et vol libre, liens directs.
import { ic, remplirIcones } from './icones.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’`ʿʾ]/g, '').toLowerCase();
const PERIODES = { avant: 'Avant la prophétie', mecquoise: 'Période mecquoise', medinoise: 'Période médinoise' };
const CERTITUDE = { 'certaine': 'certaine', 'probable': 'probable', 'discutée': 'discutee' };
// Échelle du ruban : trois périodes, chacune avec sa part de la largeur (années réelles).
const ERES = [
  { nom: 'Avant la prophétie', de: 568, a: 610, part: 0.2 },
  { nom: 'Période mecquoise', de: 610, a: 622, part: 0.32 },
  { nom: 'Période médinoise', de: 622, a: 633, part: 0.48 },
];
const TYPES = { ville: 'Ville', site: 'Site', montagne: 'Relief', oasis: 'Oasis', region: 'Région' };
// Menu « Aller à » : [lieu, distance de vue en km (facultative), libellé (facultatif)].
const DESTINATIONS = [
  { titre: 'Hijaz', lieux: [['makkah', 9, 'La Mecque'], ['madinah', 10, 'Médine'], ['badr', 6], ['khaybar', 8], ['taif', 7], ['hudaybiya', 5], ['hunayn', 6]] },
  { titre: 'La Mecque', lieux: [['makkah', 0.6, "La Ka'ba"], ['safa', 0.7, 'as-Safâ et al-Marwa'], ['shib', 1.2], ['hajun', 1.4], ['hira', 2.5], ['thawr', 3], ['aqaba', 3, 'Minâ'], ['arafat', 3.5]] },
  { titre: 'Médine', lieux: [['madinah', 0.7, 'Mosquée du Prophète ﷺ'], ['baqi', 1], ['quba', 1.4], ['qiblatayn', 1.4], ['uhud', 3], ['khandaq', 2.5], ['aqiq', 6]] },
];
const AIDE_VUE = 'sira3d.aide-vue';

export function creerInterface(D) {
  const { EVENEMENTS: EV, LIEUX, HADITHS, CATEGORIES: CAT, OUVRAGES, BATAILLES } = D;
  let carte = null, cur = -1, onglet = 'ev', volet = 'recit', visite = null, phase = 0, suiteBataille = null, lieuOuvert = null, lecture = null;
  let recitReduit = innerWidth <= 760; // sur téléphone, la carte d'abord : la fiche s'ouvre d'un geste
  const evDuLieu = (id) => EV.map((e, i) => [e, i]).filter(([e]) => e.lieu === id || (e.trajet && e.trajet.etapes.includes(id)));
  const aVerifier = EV.filter((e) => e.statut !== 'validé').length;
  const couleur = (cat) => getComputedStyle(document.documentElement).getPropertyValue('--c-' + cat).trim() || '#C9962F';
  const annee = (e) => (e.annee_hegire ? `${e.annee_hegire} H` : e.annee_ap_jc);
  const lien = (h) => { try { history.replaceState(null, '', h); } catch { /* adresse non modifiable (page isolée) */ } };

  remplirIcones();
  $('#nEv').textContent = EV.length;
  $('#nLoc').textContent = Object.keys(LIEUX).length;
  $('#nHad').textContent = Object.keys(HADITHS).length;
  $('#etatBtn').title = `${aVerifier} fiche${aVerifier > 1 ? 's' : ''} sur ${EV.length} à vérifier : voir les sources`;

  function toast(texte) {
    const t = $('#toast'); t.textContent = texte; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2200);
  }

  // ---------- volets du récit ----------
  const statutHTML = (s) => (s === 'validé' ? `<span class="statut valide">${ic('check')}Validé</span>` : `<span class="statut brouillon">${ic('alert')}Brouillon · à vérifier</span>`);
  function sourceHTML(s) {
    const o = OUVRAGES[s.ouvrage] || { titre: s.ouvrage };
    const page = s.page != null ? `p. ${esc(s.page)}` : '<span class="manque">page à compléter</span>';
    return `<li><b>${esc(o.titre)}</b>${o.auteur ? ` — ${esc(o.auteur)}` : ''}${s.passage ? ` · <i>${esc(s.passage)}</i>` : ''} · ${page}</li>`;
  }
  function hadithHTML(id) {
    const h = HADITHS[id];
    return `<details class="hadith" id="umda-${id}"><summary>${ic('book')}al-'Umda · ${esc(h.titre)}<small>n° ${h.numero} · p. ${h.page}</small></summary>
      <div class="uar" lang="ar">${esc(h.ar)}</div><p class="ufr">${esc(h.fr)}</p>
      <div class="unr">Rapporté par ${esc(h.rapporteur)} · ${esc(h.livre)} · PDF p. ${h.page_pdf} · traduction à vérifier</div></details>`;
  }
  function remplirVolets(ev) {
    const L = LIEUX[ev.lieu];
    $('.volet[data-p="recit"]').innerHTML = `<p>${esc(ev.resume)}</p>
      ${ev.coran ? `<div class="coran"><span class="pastille">${ic('book')} Coran</span>Sourate ${esc(ev.coran)}</div>` : ''}
      ${(ev.hadiths || []).map(hadithHTML).join('')}`;
    const lignes = [['Date', ev.date], ['Année', ev.annee_ap_jc + ' apr. J.-C.'], ['Lieu', L.nom], ['Âge du Prophète ﷺ', ev.age === 0 ? 'Naissance' : ev.age + ' ans']].concat(ev.faits);
    $('.volet[data-p="reperes"]').innerHTML = `<dl class="faits">${lignes.map((r) => `<dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd>`).join('')}</dl>
      <div class="bloc"><h3>${ic('pin')}Localisation · ${esc(L.nom)}</h3><span class="certitude ${CERTITUDE[L.certitude] || ''}">${esc(L.certitude)}</span>
      ${L.note_localisation ? `<p class="note">${esc(L.note_localisation)}</p>` : ''}${ev.trajet && ev.trajet.note ? `<p class="note">${esc(ev.trajet.note)}</p>` : ''}</div>`;
    const div = ev.divergences || [];
    $('#nDiv').textContent = div.length ? `· ${div.length}` : '';
    $('.volet[data-p="sources"]').innerHTML = `${div.length ? `<div class="bloc div"><h3>${ic('split')}Divergences signalées</h3><ul>${div.map((d) => `<li><b>${esc(d.sujet)} :</b> ${esc(d.texte)}</li>`).join('')}</ul></div>` : ''}
      <div class="bloc"><h3>${ic('book')}Sources</h3><ul>${ev.sources.map(sourceHTML).join('')}</ul>
      ${ev.statut !== 'validé' ? '<p class="note">Brouillon rédigé d\'après ces sources, en attente de validation par un enseignant.</p>' : ''}</div>`;
    const B = BATAILLES[ev.id];
    $('#ongletBataille').hidden = !B;
    if (B) remplirBataille(ev, B);
  }
  function remplirBataille(ev, B) {
    const P = B.phases[phase];
    $('.volet[data-p="bataille"]').innerHTML = `
      <div class="phases">${B.phases.map((_, k) => `<button data-ph="${k}" class="${k === phase ? 'on' : ''}" aria-label="Étape ${k + 1}">${k + 1}</button>`).join('')}</div>
      <h3 class="phase-titre">${esc(P.titre)}</h3>
      <p>${esc(P.texte)}</p>
      <div class="legende">${Object.values(B.camps).map((c) => `<span><i style="background:${esc(c.couleur)}"></i>${esc(c.nom)}</span>`).join('')}</div>
      <div class="phase-nav">
        <button data-nav="-1" ${phase === 0 ? 'disabled' : ''} aria-label="Étape précédente">${ic('chevL')}</button>
        <button data-lecture class="${lecture ? 'on' : ''}">${lecture ? ic('pause') + 'Pause' : ic('play') + 'Dérouler'}</button>
        <button data-nav="1" class="principal">${phase === B.phases.length - 1 ? 'Recommencer' : 'Étape suivante'}${ic('chev')}</button>
      </div>
      <div class="bloc"><h3>${ic('alert')}Schéma à vérifier</h3><p class="note">${esc(B.note)}</p><ul>${B.sources.map(sourceHTML).join('')}</ul></div>`;
    $$('.volet[data-p="bataille"] [data-ph]').forEach((b) => (b.onclick = () => montrerPhase(+b.dataset.ph)));
    $$('.volet[data-p="bataille"] [data-nav]').forEach((b) => (b.onclick = () => {
      const n = B.phases.length; montrerPhase(+b.dataset.nav > 0 && phase === n - 1 ? 0 : Math.max(0, Math.min(n - 1, phase + +b.dataset.nav)));
    }));
    $('.volet[data-p="bataille"] [data-lecture]').onclick = () => derouler(!lecture);
  }
  function montrerPhase(k, auto = false) {
    const ev = EV[cur], B = BATAILLES[ev.id]; if (!B) return;
    clearTimeout(suiteBataille); arreterVisite();
    if (!auto) { clearTimeout(lecture); lecture = null; }
    phase = k; remplirBataille(ev, B); ouvrirVolet('bataille');
    carte.bataille(B, phase);
  }
  // Lecture automatique des étapes d'une bataille (une étape toutes les 8 s).
  function derouler(on) {
    clearTimeout(lecture); lecture = null;
    const ev = EV[cur], B = BATAILLES[ev.id]; if (!B) return;
    if (on) {
      const suite = () => {
        if (phase >= B.phases.length - 1) { lecture = null; remplirBataille(EV[cur], B); return; }
        lecture = setTimeout(suite, 8000);
        montrerPhase(phase + 1, true);
      };
      lecture = setTimeout(suite, 8000);
      montrerPhase(phase === B.phases.length - 1 ? 0 : phase, true);
    } else remplirBataille(ev, B);
  }
  function ouvrirVolet(p) {
    volet = p;
    $$('.onglets button').forEach((b) => b.classList.toggle('on', b.dataset.p === p));
    $$('.volet').forEach((v) => v.classList.toggle('on', v.dataset.p === p));
    $('.recit-corps').scrollTop = 0;
  }
  $$('.onglets button').forEach((b) => (b.onclick = () => {
    ouvrirVolet(b.dataset.p);
    if (b.dataset.p === 'bataille') montrerPhase(phase);
  }));

  // ---------- sélection d'un événement ----------
  function choisir(i, opts = {}) {
    i = (i + EV.length) % EV.length; cur = i;
    const ev = EV[i], L = LIEUX[ev.lieu], c = CAT[ev.categorie], B = BATAILLES[ev.id];
    clearTimeout(suiteBataille); clearTimeout(lecture); lecture = null;
    lieuOuvert = null;
    ouvrirRecit(!recitReduit);
    $('#recit').className = 'recit verre ui cat-' + ev.categorie;
    $('#ongletRecit').textContent = 'Récit';
    $('#dCat').textContent = `${c.nom} · ${L.nom}`;
    $('#dTitre').textContent = ev.titre;
    $('#dAr').textContent = ev.titre_ar;
    $('#dDate').textContent = `${ev.date} · ${ev.annee_ap_jc}`;
    $('#dStatut').innerHTML = statutHTML(ev.statut);
    $('#pliTitre').textContent = ev.titre;
    $('#dJouer').hidden = !(D.HISTOIRE && D.HISTOIRE.chapitres.some((c) => c.evenement === ev.id));
    phase = 0;
    remplirVolets(ev);
    ouvrirVolet(B ? 'bataille' : opts.hadith ? 'recit' : (volet === 'bataille' ? 'recit' : volet));
    if (opts.hadith) { const el = document.getElementById('umda-' + opts.hadith); if (el) { el.open = true; el.scrollIntoView({ block: 'nearest' }); } }
    const autres = EV.map((e, k) => [e, k]).filter(([e, k]) => e.lieu === ev.lieu && k !== i);
    $('#dAussi').innerHTML = autres.length ? 'Aussi ici :' + autres.map(([e, k]) => `<button data-i="${k}">${esc(e.titre)}</button>`).join('') : '';
    $$('#dAussi button').forEach((b) => (b.onclick = () => { arreterVisite(); choisir(+b.dataset.i); }));
    // contexte
    $('#ctxAn').textContent = ev.annee_hegire ? `An ${ev.annee_hegire} H` : 'Avant l\'Hégire';
    $('#ctxAnnee').textContent = ev.annee_ap_jc;
    $('#ctxAge').textContent = ev.age === 0 ? 'Naissance' : `${ev.age} ans`;
    $('#ctxPeriode').textContent = PERIODES[ev.periode] || ev.periode;
    ruban();
    if (onglet !== 'src' && !$('#tiroir').hidden) liste();
    if (!opts.sansLien) lien('#evenement/' + ev.id);
    carte.bataille(null);
    carte.selectionner(ev, i, couleur(ev.categorie));
    if (!opts.sansVol) carte.cadrer(ev, opts.duree);
    // Bataille : on montre d'abord la marche de l'armée, puis on descend sur le champ de bataille.
    if (B) suiteBataille = setTimeout(() => montrerPhase(0), opts.sansVol ? 300 : (ev.trajet ? 3800 : 1200));
  }

  // ---------- fiche d'un lieu (clic sur une épingle, index, « Aller à », lien #lieu/…) ----------
  const coord = (v, pos, neg) => `${Math.abs(v).toFixed(4).replace('.', ',')}° ${v >= 0 ? pos : neg}`;
  function ficheLieu(id, opts = {}) {
    const L = LIEUX[id]; if (!L) return false;
    lieuOuvert = id;
    clearTimeout(suiteBataille); clearTimeout(lecture); lecture = null;
    ouvrirRecit(!recitReduit);
    $('#recit').className = 'recit verre ui fiche-lieu';
    $('#dCat').textContent = `${TYPES[L.type] || 'Lieu'} · ${L.ville ? LIEUX[L.ville].nom : L.hors_carte ? 'hors de la carte' : 'Hijaz'}`;
    $('#dTitre').textContent = L.nom;
    $('#dAr').textContent = L.nom_ar;
    $('#dDate').innerHTML = `<span class="certitude ${CERTITUDE[L.certitude] || ''}">localisation ${esc(L.certitude)}</span>`;
    $('#dStatut').innerHTML = statutHTML(L.statut);
    $('#pliTitre').textContent = L.nom;
    $('#dJouer').hidden = true;
    $('#ongletRecit').textContent = 'Présentation';
    $('#ongletBataille').hidden = true;
    $('#nDiv').textContent = '';
    // lieux voisins : de la même ville (ou de cette ville), les plus proches d'abord
    const loin = (l) => Math.hypot(l.lat - L.lat, (l.lon - L.lon) * Math.cos(L.lat * Math.PI / 180));
    const evs = evDuLieu(id), voisins = Object.values(LIEUX).filter((l) => l.id !== id && ((L.ville && (l.ville === L.ville || l.id === L.ville)) || l.ville === id))
      .sort((a, c) => loin(a) - loin(c)).slice(0, 8);
    $('.volet[data-p="recit"]').innerHTML = `${L.note_localisation ? `<p>${esc(L.note_localisation)}</p>` : ''}
      ${L.hors_carte ? `<p class="note">${esc(L.hors_carte.indication)} : la flèche au bord de la carte indique sa direction.</p>` : ''}
      <div class="bloc"><h3>${ic('calendar')}Événements ici</h3>${evs.length
        ? `<ul class="liens">${evs.map(([e, i]) => `<li><button class="cat-${e.categorie}" data-i="${i}"><i></i><b>${esc(e.titre)}</b><small>${esc(annee(e))}${e.lieu !== id ? ' · étape du trajet' : ''}</small></button></li>`).join('')}</ul>`
        : '<p class="note">Aucun événement de la chronologie n\'y est encore rattaché.</p>'}</div>
      ${voisins.length ? `<div class="bloc"><h3>${ic('pin')}${L.ville ? 'À proximité' : 'Dans cette ville'}</h3><div class="puces">${voisins.map((l) => `<button data-l="${l.id}">${esc(l.nom)}</button>`).join('')}</div></div>` : ''}`;
    const alt = L.hors_carte ? null : Math.round(carte.altitude(L.lat, L.lon) / 10) * 10;
    const lignes = [['Type', TYPES[L.type] || 'Lieu'], ['Ville', L.ville ? LIEUX[L.ville].nom : '—'], ['Latitude', coord(L.lat, 'N', 'S')], ['Longitude', coord(L.lon, 'E', 'O')]];
    if (alt != null) lignes.push(['Altitude du sol', `≈ ${alt.toLocaleString('fr-FR')} m`]);
    $('.volet[data-p="reperes"]').innerHTML = `<dl class="faits">${lignes.map((r) => `<dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd>`).join('')}</dl>
      <div class="bloc"><h3>${ic('pin')}Localisation</h3><span class="certitude ${CERTITUDE[L.certitude] || ''}">${esc(L.certitude)}</span>
      <p class="note">Altitude d'aujourd'hui (relief Copernicus), arrondie. Le relief de la carte est exagéré six fois pour rester lisible.</p></div>`;
    $('.volet[data-p="sources"]').innerHTML = `<div class="bloc"><h3>${ic('book')}Sources</h3><ul>${(L.sources || []).map(sourceHTML).join('')}</ul>
      ${L.statut !== 'validé' ? '<p class="note">Fiche rédigée d\'après ces sources, en attente de validation par un enseignant.</p>' : ''}</div>`;
    ouvrirVolet(volet === 'bataille' ? 'recit' : volet);
    $('#dAussi').innerHTML = '';
    $$('.volet[data-p="recit"] [data-i]').forEach((b) => (b.onclick = () => { arreterVisite(); choisir(+b.dataset.i); }));
    $$('.volet[data-p="recit"] [data-l]').forEach((b) => (b.onclick = () => ficheLieu(b.dataset.l)));
    if (onglet === 'loc' && !$('#tiroir').hidden) liste();
    if (!opts.sansLien) lien('#lieu/' + id);
    if (!opts.sansVol) carte.montrerLieu(id, opts.r);
    return true;
  }

  // ---------- récit : ouvrir / réduire ----------
  function ouvrirRecit(ouvert) {
    document.body.classList.toggle('recit-ferme', !ouvert);
    $('#recitPli').hidden = ouvert;
    carte && carte.rafraichirVue();
  }
  $('#dReduire').onclick = () => { recitReduit = true; ouvrirRecit(false); };
  $('#dJouer').onclick = () => { arreterVisite(); clearTimeout(suiteBataille); carte.bataille(null); api.surChapitre && api.surChapitre(EV[cur].id); };
  $('#recitPli').onclick = () => { recitReduit = false; ouvrirRecit(true); };
  $('#dFocus').onclick = () => { arreterVisite(); clearTimeout(suiteBataille); carte.bataille(null); carte.zoomLieu(lieuOuvert || EV[cur].lieu); };
  $('#dLink').onclick = async () => {
    try { await navigator.clipboard.writeText(location.href); toast('Lien copié : ' + location.hash); }
    catch { toast('Lien de la fiche : ' + location.hash); }
  };

  // ---------- ruban chronologique ----------
  const anneeNum = (e) => +(String(e.annee_ap_jc).match(/\d{3}/) || [600])[0];
  function echelle(an) {
    let x = 0;
    for (const e of ERES) {
      if (an >= e.a) { x += e.part; continue; }
      return x + Math.max(0, an - e.de) / (e.a - e.de) * e.part;
    }
    return 1;
  }
  $('#eres').innerHTML = ERES.map((e) => `<div style="flex:${e.part}"><span>${e.nom}</span></div>`).join('');
  $('#points').innerHTML = EV.map((e, k) => `<button class="cat-${e.categorie}" data-i="${k}" title="${esc(e.titre)} · ${esc(e.annee_ap_jc)}" aria-label="${esc(e.titre)}"><i></i></button>`).join('');
  $$('#points button').forEach((b) => (b.onclick = () => { arreterVisite(); choisir(+b.dataset.i); }));
  function placerPoints() {
    const w = $('#axe').clientWidth || 600, ecart = 13 / w;
    let precedent = -1;
    const xs = EV.map((e) => { const x = Math.max(echelle(anneeNum(e) + 0.5), precedent + ecart); precedent = x; return x; });
    const deborde = Math.max(0, xs[xs.length - 1] - 0.995);
    $$('#points button').forEach((b, k) => { b.style.left = `${(xs[k] - deborde * (k / (xs.length - 1))) * 100}%`; });
  }
  function ruban() {
    const ev = EV[cur], an = anneeNum(ev);
    $$('#points button').forEach((b, k) => b.classList.toggle('on', k === cur));
    $$('#eres div').forEach((d, k) => d.classList.toggle('passe', an >= ERES[k].a));
    const point = $$('#points button')[cur], axe = $('#axe'), lbl = $('#courant');
    lbl.innerHTML = `${esc(ev.titre)}<small>${esc(annee(ev))}</small>`;
    const x = point.offsetLeft, w = axe.clientWidth, demi = lbl.offsetWidth / 2;
    lbl.style.left = `${Math.min(w - demi, Math.max(demi, x))}px`;
  }
  placerPoints();

  // ---------- index (tiroir) ----------
  function ouvrirTiroir(ouvert) {
    $('#tiroir').hidden = !ouvert;
    document.body.classList.toggle('tiroir-ouvert', ouvert);
    $('#indexBtn').setAttribute('aria-pressed', ouvert);
    if (ouvert) liste();
    carte && carte.rafraichirVue();
  }
  $('#indexBtn').onclick = () => ouvrirTiroir($('#tiroir').hidden);
  $('#tiroirFermer').onclick = () => ouvrirTiroir(false);
  $('#etatBtn').onclick = () => { ouvrirOnglet('src'); ouvrirTiroir(true); };
  function liste() {
    const corps = $('#lbody'); let h = '';
    if (onglet === 'ev') h = EV.map((e, k) => `<button class="row cat-${e.categorie} ${k === cur ? 'on' : ''}" data-i="${k}"><span class="c1"><b>${esc(annee(e))}</b><small>${esc(e.annee_ap_jc)}</small></span><span class="c2"><b>${esc(e.titre)}</b><span class="ar" lang="ar">${esc(e.titre_ar)}</span></span><span class="pastille">${esc(CAT[e.categorie].nom)}</span></button>`).join('');
    if (onglet === 'loc') {
      const groupes = [['Hijaz', (L) => !L.ville && !L.hors_carte], ['La Mecque et ses environs', (L) => L.ville === 'makkah'], ['Médine et ses environs', (L) => L.ville === 'madinah'], ['Hors de la carte', (L) => L.hors_carte]];
      h = groupes.map(([titre, f]) => `<div class="groupe">${titre}</div>` + Object.values(LIEUX).filter(f).map((L) => {
        const n = evDuLieu(L.id).length, on = lieuOuvert ? lieuOuvert === L.id : EV[cur].lieu === L.id;
        return `<button class="row ${on ? 'on' : ''}" data-l="${L.id}"><span class="c1"><b>${esc(L.code || TYPES[L.type] || 'Lieu')}</b></span><span class="c2"><b>${esc(L.nom)}</b><span class="ar" lang="ar">${esc(L.nom_ar)}</span></span><span class="certitude ${CERTITUDE[L.certitude]}" title="${n} événement${n > 1 ? 's' : ''}">${esc(L.certitude)}${n ? ' · ' + n : ''}</span></button>`;
      }).join('')).join('');
    }
    if (onglet === 'had') h = Object.values(HADITHS).map((u) => {
      const e = EV[D.INDEX[u.evenements[0]]], on = u.evenements.includes(EV[cur].id);
      return `<button class="row cat-${e.categorie} ${on ? 'on' : ''}" data-u="${u.id}"><span class="c1"><b>n° ${u.numero}</b><small>p. ${u.page}</small></span><span class="c2"><b>${esc(u.titre)}</b><span class="ar">${esc(u.evenements.map((id) => EV[D.INDEX[id]].titre).join(' · '))}</span></span><span></span></button>`;
    }).join('');
    if (onglet === 'src') {
      const usage = {};
      const compter = (s) => { const u = (usage[s.ouvrage] ||= { n: 0, sans: 0 }); u.n++; if (s.page == null) u.sans++; };
      EV.forEach((e) => e.sources.forEach(compter));
      Object.values(LIEUX).forEach((l) => (l.sources || []).forEach(compter));
      Object.values(BATAILLES).forEach((b) => b.sources.forEach(compter));
      h = `<p class="credits"><b>${aVerifier} fiche${aVerifier > 1 ? 's' : ''} sur ${EV.length}</b> en brouillon, à valider par un enseignant.</p>` +
        Object.entries(OUVRAGES).filter(([k]) => usage[k] || k === 'umda').map(([k, o]) => {
          const u = usage[k] || { n: 0, sans: 0 }, nh = k === 'umda' ? Object.keys(HADITHS).length : 0;
          return `<div class="srcrow"><b>${esc(o.titre)}</b><small>${esc(o.auteur || '')}${o.edition ? ' · ' + esc(o.edition) : ' · <span class="manque">édition à préciser</span>'}</small><br><small>${u.n + nh} citation${u.n + nh > 1 ? 's' : ''}${u.sans ? ` · <span class="manque">${u.sans} page${u.sans > 1 ? 's' : ''} à compléter</span>` : ''}</small></div>`;
        }).join('') + `<p class="credits">${D.DONNEES_CARTE.map((d) => `<b>${esc(d.nom)}</b> (${esc(d.usage.toLowerCase())}) : ${esc(d.attribution)}.`).join('<br>')}</p>`;
    }
    corps.innerHTML = h;
    corps.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => { arreterVisite(); choisir(+b.dataset.i); fermerSurMobile(); }));
    corps.querySelectorAll('[data-l]').forEach((b) => (b.onclick = () => { arreterVisite(); ficheLieu(b.dataset.l); fermerSurMobile(); }));
    corps.querySelectorAll('[data-u]').forEach((b) => (b.onclick = () => { arreterVisite(); const u = HADITHS[b.dataset.u]; choisir(D.INDEX[u.evenements[0]], { hadith: u.id }); fermerSurMobile(); }));
    const on = corps.querySelector('.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
  }
  const fermerSurMobile = () => { if (innerWidth <= 760) ouvrirTiroir(false); };
  function ouvrirOnglet(t) {
    onglet = t;
    $('#lbody').scrollTop = 0;
    $$('#tiroir .segments button').forEach((x) => x.classList.toggle('on', x.dataset.tab === t));
    liste();
  }
  $$('#tiroir .segments button').forEach((b) => (b.onclick = () => ouvrirOnglet(b.dataset.tab)));

  // ---------- visite guidée ----------
  function boutonVisite() {
    $('#play').innerHTML = visite ? ic('pause') + 'Pause' : ic('play') + 'Visite guidée';
    $('#play').setAttribute('aria-label', visite ? 'Mettre la visite en pause' : 'Lancer la visite guidée');
  }
  function arreterVisite() { if (visite) { clearInterval(visite); visite = null; boutonVisite(); } }
  $('#play').onclick = () => {
    if (visite) return arreterVisite();
    choisir(cur + 1);
    visite = setInterval(() => choisir(cur + 1), 9000);
    boutonVisite();
  };
  boutonVisite();
  $('#prev').onclick = () => { arreterVisite(); choisir(cur - 1); };
  $('#next').onclick = () => { arreterVisite(); choisir(cur + 1); };

  // ---------- carte : commandes, calques, thème ----------
  $('#zIn').onclick = () => carte.zoom(0.7);
  $('#zOut').onclick = () => carte.zoom(1.43);
  $('#nord').onclick = () => carte.nord();
  $('#home').onclick = () => { arreterVisite(); clearTimeout(suiteBataille); carte.accueil(); };
  $('#satBtn').onclick = (e) => {
    const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    e.currentTarget.setAttribute('aria-pressed', on);
    carte.satellite(on);
    toast(on ? "Image satellite d'aujourd'hui (Sentinel-2, 2024)" : 'Carte stylisée');
  };
  const sombre = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };
  function appliquerTheme() {
    const d = sombre();
    $('#themeBtn').innerHTML = ic(d ? 'sun' : 'moon');
    $('#themeBtn').setAttribute('aria-label', d ? 'Passer en mode jour' : 'Passer en mode nuit');
    if (carte) carte.theme(d, cur >= 0 ? couleur(EV[cur].categorie) : null);
  }
  $('#themeBtn').onclick = () => { document.documentElement.dataset.theme = sombre() ? 'light' : 'dark'; appliquerTheme(); };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', appliquerTheme);
  new MutationObserver(appliquerTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // ---------- mode immersif ----------
  function immersif(on) {
    document.body.classList.toggle('immersif', on);
    $('#sortieImmersif').hidden = !on;
    carte && carte.rafraichirVue();
  }
  $('#immersifBtn').onclick = () => immersif(true);
  $('#sortieImmersif').onclick = () => immersif(false);

  // ---------- vol libre ----------
  function vol(on) {
    if (on === document.body.classList.contains('vol')) return;
    arreterVisite(); clearTimeout(suiteBataille);
    document.body.classList.toggle('vol', on);
    $('#volBtn').setAttribute('aria-pressed', on);
    $('#volHud').hidden = !on;
    $('#volPad').hidden = !on || !matchMedia('(pointer: coarse)').matches;
    carte.vol(on);
    if (on) toast('Vol libre : avancez avec Z (ou W, ou ↑), regardez en glissant la souris.');
  }
  $('#volBtn').onclick = () => vol(!document.body.classList.contains('vol'));
  $('#volQuitter').onclick = () => vol(false);
  $$('#volPad button').forEach((b) => {
    const k = b.dataset.v;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); carte.commandeVol(k, true); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => b.addEventListener(t, () => carte.commandeVol(k, false)));
  });
  function surVol(info) {
    const ou = info.nom ? (info.distance < 1 ? `au-dessus de ${info.nom}` : `à ${info.distance.toFixed(info.distance < 10 ? 1 : 0).replace('.', ',')} km de ${info.nom}`) : '';
    const v = info.vitesse ? (info.vitesse < 1 ? `${Math.round(info.vitesse * 1000)} m/s` : `${info.vitesse.toFixed(1).replace('.', ',')} km/s`) : 'en vol stationnaire';
    $('#volInfo').textContent = `${ou} · ${v}`;
  }

  // ---------- mini-carte ----------
  const mini = $('#miniCanvas'), mctx = mini.getContext('2d');
  let fondMini = null;
  function dessinerMini(etat) {
    if (!fondMini || $('#minicarte').hidden || document.body.classList.contains('immersif')) return;
    const w = mini.width, h = mini.height;
    mctx.drawImage(fondMini, 0, 0, w, h);
    const px = (lat, lon) => [(lon - etat.emprise.ouest) / (etat.emprise.est - etat.emprise.ouest) * w, (etat.emprise.nord - lat) / (etat.emprise.nord - etat.emprise.sud) * h];
    for (const id of ['makkah', 'madinah', 'badr', 'khaybar', 'taif']) {
      const [x, y] = px(LIEUX[id].lat, LIEUX[id].lon);
      mctx.fillStyle = '#0E6B53'; mctx.beginPath(); mctx.arc(x, y, 2.5, 0, 7); mctx.fill();
    }
    // position et direction de la vue
    const [x, y] = px(etat.lat, etat.lon), a = etat.cap;
    const portee = Math.max(6, Math.min(40, etat.portee / (etat.emprise.nord - etat.emprise.sud) / 110 * h));
    mctx.fillStyle = 'rgba(201,150,47,.35)'; mctx.strokeStyle = '#C9962F'; mctx.lineWidth = 1.5;
    mctx.beginPath(); mctx.moveTo(x, y);
    mctx.arc(x, y, portee, -Math.PI / 2 + a - 0.5, -Math.PI / 2 + a + 0.5); mctx.closePath(); mctx.fill(); mctx.stroke();
    mctx.fillStyle = '#fff'; mctx.beginPath(); mctx.arc(x, y, 3.5, 0, 7); mctx.fill();
    mctx.strokeStyle = '#C9962F'; mctx.beginPath(); mctx.arc(x, y, 3.5, 0, 7); mctx.stroke();
  }
  mini.addEventListener('click', (e) => {
    const r = mini.getBoundingClientRect(), E = carte.emprise();
    const lon = E.ouest + (e.clientX - r.left) / r.width * (E.est - E.ouest), lat = E.nord - (e.clientY - r.top) / r.height * (E.nord - E.sud);
    arreterVisite(); clearTimeout(suiteBataille);
    carte.teleporter(lat, lon);
  });
  function miniVisible(on) { $('#minicarte').hidden = !on; $('#miniOuvrir').hidden = on; }
  $('#miniFermer').onclick = () => miniVisible(false);
  $('#miniOuvrir').onclick = () => miniVisible(true);
  let image = 0;
  function surImage(etat) {
    if (++image % 4 === 0) dessinerMini(etat);
    $('#nord .aiguille').style.transform = `rotate(${-etat.cap}rad)`;
    if (etat.vol) surVol(etat.vol);
  }

  // ---------- recherche ----------
  const q = $('#q'), res = $('#resultats'); let resultats = [], sel = 0;
  function chercher() {
    const brut = q.value.trim(), v = norm(brut);
    if (!v) { res.hidden = true; return; }
    resultats = [];
    EV.forEach((e, i) => {
      const texte = norm([e.titre, e.resume, e.date, e.annee_ap_jc, LIEUX[e.lieu].nom, e.faits.map((f) => f.join(' ')).join(' ')].join(' '));
      if (texte.includes(v) || e.titre_ar.includes(brut)) resultats.push({ t: 'e', i });
    });
    Object.values(LIEUX).forEach((L) => { if (norm(L.nom).includes(v) || L.nom_ar.includes(brut)) resultats.push({ t: 'l', k: L.id }); });
    resultats.sort((a, c) => (a.t === 'l' && norm(LIEUX[a.k].nom).startsWith(v) ? 0 : 1) - (c.t === 'l' && norm(LIEUX[c.k].nom).startsWith(v) ? 0 : 1));
    resultats = resultats.slice(0, 9); sel = 0;
    res.innerHTML = resultats.length ? resultats.map((r, j) => r.t === 'e'
      ? `<button class="res ${j === 0 ? 'on' : ''}" data-j="${j}">${ic(CAT[EV[r.i].categorie].icone)}<span class="t"><b>${esc(EV[r.i].titre)}</b><small>${esc(LIEUX[EV[r.i].lieu].nom)} · ${esc(EV[r.i].annee_ap_jc)}</small></span><span class="ar" lang="ar">${esc(EV[r.i].titre_ar)}</span></button>`
      : `<button class="res ${j === 0 ? 'on' : ''}" data-j="${j}">${ic('pin')}<span class="t"><b>${esc(LIEUX[r.k].nom)}</b><small>${esc(TYPES[LIEUX[r.k].type] || 'Lieu')}${LIEUX[r.k].ville ? ' · ' + esc(LIEUX[LIEUX[r.k].ville].nom) : ''}</small></span><span class="ar" lang="ar">${esc(LIEUX[r.k].nom_ar)}</span></button>`).join('')
      : `<div class="vide">Aucun résultat pour « ${esc(brut)} ». Essayez Badr, Hijra, Khadîja…</div>`;
    res.hidden = false;
    res.querySelectorAll('.res').forEach((b) => (b.onmousedown = (e) => { e.preventDefault(); aller(+b.dataset.j); }));
  }
  function aller(j) {
    const r = resultats[j]; if (!r) return;
    arreterVisite();
    if (r.t === 'e') choisir(r.i); else ficheLieu(r.k);
    q.value = ''; res.hidden = true; q.blur(); document.body.classList.remove('recherche-ouverte');
  }
  q.addEventListener('input', chercher);
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); aller(sel); }
    else if (e.key === 'Escape') { q.value = ''; res.hidden = true; q.blur(); document.body.classList.remove('recherche-ouverte'); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); sel = Math.max(0, Math.min(resultats.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)));
      res.querySelectorAll('.res').forEach((b, j) => b.classList.toggle('on', j === sel));
    }
  });
  q.addEventListener('blur', () => setTimeout(() => (res.hidden = true), 120));
  $('#rechBtn').onclick = () => { document.body.classList.add('recherche-ouverte'); q.focus(); };

  // ---------- clavier ----------
  addEventListener('keydown', (e) => {
    if (e.target === q || e.target.tagName === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.body.classList.contains('histoire')) return; // le jeu a ses propres touches
    const enVol = document.body.classList.contains('vol');
    if (e.key === 'Escape') {
      if (enVol) vol(false);
      else if (!$('#aller').hidden) allerA(false);
      else if (!$('#aide').hidden) aide(false);
      else if (!$('#tiroir').hidden) ouvrirTiroir(false);
      else if (document.body.classList.contains('immersif')) immersif(false);
      else { recitReduit = !document.body.classList.contains('recit-ferme'); ouvrirRecit(!recitReduit); }
      return;
    }
    if (enVol) return; // les touches pilotent l'appareil
    if (e.key === '/') { e.preventDefault(); if (innerWidth <= 760) document.body.classList.add('recherche-ouverte'); q.focus(); }
    else if (e.key === 'PageDown') { e.preventDefault(); arreterVisite(); choisir(cur + 1); }
    else if (e.key === 'PageUp') { e.preventDefault(); arreterVisite(); choisir(cur - 1); }
    else if (e.key === '?') aide(true);
    else if (e.key === 'h' || e.key === 'H') immersif(!document.body.classList.contains('immersif'));
    else if (e.key === 'v' || e.key === 'V') vol(true);
  });

  // ---------- « Aller à » : villes et lieux importants ----------
  $('#aller').innerHTML = `<button class="ensemble" data-accueil>${ic('home')}Vue d'ensemble du Hijaz</button>` + DESTINATIONS.map((g) => `<div class="groupe">${g.titre}</div><div class="puces">${
    g.lieux.map(([id, r, nom], k) => `<button data-id="${id}" data-r="${r || ''}" style="--k:${k}">${esc(nom || LIEUX[id].nom)}</button>`).join('')}</div>`).join('');
  function allerA(ouvert) {
    $('#aller').hidden = !ouvert;
    $('#allerBtn').setAttribute('aria-expanded', ouvert);
  }
  $('#allerBtn').onclick = (e) => { e.stopPropagation(); allerA($('#aller').hidden); };
  $('#aller').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    arreterVisite(); clearTimeout(suiteBataille); allerA(false);
    if (b.dataset.accueil != null) { carte.accueil(); return; }
    ficheLieu(b.dataset.id, { r: +b.dataset.r || undefined });
    if (b.dataset.id === 'madinah' || b.dataset.id === 'makkah') $('#dTitre').textContent = b.textContent; // la Ka'ba, la Mosquée…
  };
  addEventListener('pointerdown', (e) => { if (!$('#aller').hidden && !e.target.closest('#aller, #allerBtn')) allerA(false); });

  // ---------- aide à la navigation (montrée une fois, puis sur demande) ----------
  const tactile = matchMedia('(pointer: coarse)').matches;
  $('#aideListe').innerHTML = (tactile ? [
    ['Un doigt', 'déplacer la carte'], ['Deux doigts', 'zoomer, tourner, incliner'], ['Double tape', "s'approcher"],
    ['Toucher une épingle', 'fiche du lieu'], ['Aller à', 'villes et lieux importants'],
  ] : [
    ['Glisser', 'déplacer la carte'], ['Molette', 'zoomer vers le pointeur'], ['Clic droit + glisser', 'tourner, incliner'],
    ['Double-clic', "s'approcher"], ['Clic sur une épingle', 'fiche du lieu'], ['Aller à', 'villes et lieux importants'],
    ['← ↑ → ↓  + −', 'se déplacer, zoomer'], ['Page ↑ ↓', 'événement précédent, suivant'], ['V · H', 'vol libre · masquer l\'interface'],
  ]).map(([k, t]) => `<dt>${esc(k)}</dt><dd>${esc(t)}</dd>`).join('');
  function aide(ouvert) {
    $('#aide').hidden = !ouvert;
    if (!ouvert) try { localStorage.setItem(AIDE_VUE, '1'); } catch { /* stockage indisponible */ }
  }
  $('#aideBtn').onclick = () => aide($('#aide').hidden);
  function aidePremiereFois() {
    let vue = false;
    try { vue = localStorage.getItem(AIDE_VUE) === '1'; } catch { /* stockage indisponible */ }
    if (!vue) setTimeout(() => { if (!document.body.classList.contains('histoire')) aide(true); }, 3200);
  }
  $('#aideOk').onclick = () => aide(false);

  // ---------- liens directs : #evenement/badr, #lieu/uhud ----------
  function lireLien() {
    const [type, id] = decodeURIComponent(location.hash.slice(1)).split('/');
    if (type === 'evenement' && id in D.INDEX) { choisir(D.INDEX[id], { sansLien: true }); return true; }
    if (type === 'lieu' && LIEUX[id]) return ficheLieu(id, { sansLien: true });
    return false;
  }
  addEventListener('hashchange', () => { arreterVisite(); lireLien(); });

  // Zone de la carte laissée libre par les panneaux (pour centrer la vue dedans).
  function zoneLibre(w, h) {
    const b = document.body.classList;
    // mode histoire : sous le bandeau du jeu, au-dessus du dialogue
    if (b.contains('histoire')) {
      const tel = w <= 760;
      return { l: 0, r: w, t: b.contains('jeu-consigne') ? (tel ? 150 : 170) : 64, b: h - (b.contains('jeu-options') ? (tel ? 400 : 340) : b.contains('jeu-consigne') ? 24 : (tel ? 250 : 210)) };
    }
    if (b.contains('immersif') || b.contains('vol')) return { l: 0, r: w, t: 0, b: h };
    const rect = (s) => $(s).getBoundingClientRect();
    let l = 0, r = w, t = rect('.barre').bottom + 8, bas = rect('#ruban').top - 8;
    if (!$('#tiroir').hidden) l = rect('#tiroir').right + 8;
    if (!b.contains('recit-ferme')) {
      const rc = rect('#recit');
      if (w > 760) r = rc.left - 8; else bas = Math.min(bas, rc.top - 8);
    }
    if (bas - t < 140) t = Math.max(0, bas - 140);
    if (r - l < 200) l = Math.max(0, r - 200);
    return { l, r, t, b: bas };
  }
  addEventListener('resize', () => { placerPoints(); if (cur >= 0) ruban(); carte && carte.rafraichirVue(); });

  const api = {
    zoneLibre,
    surImage,
    arreterVisite: () => { arreterVisite(); clearTimeout(suiteBataille); },
    choisirLieu: (id) => { arreterVisite(); ficheLieu(id); },
    // Retour du mode histoire : thème de l'utilisateur, puis l'événement du chapitre quitté.
    ouvrirCarte(idEv) {
      appliquerTheme(); aidePremiereFois();
      const i = idEv && idEv in D.INDEX ? D.INDEX[idEv] : cur >= 0 ? cur : D.INDEX.hijra;
      choisir(i);
    },
    demarrer(c, { vue: vueInitiale = true } = {}) {
      carte = c;
      fondMini = carte.apercu();
      if (innerWidth <= 760) miniVisible(false);
      appliquerTheme();
      if (vueInitiale) aidePremiereFois();
      if (vueInitiale && lireLien()) return;
      // Ouverture : vue d'ensemble, puis la Hijra (ou l'écran titre du mode histoire, qui prend la main).
      const i = D.INDEX.hijra;
      choisir(i, { sansVol: true, sansLien: true });
      carte.placer(1250, -0.1, 0.72);
      if (vueInitiale) setTimeout(() => carte.cadrer(EV[i], 2600), 300);
    },
  };
  return api;
}
