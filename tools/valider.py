#!/usr/bin/env python3
"""Vérifie les fiches de data/ avant publication (bibliothèque standard uniquement).

Erreurs (bloquantes) : champ manquant, lieu ou ouvrage inconnu, statut invalide,
« Prophète » sans ﷺ, fiche « validé » sans numéro de page, position hors de la carte…
Avertissements : pages à compléter, fiches encore à vérifier.

Usage : python3 tools/valider.py
"""
import json
import re
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
STATUTS = {"à vérifier", "validé"}
CERTITUDES = {"certaine", "probable", "discutée"}
# « Prophète » ou « Messager d'Allah » doivent être suivis de ﷺ (pas « prophétie », « prophètes »).
SANS_SALAT = re.compile(r"(Prophète|Messager d'Allah|Rasûl)(?!s)(?! ?ﷺ)")

erreurs, avertissements = [], []


def err(ou, msg):
    erreurs.append(f"{ou} : {msg}")


def avert(ou, msg):
    avertissements.append(f"{ou} : {msg}")


def lire(nom):
    try:
        return json.loads((DATA / nom).read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"ERREUR {nom} : JSON invalide ligne {e.lineno}, colonne {e.colno} ({e.msg})")
        sys.exit(1)


def textes(obj):
    """Toutes les chaînes d'une fiche (pour la vérification de ﷺ)."""
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from textes(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from textes(v)


def verifier_salat(ou, fiche):
    for t in textes(fiche):
        for m in SANS_SALAT.finditer(t):
            err(ou, f"« {m.group(1)} » sans ﷺ : …{t[max(0, m.start() - 20):m.end() + 20]}…")


def verifier_sources(ou, fiche, ouvrages):
    sources = fiche.get("sources") or []
    if not sources:
        err(ou, "aucune source citée")
    for s in sources:
        if s.get("ouvrage") not in ouvrages:
            err(ou, f"ouvrage inconnu « {s.get('ouvrage')} » (à déclarer dans sources.json)")
        if s.get("page") is None:
            if fiche.get("statut") == "validé":
                err(ou, f"fiche validée mais page manquante pour « {s.get('ouvrage')} »")
            else:
                avert(ou, f"page à compléter ({s.get('ouvrage')})")
    if fiche.get("statut") not in STATUTS:
        err(ou, f"statut « {fiche.get('statut')} » invalide (attendu : {', '.join(sorted(STATUTS))})")


def main():
    lieux_f, ev_f, had_f, src_f = (lire(n) for n in ("lieux.json", "evenements.json", "hadiths.json", "sources.json"))
    relief = lire("relief/hijaz.json")["emprise"]
    ouvrages = src_f["ouvrages"]
    dans_carte = lambda lat, lon: relief["sud"] <= lat <= relief["nord"] and relief["ouest"] <= lon <= relief["est"]

    lieux = {}
    for l in lieux_f["lieux"]:
        ou = f"lieu {l.get('id', '?')}"
        for champ in ("id", "nom", "nom_ar", "lat", "lon", "niveau", "certitude", "statut"):
            if champ not in l:
                err(ou, f"champ « {champ} » manquant")
        if l.get("id") in lieux:
            err(ou, "identifiant en double")
        lieux[l.get("id")] = l
        if l.get("certitude") not in CERTITUDES:
            err(ou, f"certitude « {l.get('certitude')} » invalide (attendu : {', '.join(sorted(CERTITUDES))})")
        if l.get("niveau") not in (1, 2, 3):
            err(ou, "niveau attendu : 1, 2 ou 3")
        if "hors_carte" in l:
            if not dans_carte(*l["hors_carte"]["ancre"]):
                err(ou, "l'ancre d'un lieu hors carte doit être dans le cadre de la carte")
        elif not dans_carte(l.get("lat", 0), l.get("lon", 0)):
            err(ou, "position hors du cadre de la carte (ajouter « hors_carte » avec une ancre)")
        verifier_sources(ou, l, ouvrages)
        verifier_salat(ou, l)
    etapes = {k: v for k, v in lieux_f.get("etapes", {}).items() if not k.startswith("_")}
    for k, e in etapes.items():
        if not dans_carte(e["lat"], e["lon"]):
            err(f"étape {k}", "position hors du cadre de la carte")

    hadiths = {h["id"]: h for h in had_f["hadiths"]}
    evenements = ev_f["evenements"]
    ids = [e.get("id") for e in evenements]
    for e in evenements:
        ou = f"événement {e.get('id', '?')}"
        for champ in ("id", "categorie", "titre", "titre_ar", "lieu", "date", "annee_ap_jc", "age", "periode", "faits", "resume", "statut"):
            if champ not in e:
                err(ou, f"champ « {champ} » manquant")
        if ids.count(e.get("id")) > 1:
            err(ou, "identifiant en double")
        if e.get("categorie") not in ev_f["categories"]:
            err(ou, f"catégorie « {e.get('categorie')} » inconnue")
        if e.get("lieu") not in lieux:
            err(ou, f"lieu « {e.get('lieu')} » inconnu")
        if e.get("periode") not in ("avant", "mecquoise", "medinoise"):
            err(ou, "période attendue : avant, mecquoise ou medinoise")
        for h in e.get("hadiths", []):
            if h not in hadiths:
                err(ou, f"hadith « {h} » inconnu")
        if "trajet" in e:
            if e["trajet"].get("type") not in ("caravane", "armee", "mer", "nuit"):
                err(ou, "type de trajet attendu : caravane, armee, mer ou nuit")
            for p in e["trajet"].get("etapes", []):
                if isinstance(p, list):
                    if len(p) != 2 or not dans_carte(*p):
                        err(ou, f"point de trajet {p} invalide ou hors de la carte")
                elif p not in lieux and p not in etapes:
                    err(ou, f"étape de trajet « {p} » inconnue")
        for d in e.get("divergences", []):
            if not d.get("sujet") or not d.get("texte"):
                err(ou, "divergence sans « sujet » ou sans « texte »")
        verifier_sources(ou, e, ouvrages)
        verifier_salat(ou, e)
    for j in ev_f.get("jalons", []):
        if j["evenement"] not in ids:
            err("jalons", f"événement « {j['evenement']} » inconnu")

    for h in had_f["hadiths"]:
        ou = f"hadith {h['id']}"
        if h.get("ouvrage") == "umda" and h.get("page") is not None and h.get("page_pdf") != h["page"] - 10:
            err(ou, "al-'Umda : la page du PDF doit valoir la page imprimée - 10")
        for ev in h.get("evenements", []):
            if ev not in ids:
                err(ou, f"événement « {ev} » inconnu")
        if h.get("statut") not in STATUTS:
            err(ou, "statut invalide")
        verifier_salat(ou, h)

    for id_ev, B in lire("batailles.json")["batailles"].items():
        ou = f"bataille {id_ev}"
        if id_ev not in ids:
            err(ou, "aucun événement ne porte cet identifiant")
        for u_id, u in B.get("unites", {}).items():
            if u.get("camp") not in B.get("camps", {}):
                err(ou, f"unité « {u_id} » : camp inconnu")
            if u.get("forme") not in ("infanterie", "archers", "cavalerie", "caravane"):
                err(ou, f"unité « {u_id} » : forme attendue infanterie, archers, cavalerie ou caravane")
        for k, P in enumerate(B.get("phases", []), 1):
            for u_id, pos in P.get("positions", {}).items():
                if u_id not in B.get("unites", {}):
                    err(ou, f"étape {k} : unité « {u_id} » inconnue")
                elif not dans_carte(pos[0], pos[1]):
                    err(ou, f"étape {k} : position de « {u_id} » hors de la carte")
            for f in P.get("fleches", []):
                if f.get("camp") not in B.get("camps", {}):
                    err(ou, f"étape {k} : flèche d'un camp inconnu")
                if any(not dans_carte(*pt) for pt in f.get("points", [])):
                    err(ou, f"étape {k} : flèche hors de la carte")
        verifier_sources(ou, B, ouvrages)
        verifier_salat(ou, B)

    a_verifier = sum(1 for e in evenements if e.get("statut") != "validé")
    pages = sum(1 for a in avertissements if "page à compléter" in a)
    print(f"{len(evenements)} événements, {len(lieux)} lieux, {len(hadiths)} hadiths, {len(ouvrages)} ouvrages.")
    print(f"{a_verifier} événement(s) à vérifier ; {pages} référence(s) sans numéro de page.")
    for a in avertissements:
        if "page à compléter" not in a:
            print("  avertissement –", a)
    if erreurs:
        print(f"\n{len(erreurs)} erreur(s) :")
        for e in erreurs:
            print("  ERREUR –", e)
        sys.exit(1)
    print("Aucune erreur.")


if __name__ == "__main__":
    main()
