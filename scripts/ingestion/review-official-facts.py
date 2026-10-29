#!/usr/bin/env python3
"""Validate collected official-site facts and write review-only candidate files.

Input: a directory of collector JSON files (one array per batch) and the target list.
Output: data/review/<batch>/ with observations ready for stage_observations, requirement and
deadline candidates (needs_review), and every rejected item with its reason.
Nothing here is loaded by the app or published; staff review decides.
"""
import argparse, datetime, json, re, sys, uuid
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
NS = uuid.UUID("6f1f3f7e-6c1b-5c7e-9a43-2f4f0c3a9e10")
CURRENCIES = {"GBP", "EUR", "CHF", "AUD", "CAD", "JPY", "CNY", "RMB", "HKD", "SGD", "KRW", "NZD", "SEK", "DKK", "NOK", "USD", "MYR", "TWD", "ILS", "AED", "SAR", "QAR", "INR", "BRL", "MXN", "CZK", "PLN", "HUF", "RUB", "TRY", "ZAR", "THB", "IDR", "PHP", "VND", "CLP", "ARS", "COP", "EGP", "PKR", "KZT", "MOP", "BND"}
# Hosts that are never official university sources even when a collector cites them.
BLOCKED = re.compile(r"(topuniversities|timeshighereducation|studyportals|mastersportal|bachelorsportal|globalscholarships|collegedunia|shiksha|wikipedia|unipage|leverage|yocket|idp\.com|studyinternational|edurank|usnews|niche\.com)", re.I)


def host_ok(url, domains):
    try:
        p = urlparse(url)
    except ValueError:
        return False
    if p.scheme != "https" or not p.hostname or BLOCKED.search(p.hostname):
        return False
    h = p.hostname.lower()
    if any(h == d or h.endswith("." + d) for d in domains):
        return True
    return bool(re.search(r"\.(gov|gouv|gob|go|govt)(\.[a-z]{2})?$|\.gov\.[a-z]{2}$", h))


def digits(s):
    return re.sub(r"[^0-9]", "", s)


def in_quote(value, quote):
    """The reported number must appear in the verbatim quote (separator-insensitive)."""
    if not isinstance(value, (int, float)) or not quote:
        return False
    v = float(value)
    forms = {str(int(v))} if v == int(v) else {str(v), str(v).replace(".", ",")}
    flat = digits(quote)
    for f in forms:
        if "." in f or "," in f:
            if f in quote:
                return True
        elif f == "0":
            if re.search(r"\b0\b|free|no tuition|kostenlos|gebührenfrei", quote, re.I):
                return True
        elif f in flat:
            return True
    return False


