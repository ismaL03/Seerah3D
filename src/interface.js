// Interface : fiche détaillée, indicateurs, frise, listes, recherche, visite guidée, liens directs.
import { ic, remplirIcones } from './icones.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’`ʿʾ]/g, '').toLowerCase();
const PERIODES = { avant: 'Avant la prophétie', mecquoise: 'Mecquoise', medinoise: 'Médinoise' };
const CERTITUDE = { 'certaine': 'certaine', 'probable': 'probable', 'discutée': 'discutee' };
const VUES = [['', 'Vue générale du Hijaz'], ['makkah', 'La Mecque'], ['madinah', 'Médine'], ['badr', 'Badr'], ['taif', "Tâ'if"], ['khaybar', 'Khaybar'], ['hudaybiya', 'al-Hudaybiya']];

export function creerInterface(D) {
  const { EVENEMENTS: EV, LIEUX, HADITHS, CATEGORIES: CAT, OUVRAGES } = D;
  let carte = null, cur = -1, onglet = 'ev', visite = null;
  // Événements liés à un lieu : ceux qui s'y déroulent, puis ceux dont le trajet y passe.
  const evDuLieu = (id) => EV.map((e, i) => [e, i]).filter(([e]) => e.lieu === id || (e.trajet && e.trajet.etapes.includes(id)));
  const lieuxAvecEv = Object.keys(LIEUX).filter((k) => evDuLieu(k).length);
  const aVerifier = EV.filter((e) => e.statut !== 'validé').length;

  remplirIcones();
  $('#nEv').textContent = EV.length;
  $('#nLoc').textContent = lieuxAvecEv.length;
  $('#nHad').textContent = Object.keys(HADITHS).length;
  $('#srcSub').textContent = aVerifier ? `${aVerifier} sur ${EV.length} à vérifier` : 'Toutes validées';
  $('#view').innerHTML = VUES.map((v) => `<option value="${v[0]}">${v[1]}</option>`).join('');

  const couleur = (cat) => getComputedStyle(document.documentElement).getPropertyValue('--c-' + cat).trim() || '#C9962F';
  const annee = (e) => (e.annee_hegire ? `${e.annee_hegire} H` : e.annee_ap_jc);

  function toast(texte) {
    const t = $('#toast'); t.textContent = texte; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 1800);
  }

  function statutHTML(statut) {
    return statut === 'validé' ? `<span class="statut valide">${ic('check')}Validé</span>` : `<span class="statut brouillon">${ic('alert')}Brouillon · à vérifier</span>`;
  }
  function sourceHTML(s) {
    const o = OUVRAGES[s.ouvrage] || { titre: s.ouvrage };
    const page = s.page != null ? `p. ${esc(s.page)}` : '<span class="manque">page à compléter</span>';
    return `<li><b>${esc(o.titre)}</b>${o.auteur ? ` — ${esc(o.auteur)}` : ''}${s.passage ? ` · <i>${esc(s.passage)}</i>` : ''} · ${page}</li>`;
  }
  function hadithHTML(id) {
    const h = HADITHS[id];
    return `<div class="umda" id="umda-${id}"><div class="uh">${ic('book')}al-'Umda fî al-Ahkâm<span>n° ${h.numero} · p. ${h.page} (PDF p. ${h.page_pdf})</span></div>
      <div class="uar" lang="ar">${esc(h.ar)}</div><p class="ufr">${esc(h.fr)}</p><div class="unr">Rapporté par ${esc(h.rapporteur)} · ${esc(h.livre)} · traduction à vérifier</div></div>`;
  }

  // ---------- sélection d'un événement ----------
  function choisir(i, opts = {}) {
    i = (i + EV.length) % EV.length; cur = i;
    const ev = EV[i], L = LIEUX[ev.lieu], c = CAT[ev.categorie];
    document.body.classList.remove('noDetail');
    const det = $('#detail'); det.className = 'detail card cat-' + ev.categorie;
    $('#dIcon').innerHTML = ic(c.icone);
    $('#dCat').textContent = `${c.nom} · ${L.nom}`;
    $('#dTitle').textContent = ev.titre;
    $('#dSub').textContent = `#${String(i + 1).padStart(2, '0')} · ${ev.date}`;
    $('#dAr').textContent = ev.titre_ar;
    $('#dChip').textContent = c.nom;
    $('#dStatut').innerHTML = statutHTML(ev.statut);
    $('#dPlace').textContent = `${L.nom} · ${ev.annee_ap_jc}`;
    const lignes = [['Date', ev.date], ['Année', ev.annee_ap_jc + ' apr. J.-C.'], ['Lieu', L.nom], ['Âge du Prophète ﷺ', ev.age === 0 ? 'Naissance' : ev.age + ' ans']].concat(ev.faits);
    $('#dRows').innerHTML = lignes.map((r) => `<div><dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd></div>`).join('');
    $('#dSummary').textContent = ev.resume;
    $('#dQuran').innerHTML = ev.coran ? `<span class="chip">${ic('book')} Coran</span>Sourate ${esc(ev.coran)}` : '';
    $('#dDiv').innerHTML = ev.divergences && ev.divergences.length
      ? `<div class="bloc div"><h3>${ic('split')}Divergences signalées</h3><ul>${ev.divergences.map((d) => `<li><b>${esc(d.sujet)} :</b> ${esc(d.texte)}</li>`).join('')}</ul></div>` : '';
    $('#dUmda').innerHTML = (ev.hadiths || []).map(hadithHTML).join('');
    $('#dLieu').innerHTML = `<div class="bloc"><h3>${ic('pin')}Localisation · ${esc(L.nom)}</h3>
      <span class="certitude ${CERTITUDE[L.certitude] || ''}">${esc(L.certitude)}</span>
      ${L.note_localisation ? `<p class="note">${esc(L.note_localisation)}</p>` : ''}
      ${ev.trajet && ev.trajet.note ? `<p class="note">${esc(ev.trajet.note)}</p>` : ''}</div>`;
    $('#dSrc').innerHTML = `<div class="bloc"><h3>${ic('book')}Sources</h3><ul>${ev.sources.map(sourceHTML).join('')}</ul>
      ${ev.statut !== 'validé' ? '<p class="note">Brouillon rédigé d\'après ces sources, en attente de validation par un enseignant.</p>' : ''}</div>`;
    const autres = EV.map((e, k) => [e, k]).filter(([e, k]) => e.lieu === ev.lieu && k !== i);
    $('#dAlso').innerHTML = autres.length ? 'Aussi ici :' + autres.map(([e, k]) => `<button data-i="${k}">${esc(e.titre)}</button>`).join('') : '';
    $('#dAlso').querySelectorAll('button').forEach((b) => (b.onclick = () => choisir(+b.dataset.i)));
    det.scrollTop = 0;
    if (opts.hadith) { const el = document.getElementById('umda-' + opts.hadith); if (el) det.scrollTop = el.offsetTop - 80; }
    // indicateurs
    $('#kAge').textContent = ev.age === 0 ? 'Naissance' : `${ev.age} ans`;
    $('#kYear').textContent = annee(ev);
    $('#kYearS').textContent = ev.annee_hegire ? ev.annee_ap_jc + ' apr. J.-C.' : "apr. J.-C. · avant l'Hégire";
    $('#kPer').textContent = PERIODES[ev.periode] || ev.periode;
    $('#kPerS').textContent = ev.periode_detail || '—';
    $('#eraText').textContent = ev.annee_hegire ? 'An ' + annee(ev) : ev.annee_ap_jc;
    $('#siteBadge').textContent = L.code || 'HJZ';
    $('#siteName').textContent = L.nom;
    const n = EV.filter((e) => e.lieu === ev.lieu).length;
    $('#siteSub').textContent = n + (n > 1 ? ' événements ici' : ' événement ici');
    $('#view').value = VUES.some((v) => v[0] === ev.lieu) ? ev.lieu : '';
    frise(); liste();
    if (!opts.sansLien) history.replaceState(null, '', '#evenement/' + ev.id);
    carte.selectionner(ev, i, couleur(ev.categorie));
    if (!opts.sansVol) carte.cadrer(ev, opts.duree);
  }

  function choisirLieu(id) {
    const liste = evDuLieu(id);
    if (!liste.length) return false;
    const suivant = liste.find(([e, i]) => i > cur && e.lieu === id) || liste.find(([e]) => e.lieu === id) || liste[0];
    choisir(suivant[1], { sansLien: true });
    history.replaceState(null, '', '#lieu/' + id);
    mobile('detail');
    return true;
  }

  // ---------- frise ----------
  function frise() {
    const ev = EV[cur];
    $('#tMeta').textContent = `Événement ${cur + 1} / ${EV.length} · ${ev.annee_ap_jc}`;
    let jc = 0; D.JALONS.forEach((j, k) => { if (j.i <= cur) jc = k; });
    $('#stepper').innerHTML = D.JALONS.map((j, k) => `<li class="step ${k < jc ? 'done' : k === jc ? 'cur' : ''}"><button data-i="${j.i}"><span class="node">${ic(CAT[EV[j.i].categorie].icone)}</span><span class="lb">${esc(j.nom)}</span><span class="yr">${esc(EV[j.i].annee_hegire ? EV[j.i].annee_ap_jc + ' · ' + annee(EV[j.i]) : EV[j.i].annee_ap_jc)}</span></button></li>`).join('');
    $('#stepper').querySelectorAll('button').forEach((b) => (b.onclick = () => { arreterVisite(); choisir(+b.dataset.i); }));
    const ni = (cur + 1) % EV.length, n = EV[ni], nc = $('#nextCard');
    nc.className = 'nextcard cat-' + n.categorie;
    nc.innerHTML = `<span class="ni">${ic(CAT[n.categorie].icone)}</span><span class="nc"><small>${ni === 0 ? 'Recommencer' : 'Événement suivant'}</small><b>${esc(n.titre)}</b><span class="chip">${esc(CAT[n.categorie].nom)}</span><div class="ns">${esc(LIEUX[n.lieu].nom)} · ${esc(n.annee_ap_jc)}</div></span>${ic('chev')}`;
    nc.onclick = () => { arreterVisite(); choisir(ni); };
    $('#track').innerHTML = EV.map((e, k) => `<button class="cat-${e.categorie} ${k < cur ? 'past' : ''} ${k === cur ? 'on' : ''}" data-i="${k}" title="${esc(e.titre)} · ${esc(e.annee_ap_jc)}" aria-label="${esc(e.titre)}"><i></i></button>`).join('');
    $('#track').querySelectorAll('button').forEach((b) => (b.onclick = () => { arreterVisite(); choisir(+b.dataset.i); }));
  }

  // ---------- listes ----------
  function liste() {
    const corps = $('#lbody'); let h = '';
    if (onglet === 'ev') h = EV.map((e, k) => `<button class="row cat-${e.categorie} ${k === cur ? 'on' : ''}" data-i="${k}"><span class="c1"><b>#${String(k + 1).padStart(2, '0')}</b><small>${esc(e.annee_ap_jc)}</small></span><span class="c2"><i class="d"></i><span>${esc(e.titre)}</span><span class="ar" lang="ar">${esc(e.titre_ar)}</span></span><span class="chip">${esc(CAT[e.categorie].nom)}</span>${ic('chev')}</button>`).join('');
    if (onglet === 'loc') h = lieuxAvecEv.map((k) => {
      const L = LIEUX[k], n = evDuLieu(k).length, on = EV[cur].lieu === k;
      return `<button class="row ${on ? 'on' : ''}" data-l="${k}"><span class="c1"><b>${esc(L.code || (L.hors_carte ? 'Hors carte' : 'Lieu'))}</b><small class="certitude ${CERTITUDE[L.certitude]}">${esc(L.certitude)}</small></span><span class="c2"><i class="d"></i><span>${esc(L.nom)}</span><span class="ar" lang="ar">${esc(L.nom_ar)}</span></span><span class="chip">${n} évén.</span>${ic('chev')}</button>`;
    }).join('');
    if (onglet === 'had') h = Object.values(HADITHS).map((u) => {
      const e = EV[D.INDEX[u.evenements[0]]], on = u.evenements.includes(EV[cur].id);
      return `<button class="row cat-${e.categorie} ${on ? 'on' : ''}" data-u="${u.id}"><span class="c1"><b>n° ${u.numero}</b><small>p. ${u.page}</small></span><span class="c2"><i class="d"></i><span>${esc(u.titre)}</span></span><span class="chip">${esc(u.evenements.map((id) => EV[D.INDEX[id]].titre.replace(/^(Bataille d[eu']?|La |Conquête de |Pèlerinage d'|Départ des )\s?/, '')).join(' · '))}</span>${ic('chev')}</button>`;
    }).join('');
    if (onglet === 'src') {
      const usage = {};
      EV.forEach((e) => e.sources.forEach((s) => { const u = (usage[s.ouvrage] ||= { n: 0, sans: 0 }); u.n++; if (s.page == null) u.sans++; }));
      Object.values(LIEUX).forEach((l) => (l.sources || []).forEach((s) => { const u = (usage[s.ouvrage] ||= { n: 0, sans: 0 }); u.n++; if (s.page == null) u.sans++; }));
      h = Object.entries(OUVRAGES).filter(([k]) => usage[k] || k === 'umda').map(([k, o]) => {
        const u = usage[k] || { n: 0, sans: 0 }, nh = k === 'umda' ? Object.keys(HADITHS).length : 0;
        return `<div class="srcrow"><b>${esc(o.titre)}</b><small>${esc(o.auteur || '')}${o.edition ? ' · ' + esc(o.edition) : ' · <span class="manque">édition à préciser</span>'}</small><br><small>${u.n + nh} citation${u.n + nh > 1 ? 's' : ''}${u.sans ? ` · <span class="manque">${u.sans} page${u.sans > 1 ? 's' : ''} à compléter</span>` : ''}</small></div>`;
      }).join('') + `<p class="credits"><b>${aVerifier} fiche${aVerifier > 1 ? 's' : ''} sur ${EV.length}</b> en brouillon, à valider par un enseignant.<br>${D.DONNEES_CARTE.map((d) => `<b>${esc(d.nom)}</b> (${esc(d.usage.toLowerCase())}) : ${esc(d.attribution)}.`).join('<br>')}</p>`;
    }
    corps.innerHTML = h;
    corps.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => { arreterVisite(); choisir(+b.dataset.i); mobile('detail'); }));
    corps.querySelectorAll('[data-l]').forEach((b) => (b.onclick = () => { arreterVisite(); choisirLieu(b.dataset.l); }));
    corps.querySelectorAll('[data-u]').forEach((b) => (b.onclick = () => { arreterVisite(); const u = HADITHS[b.dataset.u]; choisir(D.INDEX[u.evenements[0]], { hadith: u.id }); mobile('detail'); }));
    const on = corps.querySelector('.on');
    if (on) { const top = on.offsetTop - corps.offsetTop; if (top < corps.scrollTop || top > corps.scrollTop + corps.clientHeight - 40) corps.scrollTop = top - 8; }
  }
  function ouvrirOnglet(t) {
    onglet = t;
    $('#lbody').scrollTop = 0;
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === t));
    liste();
  }
  document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => ouvrirOnglet(b.dataset.tab)));
  $('#srcBtn').onclick = () => { ouvrirOnglet('src'); mobile('list'); };

  // ---------- visite guidée ----------
  function boutonVisite() {
    $('#play').innerHTML = visite ? ic('pause') + 'Pause' : ic('play') + 'Visite guidée';
    $('#play').setAttribute('aria-label', visite ? 'Mettre la visite en pause' : 'Lancer la visite guidée');
  }
  function arreterVisite() { if (visite) { clearInterval(visite); visite = null; boutonVisite(); } }
  $('#play').onclick = () => {
    if (visite) return arreterVisite();
    choisir(cur + 1);
    visite = setInterval(() => choisir(cur + 1), 8000);
    boutonVisite();
  };
  boutonVisite();
  $('#prev').onclick = () => { arreterVisite(); choisir(cur - 1); };
  $('#next').onclick = () => { arreterVisite(); choisir(cur + 1); };
  $('#dClose').onclick = () => { document.body.classList.add('noDetail'); carte.rafraichirVue(); };
  $('#dFocus').onclick = () => { arreterVisite(); carte.zoomLieu(EV[cur].lieu); };
  $('#dLink').onclick = async () => {
    try { await navigator.clipboard.writeText(location.href); toast('Lien copié : ' + location.hash); }
    catch { toast('Lien : ' + location.href); }
  };

  // ---------- vues, carte, thème ----------
  $('#view').onchange = (e) => {
    const k = e.target.value; arreterVisite();
    if (!k) { carte.accueil(); $('#siteBadge').textContent = 'HJZ'; $('#siteName').textContent = 'Hijaz'; $('#siteSub').textContent = 'Vue générale'; return; }
    carte.vueLieu(k);
  };
  $('#zIn').onclick = () => carte.zoom(0.75);
  $('#zOut').onclick = () => carte.zoom(1.33);
  $('#rL').onclick = () => carte.pivoter(-Math.PI / 4);
  $('#rR').onclick = () => carte.pivoter(Math.PI / 4);
  $('#home').onclick = () => { arreterVisite(); carte.accueil(); };
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

  // ---------- mobile ----------
  function mobile(m) {
    document.body.dataset.m = m;
    document.querySelectorAll('.mtabs button').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
  }
  document.querySelectorAll('.mtabs button').forEach((b) => (b.onclick = () => { document.body.classList.remove('noDetail'); mobile(b.dataset.m); }));
  mobile('detail');

  // ---------- recherche ----------
  const q = $('#q'), res = $('#results'); let resultats = [], sel = 0;
  function chercher() {
    const brut = q.value.trim(), v = norm(brut);
    if (!v) { res.hidden = true; return; }
    resultats = [];
    EV.forEach((e, i) => {
      const texte = norm([e.titre, e.resume, e.date, e.annee_ap_jc, LIEUX[e.lieu].nom, e.faits.map((f) => f.join(' ')).join(' ')].join(' '));
      if (texte.includes(v) || e.titre_ar.includes(brut)) resultats.push({ t: 'e', i });
    });
    lieuxAvecEv.forEach((k) => { const L = LIEUX[k]; if (norm(L.nom).includes(v) || L.nom_ar.includes(brut)) resultats.push({ t: 'l', k }); });
    resultats = resultats.slice(0, 9); sel = 0;
    res.innerHTML = resultats.length ? resultats.map((r, j) => r.t === 'e'
      ? `<button class="res ${j === 0 ? 'on' : ''}" data-j="${j}">${ic(CAT[EV[r.i].categorie].icone)}<span class="t"><b>${esc(EV[r.i].titre)}</b><small>${esc(LIEUX[EV[r.i].lieu].nom)} · ${esc(EV[r.i].annee_ap_jc)}</small></span><span class="ar" lang="ar">${esc(EV[r.i].titre_ar)}</span></button>`
      : `<button class="res ${j === 0 ? 'on' : ''}" data-j="${j}">${ic('pin')}<span class="t"><b>${esc(LIEUX[r.k].nom)}</b><small>Lieu</small></span><span class="ar" lang="ar">${esc(LIEUX[r.k].nom_ar)}</span></button>`).join('')
      : `<div class="empty">Aucun résultat pour « ${esc(brut)} ». Essayez Badr, Hijra, Khadîja…</div>`;
    res.hidden = false;
    res.querySelectorAll('.res').forEach((b) => (b.onmousedown = (e) => { e.preventDefault(); aller(+b.dataset.j); }));
  }
  function aller(j) {
    const r = resultats[j]; if (!r) return;
    arreterVisite();
    if (r.t === 'e') { choisir(r.i); mobile('detail'); } else choisirLieu(r.k);
    q.value = ''; res.hidden = true; q.blur();
  }
  q.addEventListener('input', chercher);
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); aller(sel); }
    else if (e.key === 'Escape') { q.value = ''; res.hidden = true; q.blur(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); sel = Math.max(0, Math.min(resultats.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)));
      res.querySelectorAll('.res').forEach((b, j) => b.classList.toggle('on', j === sel));
    }
  });
  q.addEventListener('blur', () => setTimeout(() => (res.hidden = true), 120));
  addEventListener('keydown', (e) => {
    if (e.target === q || e.target.tagName === 'SELECT') return;
    if (e.key === '/') { e.preventDefault(); q.focus(); }
    else if (e.key === 'ArrowRight') { arreterVisite(); choisir(cur + 1); }
    else if (e.key === 'ArrowLeft') { arreterVisite(); choisir(cur - 1); }
    else if (e.key === 'Escape') { document.body.classList.add('noDetail'); carte && carte.rafraichirVue(); }
  });

  // ---------- liens directs : #evenement/badr, #lieu/uhud ----------
  function lireLien() {
    const [type, id] = decodeURIComponent(location.hash.slice(1)).split('/');
    if (type === 'evenement' && id in D.INDEX) { choisir(D.INDEX[id], { sansLien: true }); return true; }
    if (type === 'lieu' && LIEUX[id]) return choisirLieu(id);
    return false;
  }
  addEventListener('hashchange', () => { arreterVisite(); lireLien(); });

  // Zone de la carte laissée libre par les panneaux (pour centrer la vue).
  function zoneLibre(w, h) {
    const mob = w <= 900, det = !document.body.classList.contains('noDetail');
    let l, r, t, b;
    if (mob) { l = 0; r = w; t = 200; b = h - 76 - h * 0.38; }
    else { l = 16; r = det ? w - 16 - 372 - 24 : w - 16; t = 96 + ($('.kpis').offsetHeight || 86) + 8; b = h - 16 - $('#timeline').offsetHeight - 12; }
    if (b - t < 120) t = Math.max(0, b - 120);
    return { l, r, t, b };
  }
  addEventListener('resize', () => {
    document.documentElement.style.setProperty('--tlh', $('#timeline').offsetHeight + 'px');
    carte && carte.rafraichirVue();
  });
  document.documentElement.style.setProperty('--tlh', $('#timeline').offsetHeight + 'px');

  return {
    zoneLibre,
    arreterVisite,
    choisirLieu: (id) => { arreterVisite(); choisirLieu(id); },
    demarrer(c) {
      carte = c;
      appliquerTheme();
      if (lireLien()) return;
      // Ouverture : vue d'ensemble, puis la Hijra.
      const i = D.INDEX.hijra;
      choisir(i, { sansVol: true, sansLien: true });
      carte.placer(1250, -0.1, 0.72);
      setTimeout(() => carte.cadrer(EV[i], 2600), 300);
    },
  };
}