def start_year(academic_year):
    m = re.search(r"(20\d\d)", str(academic_year or ""))
    return int(m.group(1)) if m else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="directory of collector JSON files")
    ap.add_argument("--targets", required=True)
    ap.add_argument("--batch", default="official-sites-2026-10")
    ap.add_argument("--checked-at", default="2026-10-29")
    a = ap.parse_args()

    directory = {r["id"]: r for r in json.loads((ROOT / "data/published/global-directory.json").read_text())}
    targets = {t["university_id"]: t for t in json.loads(Path(a.targets).read_text())}
    observations, requirements, deadlines, types, rejected = [], [], [], [], []
    seen_unis, covered = set(), set()

    def reject(u, kind, item, reason):
        rejected.append({"university_id": u, "kind": kind, "reason": reason, "item": item})

    for f in sorted(Path(a.input).glob("*.json")):
        try:
            rows = json.loads(f.read_text())
        except json.JSONDecodeError as e:
            print(f"{f.name}: invalid JSON ({e})", file=sys.stderr)
            continue
        for row in rows if isinstance(rows, list) else []:
            u = row.get("university_id")
            if u not in targets or u not in directory:
                reject(u, "university", {"name": row.get("name")}, "unknown university id")
                continue
            seen_unis.add(u)
            uni = directory[u]
            domains = {d.lower() for d in uni.get("domains") or []}
            host = urlparse(uni.get("website") or "").hostname
            if host:
                domains.add(host.lower().removeprefix("www."))

            def base(kind, item):
                url, quote = item.get("source_url") or "", (item.get("quote") or "").strip()
                if not host_ok(url, domains):
                    reject(u, kind, item, "source is not on the official domain")
                    return None
                if not quote or len(quote) > 400:
                    reject(u, kind, item, "missing or overlong verbatim quote")
                    return None
                return url, quote

            for t in row.get("tuition") or []:
                ok = base("tuition", t)
                if not ok:
                    continue
                url, quote = ok
                amount, cur = t.get("amount"), str(t.get("currency") or "").upper().replace("RMB", "CNY")
                year = start_year(t.get("academic_year"))
                if cur not in CURRENCIES or not isinstance(amount, (int, float)) or amount < 0 or amount > 1e8:
                    reject(u, "tuition", t, "invalid amount or currency")
                elif year not in (2025, 2026, 2027):
                    reject(u, "tuition", t, "academic year missing or outside 2025-2027")
                elif t.get("period", "year") != "year":
                    reject(u, "tuition", t, "not an annual figure")
                elif not in_quote(amount, quote):
                    reject(u, "tuition", t, "amount does not appear in the quote")
                else:
                    label = t.get("label") or "annual"
                    observations.append({
                        "university_id": u, "metric": "tuition", "year": year, "value": amount, "unit": cur,
                        "source_url": url,
                        "notes": f"International undergraduate tuition, {t.get('academic_year')} ({label}). "
                        f"{(t.get('notes') or '').strip()} Quote: \"{quote}\" Collected {a.checked_at} by an automated assistant from the official site; confirm programme, residency and year before approving.".replace("  ", " ")[:2000],
                    })
                    covered.add(u)

            for e in row.get("english") or []:
                ok = base("english", e)
                if not ok:
                    continue
                url, quote = ok
                kind, minimum = str(e.get("kind") or "").upper(), e.get("minimum")
                bounds = {"IELTS": (4, 9), "TOEFL": (30, 120)}
                if kind not in bounds or not isinstance(minimum, (int, float)) or not bounds[kind][0] <= minimum <= bounds[kind][1]:
                    reject(u, "english", e, "unsupported test or score out of range")
                elif not in_quote(minimum, quote):
                    reject(u, "english", e, "score does not appear in the quote")
                else:
                    requirements.append({
                        "id": str(uuid.uuid5(NS, f"req:{u}:{kind}:{url}")), "university_id": u, "program_id": None,
                        "kind": kind, "label": ("IELTS Academic · overall" if kind == "IELTS" else "TOEFL iBT · total"),
                        "minimum": minimum, "maximum": None, "student_category": "Undergraduate applicants who need English proficiency evidence",
                        "required": None, "year": None, "source_url": url, "verification_status": "needs_review",
                        "verified_at": None, "notes": (e.get("notes") or "").strip()[:1000], "quote": quote, "collected_at": a.checked_at,
                    })
                    covered.add(u)

            for d in row.get("deadline") or []:
                ok = base("deadline", d)
                if not ok:
                    continue
                url, quote = ok
                try:
                    due = datetime.date.fromisoformat(str(d.get("due_at"))[:10])
                except ValueError:
                    reject(u, "deadline", d, "invalid date")
                    continue
                if not datetime.date(2026, 10, 1) <= due <= datetime.date(2027, 12, 31):
                    reject(u, "deadline", d, "date is past or outside the 2027 cycle")
                    continue
                if not (str(due.day) in quote or f"{due.day:02d}" in quote):
                    reject(u, "deadline", d, "day does not appear in the quote")
                    continue
                deadlines.append({
                    "id": str(uuid.uuid5(NS, f"date:{u}:{due}:{url}")), "university_id": u,
                    "title": (d.get("title") or "Undergraduate application deadline")[:200],
                    "student_category": "International undergraduate applicants", "cycle": d.get("cycle") or "2027 entry",
                    "due_at": due.isoformat(), "timezone": None, "application_url": url, "year": due.year if due.month >= 9 else due.year,
                    "source_url": url, "verification_status": "needs_review", "verified_at": None,
                    "notes": ("Date only; confirm the exact cutoff time. " + (d.get("notes") or "")).strip()[:1000],
                    "quote": quote, "collected_at": a.checked_at,
                })
                covered.add(u)

            t = row.get("type")
            if isinstance(t, dict) and t.get("value"):
                ok = base("type", t)
                if ok:
                    if str(t["value"]).lower() not in ("public", "private"):
                        reject(u, "type", t, "type must be public or private")
                    else:
                        types.append({"university_id": u, "university_type": t["value"].lower(), "source_url": ok[0], "quote": ok[1],
                                      "verification_status": "needs_review", "collected_at": a.checked_at})
                        covered.add(u)

    out = ROOT / "data/review" / a.batch
    out.mkdir(parents=True, exist_ok=True)
    key = lambda r: (targets[r["university_id"]]["best_rank"], r["university_id"]) if r.get("university_id") in targets else (10**6, "")
    for name, rows in [("observations", observations), ("requirements", requirements), ("deadlines", deadlines),
                       ("institution-types", types), ("rejected", rejected)]:
        rows.sort(key=key)
        (out / f"{name}.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1) + "\n")
    summary = {
        "batch": a.batch, "checked_at": a.checked_at, "targets": len(targets), "returned": len(seen_unis),
        "universities_with_facts": len(covered), "tuition_observations": len(observations),
        "english_requirements": len(requirements), "deadlines": len(deadlines), "institution_types": len(types),
        "rejected": len(rejected), "missing_universities": sorted(targets[u]["name"] for u in set(targets) - seen_unis),
        "status": "needs_review · not published",
    }
    (out / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps({k: v for k, v in summary.items() if k != "missing_universities"}))


if __name__ == "__main__":
    main()
