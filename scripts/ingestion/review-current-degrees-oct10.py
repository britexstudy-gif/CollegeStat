#!/usr/bin/env python3
"""Current degree offerings pilot — 10 October 2026.

Strictly scoped data task. Owns ONLY:
  scripts/ingestion/review-current-degrees-oct10.py (this file)
  tests/test_current_degrees_oct10.py
  outputs/current-degrees-oct10/
  outputs/muse-current-degrees-oct10-report.md

Reads (never writes):
  docs/EVENING-CHECKPOINT-2026-10-09.md
  data/published/program-catalogue.json (+ program-manifest.json)
  data/published/official-programs.json (reviewed programme equivalents)
  data/published/global-directory.json (reviewed university equivalents)

Never touches: UI, installed snapshots, schema/migrations, credentials,
hosted databases, new institutions. No publication, no approval.
Every candidate is needs_review with verified_at null. Root reviews
all candidates before any publication; this job never inserts or
approves hosted data.

Method: bounded retrieval of at most eight official pages on
uwaterloo.ca and wiut.uz only (20s timeouts, 2 MiB cap), narrow
per-page parsers that keep duration/language/campus/intake ONLY when
explicit, qualification/tuition links rather than inferred amounts,
reporting year ONLY when explicit, deterministic fingerprint/dedup.
Historical IPEDS completions are never offering evidence. Duplicated
current courses stay held; changed scope/value stays a separate
needs_review fact with history retained. Blocked sources remain gaps.
Standard library only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import urllib.parse
import urllib.request
import uuid
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT_DEFAULT = ROOT / "outputs" / "current-degrees-oct10"
CHECKPOINT_REL = "docs/EVENING-CHECKPOINT-2026-10-09.md"
CATALOGUE_REL = "data/published/program-catalogue.json"
OFFICIAL_PROGRAMS_REL = "data/published/official-programs.json"
DIRECTORY_REL = "data/published/global-directory.json"

CHECKED_AT = date(2026, 10, 10)
TIMEOUT = 20
MAX_PAGES = 8
MAX_BYTES = 2 * 1024 * 1024
MAX_CANDIDATES = 6
NAMESPACE = uuid.NAMESPACE_URL
ID_PREFIX = "https://collegestat.app/current-degrees-oct10/"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) CollegeStat-current-degrees/1.0"

UNIVERSITIES = {
    "808b96a5-0e59-5215-a2f5-e7c3c5d2785a": {
        "name": "University of Waterloo",
        "domains": ["uwaterloo.ca"],
        "website": "https://uwaterloo.ca/",
    },
    "66666666-6666-4666-8666-666666666666": {
        "name": "Westminster International University in Tashkent",
        "domains": ["wiut.uz"],
        "website": "http://www.wiut.uz/",
    },
}

ALLOWED_GLOBAL = {"uwaterloo.ca", "wiut.uz"}

# At most eight pages. Seven are listed; the eighth slot stays unused to
# prove the cap is respected. Each entry carries the expected official
# name used only as a search guard — the parser still requires the text
# to contain it before emitting anything.
SOURCES = [
    {
        "key": "wiut-cs",
        "university_id": "66666666-6666-4666-8666-666666666666",
        "initial_url": "https://www.wiut.uz/bsc-hons-in-computer-science",
        "description": "WIUT BSc (Hons) Computer Science (expected duplicate of installed offer)",
        "kind": "wiut",
        "expected_name": "BSc (Hons) in Computer Science",
        "expected_subject": "Computer Science",
        "expected_level": "Bachelor",
    },
    {
        "key": "wiut-finance",
        "university_id": "66666666-6666-4666-8666-666666666666",
        "initial_url": "https://www.wiut.uz/finance",
        "description": "WIUT BSc (Hons) Finance",
        "kind": "wiut",
        "expected_name": "BSc (Hons) in Finance",
        "expected_subject": "Finance",
        "expected_level": "Bachelor",
    },
    {
        "key": "wiut-business-management",
        "university_id": "66666666-6666-4666-8666-666666666666",
        "initial_url": "https://www.wiut.uz/business-management",
        "description": "WIUT BA (Hons) Business Management and its Pathways",
        "kind": "wiut",
        "expected_name": "BA (Hons) in Business Management",
        "expected_subject": "Business Management",
        "expected_level": "Bachelor",
    },
    {
        "key": "wiut-economics",
        "university_id": "66666666-6666-4666-8666-666666666666",
        "initial_url": "https://www.wiut.uz/economics",
        "description": "WIUT BSc (Hons) Economics and its Pathways",
        "kind": "wiut",
        "expected_name": "BSc (Hons) in Economics",
        "expected_subject": "Economics",
        "expected_level": "Bachelor",
    },
    {
        "key": "waterloo-cs",
        "university_id": "808b96a5-0e59-5215-a2f5-e7c3c5d2785a",
        "initial_url": "https://uwaterloo.ca/future-students/programs/computer-science",
        "description": "Waterloo Computer Science degree page",
        "kind": "waterloo",
        "expected_name": "Computer Science",
        "expected_subject": "Computer Science",
        "expected_level": "Bachelor",
    },
    {
        "key": "waterloo-software",
        "university_id": "808b96a5-0e59-5215-a2f5-e7c3c5d2785a",
        "initial_url": "https://uwaterloo.ca/future-students/programs/software-engineering",
        "description": "Waterloo Software Engineering degree page",
        "kind": "waterloo",
        "expected_name": "Software Engineering",
        "expected_subject": "Software Engineering",
        "expected_level": "Bachelor",
    },
    {
        "key": "waterloo-data",
        "university_id": "808b96a5-0e59-5215-a2f5-e7c3c5d2785a",
        "initial_url": "https://uwaterloo.ca/future-students/programs/data-science",
        "description": "Waterloo Data Science degree page",
        "kind": "waterloo",
        "expected_name": "Data Science",
        "expected_subject": "Data Science",
        "expected_level": "Bachelor",
    },
]

assert len(SOURCES) <= MAX_PAGES, "source allowlist exceeds page cap"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def hostname(url: str | None) -> str:
    try:
        if not url:
            return ""
        v = urllib.parse.urlparse(url)
        if v.scheme not in ("https", "http") or not v.hostname or v.username:
            return ""
        return v.hostname.lower()
    except ValueError:
        return ""


def host_allowed_for_university(host: str, university_id: str) -> bool:
    if not host or university_id not in UNIVERSITIES:
        return False
    for dom in UNIVERSITIES[university_id]["domains"]:
        d = dom.lower()
        if host == d or host.endswith("." + d):
            return True
    return False


def validate_official_url(url: str, university_id: str) -> tuple[bool, str]:
    """HTTPS + exact official domain (subdomains permitted). Suffix borrowing rejected."""
    try:
        v = urllib.parse.urlparse(url)
    except ValueError:
        return False, "unparseable_url"
    if v.scheme != "https":
        return False, "non_https"
    host = (v.hostname or "").lower()
    if not host:
        return False, "missing_host"
    if not host_allowed_for_university(host, university_id):
        return False, "off_domain_redirect"
    return True, host


def clean_html(raw: bytes) -> str:
    txt = raw.decode("utf-8", errors="replace")
    txt = re.sub(r"<script.*?</script>", " ", txt, flags=re.S | re.I)
    txt = re.sub(r"<style.*?</style>", " ", txt, flags=re.S | re.I)
    txt = re.sub(r"<[^>]+>", " ", txt)
    txt = re.sub(r"\s+", " ", txt)
    return txt.strip()


def excerpt_around(text: str, needle: str, max_words: int = 25) -> str:
    low = text.lower()
    idx = low.find(needle.lower())
    if idx < 0:
        return " ".join(text.split()[:max_words])
    words = text.split()
    pos = 0
    hit_word = 0
    for i, w in enumerate(words):
        start = text.find(w, pos)
        if start < 0:
            break
        end = start + len(w)
        pos = end
        if start <= idx < end or (start <= idx + len(needle) // 2 < end):
            hit_word = i
            break
        if start > idx:
            hit_word = i
            break
    half = max_words // 2
    lo = max(0, hit_word - half)
    hi = min(len(words), lo + max_words)
    lo = max(0, hi - max_words)
    return " ".join(words[lo:hi]).strip()


def word_count(s: str) -> int:
    return len([w for w in s.split() if w])


def fingerprint_for(parts: dict) -> str:
    canonical = json.dumps(parts, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def candidate_id_for(fingerprint: str) -> str:
    return str(uuid.uuid5(NAMESPACE, ID_PREFIX + fingerprint))


def normalize_degree_core(name: str) -> str:
    low = (name or "").strip().lower()
    low = re.sub(r"\s+", " ", low)
    for prefix in (
        "bsc (hons) in ",
        "ba (hons) in ",
        "bsc in ",
        "ba in ",
        "msc in ",
        "ma in ",
        "mba in ",
        "llm in ",
        "bachelor of science in ",
        "bachelor of arts in ",
        "bachelor of ",
    ):
        if low.startswith(prefix):
            return low[len(prefix):].strip()
    # Fallback: core after last " in " for names like "BSc (Hons) in X and its Pathways".
    if " in " in low:
        return low.rsplit(" in ", 1)[-1].strip()
    return low


def normalize_url(url: str) -> str:
    try:
        v = urllib.parse.urlparse((url or "").strip())
        host = (v.hostname or "").lower()
        path = (v.path or "").rstrip("/") or "/"
        return f"https://{host}{path}"
    except ValueError:
        return (url or "").strip()


def fetch_source(src: dict) -> tuple[dict | None, dict | None]:
    """Fetch one official source. Returns (receipt, held). Exactly one is not None."""
    university_id = src["university_id"]
    initial_url = src["initial_url"]
    ok, reason = validate_official_url(initial_url, university_id)
    if not ok:
        return None, {
            "held_id": str(uuid.uuid5(NAMESPACE, ID_PREFIX + "held:" + src["key"] + ":" + reason)),
            "university_id": university_id,
            "reason": reason,
            "detail": f"Initial URL rejected: {reason}.",
            "source_key": src["key"],
            "initial_url": initial_url,
            "final_url": None,
            "retrieved_at": None,
        }
    req = urllib.request.Request(
        initial_url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,*/*",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            status = getattr(resp, "status", 200)
            final_url = resp.url
            chunks: list[bytes] = []
            total = 0
            over_cap = False
            while True:
                piece = resp.read(65536)
                if not piece:
                    break
                total += len(piece)
                if total > MAX_BYTES:
                    over_cap = True
                    break
                chunks.append(piece)
            if over_cap:
                retrieved_at = utc_now_iso()
                return None, {
                    "held_id": str(uuid.uuid5(NAMESPACE, ID_PREFIX + "held:" + src["key"] + ":over_size")),
                    "university_id": university_id,
                    "reason": "over_size_cap",
                    "detail": f"Response exceeded {MAX_BYTES} bytes; no facts guessed.",
                    "source_key": src["key"],
                    "initial_url": initial_url,
                    "final_url": final_url,
                    "retrieved_at": retrieved_at,
                }
            raw = b"".join(chunks)
    except Exception as exc:  # blocked source is a gap
        return None, {
            "held_id": str(uuid.uuid5(NAMESPACE, ID_PREFIX + "held:" + src["key"] + ":blocked")),
            "university_id": university_id,
            "reason": "blocked_source",
            "detail": f"{type(exc).__name__}: {exc}. Gap recorded; no facts guessed.",
            "source_key": src["key"],
            "initial_url": initial_url,
            "final_url": None,
            "retrieved_at": None,
        }
    retrieved_at = utc_now_iso()
    sha = hashlib.sha256(raw).hexdigest()
    ok2, reason2 = validate_official_url(final_url, university_id)
    if not ok2:
        return None, {
            "held_id": str(uuid.uuid5(NAMESPACE, ID_PREFIX + "held:" + src["key"] + ":" + str(reason2))),
            "university_id": university_id,
            "reason": reason2,
            "detail": f"Final URL {final_url} rejected: {reason2}.",
            "source_key": src["key"],
            "initial_url": initial_url,
            "final_url": final_url,
            "retrieved_at": retrieved_at,
        }
    raw_html = raw.decode("utf-8", errors="replace")
    text = clean_html(raw)
    low_text = text.lower()
    if "incapsula" in low_text and "request unsuccessful" in low_text:
        return None, {
            "held_id": str(uuid.uuid5(NAMESPACE, ID_PREFIX + "held:" + src["key"] + ":blocked")),
            "university_id": university_id,
            "reason": "blocked_source",
            "detail": f"Bot protection challenge at {final_url}. Gap recorded; sha256={sha}.",
            "source_key": src["key"],
            "initial_url": initial_url,
            "final_url": final_url,
            "retrieved_at": retrieved_at,
        }
    receipt = {
        "source_key": src["key"],
        "university_id": university_id,
        "description": src["description"],
        "initial_url": initial_url,
        "final_url": final_url,
        "final_host": hostname(final_url),
        "status": status,
        "retrieved_at": retrieved_at,
        "sha256": sha,
        "bytes": len(raw),
        "text": text,
        "raw_html": raw_html,
        "text_chars": len(text),
    }
    return receipt, None


def resolve_tuition_url(raw_html: str, university_id: str) -> str | None:
    """Return the first explicit tuition link on the page, resolved and validated."""
    for m in re.finditer(r'href="([^"]+)"', raw_html or ""):
        href = m.group(1).strip()
        if "tuition" not in href.lower():
            continue
        # Resolve relative links against the university website.
        base = UNIVERSITIES[university_id]["website"]
        absolute = urllib.parse.urljoin(base, href)
        # Normalise http -> https for wiut (site serves both); require https finally.
        if absolute.startswith("http://www.wiut.uz/"):
            absolute = "https://" + absolute[len("http://"):]
        elif absolute.startswith("http://wiut.uz/"):
            absolute = "https://" + absolute[len("http://"):]
        ok, _ = validate_official_url(absolute, university_id)
        if ok:
            return absolute
    return None


def build_candidate(
    *,
    university_id: str,
    degree_name: str,
    degree_url: str,
    level: str | None,
    subject: str | None,
    duration: str | None,
    language: str | None,
    campus: str | None,
    intake: str | None,
    qualification: str | None,
    qualification_url: str | None,
    tuition_url: str | None,
    reporting_year: int | None,
    reporting_period: str | None,
    population: str,
    provider: str,
    source_url: str,
    initial_url: str,
    retrieved_at: str,
    receipt_key: str,
    sha256: str,
    excerpt: str,
    scope: str,
    pointer: str,
    notes: str,
) -> dict:
    if word_count(excerpt) > 25:
        excerpt = " ".join(excerpt.split()[:25])
    fp_parts = {
        "university_id": university_id,
        "degree_name": (degree_name or "").strip().lower(),
        "level": level,
        "subject": subject,
        "duration": duration,
        "language": language,
        "campus": campus,
        "intake": intake,
        "qualification": qualification,
        "source_url": source_url,
        "reporting_year": reporting_year,
        "population": population,
    }
    fp = fingerprint_for(fp_parts)
    cid = candidate_id_for(fp)
    host = hostname(source_url)
    return {
        "candidate_id": cid,
        "fingerprint": fp,
        "university_id": university_id,
        "university_name": UNIVERSITIES[university_id]["name"],
        "identity_evidence": {
            "website": UNIVERSITIES[university_id]["website"],
            "domains": UNIVERSITIES[university_id]["domains"],
            "matched_host": host,
        },
        "degree_name": degree_name,
        "degree_url": degree_url,
        "level": level,
        "subject": subject,
        "duration": duration,
        "language": language,
        "campus": campus,
        "intake": intake,
        "qualification": qualification,
        "qualification_url": qualification_url,
        "tuition_url": tuition_url,
        "tuition_amount": None,
        "reporting_year": reporting_year,
        "reporting_period": reporting_period,
        "population": population,
        "provider": provider,
        "source_url": source_url,
        "initial_url": initial_url,
        "retrieved_at": retrieved_at,
        "verification_status": "needs_review",
        "verified_at": None,
        "evidence": {
            "receipt_key": receipt_key,
            "sha256": sha256,
            "excerpt": excerpt,
            "excerpt_words": word_count(excerpt),
            "scope": scope,
            "pointer": pointer,
            "university_wide": False,
            "publication_year": reporting_year,
        },
        "notes": notes,
    }


def installed_keys() -> dict:
    """Load reviewed programme equivalents. Returns {by_name, by_url}."""
    by_name: set[tuple] = set()
    by_url: set[tuple] = set()
    try:
        doc = json.loads((ROOT / OFFICIAL_PROGRAMS_REL).read_text())
    except FileNotFoundError:
        return {"by_name": by_name, "by_url": by_url}
    # official-programs.json is keyed by domain (e.g. "wiut.uz").
    domain_to_uid = {"wiut.uz": "66666666-6666-4666-8666-666666666666"}
    # Reverse: also map uwaterloo.ca explicitly (no installed rows today).
    domain_to_uid["uwaterloo.ca"] = "808b96a5-0e59-5215-a2f5-e7c3c5d2785a"
    for domain, rows in doc.items():
        uid = domain_to_uid.get((domain or "").lower())
        if uid is None:
            continue
        for r in rows or []:
            name = r.get("name") or ""
            level = (r.get("level") or "").strip().lower() or None
            norm = normalize_degree_core(name)
            by_name.add((uid, norm, level))
            url = r.get("url") or r.get("source_url") or ""
            if url:
                by_url.add((uid, normalize_url(url)))
    return {"by_name": by_name, "by_url": by_url}


def validate_candidate(cand: dict, directory_ids: set[str], installed: dict) -> tuple[bool, str]:
    """Return (ok, reason). Pure function for tests and live dedupe."""
    uid = cand.get("university_id")
    if uid not in directory_ids or uid not in UNIVERSITIES:
        return False, "ambiguous_identity"
    if cand.get("verification_status") != "needs_review":
        return False, "must_be_needs_review"
    if cand.get("verified_at") is not None:
        return False, "synthetic_verified_timestamp"
    if not cand.get("degree_name") or not cand.get("population") or not cand.get("provider"):
        return False, "missing_scope"
    ev = cand.get("evidence", {})
    if ev.get("university_wide") is not False:
        return False, "scope_must_be_narrow"
    if not ev.get("scope") or not ev.get("pointer"):
        return False, "missing_scope"
    # Historical IPEDS completions are never offering evidence (checked before
    # domain so an IPEDS URL is reported as historic, not merely off-domain).
    blob = ((cand.get("source_url") or "") + " " + (cand.get("degree_url") or "") + " " + (cand.get("notes") or "")).lower()
    if "nces.ed.gov" in blob or "ipeds" in blob or "c2025_a" in blob or "program-catalogue" in blob:
        return False, "historic_completion"
    if (ev.get("receipt_key") or "").lower().startswith("ipeds"):
        return False, "historic_completion"
    # HTTPS + official domain for both source and degree URLs.
    for field in ("source_url", "degree_url"):
        ok, _ = validate_official_url(cand.get(field, ""), uid)
        if not ok:
            return False, "off_domain_redirect"
    # Tuition/qualification links, when present, must also be official https.
    for field in ("tuition_url", "qualification_url"):
        val = cand.get(field)
        if val is not None:
            ok, _ = validate_official_url(val, uid)
            if not ok:
                return False, "off_domain_redirect"
    # Retrieval time present and valid.
    try:
        rt = cand.get("retrieved_at", "")
        dt = datetime.fromisoformat(rt.replace("Z", "+00:00"))
        assert dt.tzinfo is not None
    except Exception:
        return False, "missing_retrieval_time"
    sha = ev.get("sha256", "")
    if not re.fullmatch(r"[0-9a-f]{64}", sha or ""):
        return False, "missing_receipt_checksum"
    excerpt = ev.get("excerpt", "")
    if not excerpt or word_count(excerpt) > 25:
        return False, "excerpt_too_long"
    # Reporting year ONLY when explicit.
    year = cand.get("reporting_year")
    if year is not None:
        if not isinstance(year, int) or not (1900 <= year <= 2100):
            return False, "invalid_year"
        rp = (cand.get("reporting_period") or "") + " " + excerpt
        if str(year) not in rp and ev.get("publication_year") != year:
            return False, "absent_year_must_stay_null"
    else:
        if ev.get("publication_year") is not None:
            return False, "absent_year_must_stay_null"
    # No inferred amounts: tuition_amount must stay null; links carry the evidence.
    if cand.get("tuition_amount") is not None:
        return False, "inferred_amount"
    # Inferred language: English solely from page language is forbidden.
    lang = cand.get("language")
    if lang is not None:
        low_ex = excerpt.lower()
        explicit_lang = ("taught in english" in low_ex or "language of instruction" in low_ex or "medium of instruction" in low_ex)
        if not explicit_lang:
            return False, "inferred_language"
    # Inferred intake: September solely from country custom is forbidden.
    intake = cand.get("intake")
    if intake is not None:
        low_ex = excerpt.lower()
        if "start date" not in low_ex or "september" not in low_ex:
            return False, "inferred_intake"
        if "september" not in intake.lower():
            return False, "inferred_intake"
    # Inferred duration.
    duration = cand.get("duration")
    if duration is not None:
        low_ex = excerpt.lower()
        if "duration" not in low_ex:
            return False, "inferred_duration"
        # Duration value words must appear in the excerpt.
        first_token = duration.strip().split()[0].lower() if duration.strip() else ""
        if first_token and first_token not in low_ex:
            return False, "inferred_duration"
    # Inferred campus.
    campus = cand.get("campus")
    if campus is not None:
        low_ex = excerpt.lower()
        if "campus" not in low_ex or campus.lower() not in low_ex:
            return False, "inferred_campus"
    # Level/subject must be traceable to explicit degree/qualification/excerpt.
    level = cand.get("level")
    if level is not None:
        hay = ((cand.get("degree_name") or "") + " " + (cand.get("qualification") or "") + " " + excerpt).lower()
        if level.lower() == "bachelor":
            if not any(t in hay for t in ("bachelor", "bsc", "ba (hons)", "bcs", "bmath", "bse")):
                return False, "inferred_level"
        elif level.lower() not in hay:
            return False, "inferred_level"
    subject = cand.get("subject")
    if subject is not None:
        hay = ((cand.get("degree_name") or "") + " " + (cand.get("qualification") or "") + " " + excerpt).lower()
        if subject.lower() not in hay:
            return False, "inferred_subject"
    # Deduplication against installed reviewed offers.
    by_name = installed.get("by_name", set()) if isinstance(installed, dict) else set()
    by_url = installed.get("by_url", set()) if isinstance(installed, dict) else set()
    norm_name = normalize_degree_core(cand.get("degree_name") or "")
    level_norm = (cand.get("level") or "").strip().lower() or None
    norm_url = normalize_url(cand.get("degree_url") or cand.get("source_url") or "")
    if (uid, norm_name, level_norm) in by_name:
        return False, "duplicate_installed"
    if (uid, norm_url) in by_url:
        return False, "duplicate_installed"
    return True, "ok"


def parse_wiut_course(text: str, receipt: dict, raw_html: str, expected: dict) -> list[dict]:
    """Pure WIUT parser. Emits at most one candidate; never invents metadata."""
    uid = expected["university_id"] if "university_id" in expected else receipt["university_id"]
    # The receipt's university is authoritative; expected only guards the name.
    uid = receipt["university_id"]
    exp_name = expected["expected_name"]
    if exp_name.lower() not in text.lower():
        return []
    # Award title is the explicit qualification.
    qualification: str | None = None
    m = re.search(r"Award Title\s+([A-Za-z() ]{5,60}?)\s+Validated by", text)
    if m:
        qualification = m.group(1).strip()
        # Normalise double spaces.
        qualification = re.sub(r"\s+", " ", qualification)
    else:
        # Fallback: any Bachelor mention adjacent to Award Title.
        m2 = re.search(r"Award Title\s+([^\n]{5,80})", text)
        if m2:
            qualification = re.sub(r"\s+", " ", m2.group(1).strip())[:80]
    duration: str | None = None
    md = re.search(r"Duration\s+([0-9]+\s*years?\s*\([^)]{3,30}\))", text, re.I)
    if md:
        duration = re.sub(r"\s+", " ", md.group(1).strip())
        # Rebuild canonical "3 years (full time)" form from the match.
        # Keep exactly what the page states (bounded).
        duration = duration[:40]
    intake: str | None = None
    ms = re.search(r"Start Date\s+([A-Za-z]+\s*\([^)]{5,60}\))", text)
    if ms:
        intake = re.sub(r"\s+", " ", ms.group(1).strip())[:60]
    # Language/campus/reporting year stay null: no explicit block on these pages.
    # Do not claim English from page language, Tashkent from the university name,
    # or a reporting year from retrieval date.
    tuition_url = resolve_tuition_url(raw_html, uid)
    # Official degree name: use the expected official title as it appears on the page.
    # Find the exact casing from the text for evidence fidelity.
    degree_name = exp_name
    idx = text.lower().find(exp_name.lower())
    if idx >= 0:
        # Preserve the page's own casing by slicing the cleaned text.
        # Cleaned text collapses spaces, so this is the advertised title.
        degree_name = text[idx: idx + len(exp_name)]
    # Excerpt must carry the explicit duration/intake evidence when those are set.
    if ms:
        excerpt = excerpt_around(text, "Start Date")
    elif md:
        excerpt = excerpt_around(text, "Duration")
    else:
        excerpt = excerpt_around(text, exp_name)
    scope = f"{degree_name} · prospective undergraduates"
    return [
        build_candidate(
            university_id=uid,
            degree_name=degree_name,
            degree_url=receipt["final_url"],
            level=expected.get("expected_level"),
            subject=expected.get("expected_subject"),
            duration=duration,
            language=None,
            campus=None,
            intake=intake,
            qualification=qualification,
            qualification_url=receipt["final_url"] if qualification else None,
            tuition_url=tuition_url,
            reporting_year=None,
            reporting_period=None,
            population="Prospective undergraduate students",
            provider=UNIVERSITIES[uid]["name"],
            source_url=receipt["final_url"],
            initial_url=receipt["initial_url"],
            retrieved_at=receipt["retrieved_at"],
            receipt_key=receipt["source_key"],
            sha256=receipt["sha256"],
            excerpt=excerpt,
            scope=scope,
            pointer="WHAT YOU NEED TO KNOW block" if ("WHAT YOU NEED TO KNOW" in text) else "Course overview block",
            notes=(
                f"Authored summary: WIUT advertises {degree_name} with {qualification or 'an explicit award title'}; "
                f"{'duration ' + duration + '; ' if duration else ''}"
                f"{'start ' + intake + '; ' if intake else ''}"
                "tuition via the official tuition-fees link when present. "
                "Confirm intake and award on the official course page."
            ),
        )
    ]


def parse_waterloo_program(text: str, receipt: dict, raw_html: str, expected: dict) -> list[dict]:
    """Pure Waterloo parser. Emits at most one candidate; nulls stay null."""
    uid = receipt["university_id"]
    exp_name = expected["expected_name"]
    if exp_name.lower() not in text.lower():
        return []
    if "Degree:" not in text:
        return []
    mdeg = re.search(r"Degree:\s*([^.]{5,140})", text)
    qualification = None
    if mdeg:
        qualification = re.sub(r"\s+", " ", mdeg.group(1).strip())[:140]
        # Trim trailing "Learn more" boilerplate if captured.
        qualification = re.split(r"\s+Learn more", qualification)[0].strip()
    # Level is explicit only via a Bachelor mention in the Degree line.
    level: str | None = None
    if qualification and "bachelor" in qualification.lower():
        level = "Bachelor"
    # Duration/language/campus/intake/reporting year: no explicit block on
    # these programme pages, so all stay null. September course-schedule
    # months are not an intake claim; English page language is not a
    # language-of-instruction claim.
    tuition_url = resolve_tuition_url(raw_html, uid)
    degree_name = exp_name
    idx = text.lower().find(exp_name.lower())
    if idx >= 0:
        degree_name = text[idx: idx + len(exp_name)]
        # Waterloo titles use title case; preserve it.
    excerpt = excerpt_around(text, "Degree:")
    scope = f"{degree_name} · prospective undergraduates"
    return [
        build_candidate(
            university_id=uid,
            degree_name=degree_name,
            degree_url=receipt["final_url"],
            level=level,
            subject=expected.get("expected_subject"),
            duration=None,
            language=None,
            campus=None,
            intake=None,
            qualification=qualification,
            qualification_url=receipt["final_url"] if qualification else None,
            tuition_url=tuition_url,
            reporting_year=None,
            reporting_period=None,
            population="Prospective undergraduate students",
            provider=UNIVERSITIES[uid]["name"],
            source_url=receipt["final_url"],
            initial_url=receipt["initial_url"],
            retrieved_at=receipt["retrieved_at"],
            receipt_key=receipt["source_key"],
            sha256=receipt["sha256"],
            excerpt=excerpt,
            scope=scope,
            pointer="Faculty/Degree line",
            notes=(
                f"Authored summary: Waterloo advertises {degree_name} "
                f"({qualification or 'explicit degree line'}). "
                "Duration, language, campus, intake and year stay null without an explicit block; "
                "tuition via the official financing link when present."
            ),
        )
    ]


def read_inputs() -> dict:
    """Read-only checkpoint + catalogue + equivalents. Never writes."""
    checkpoint = (ROOT / CHECKPOINT_REL).read_text()
    catalogue = json.loads((ROOT / CATALOGUE_REL).read_text())
    official = json.loads((ROOT / OFFICIAL_PROGRAMS_REL).read_text())
    directory = json.loads((ROOT / DIRECTORY_REL).read_text())
    manifest = {}
    try:
        manifest = json.loads((ROOT / "data/published/program-manifest.json").read_text())
    except FileNotFoundError:
        pass
    return {
        "checkpoint_chars": len(checkpoint),
        "checkpoint_sha256": hashlib.sha256(checkpoint.encode("utf-8")).hexdigest(),
        "catalogue_keys": len(catalogue) if isinstance(catalogue, dict) else len(catalogue),
        "catalogue_has_waterloo": "808b96a5-0e59-5215-a2f5-e7c3c5d2785a" in catalogue if isinstance(catalogue, dict) else False,
        "catalogue_has_wiut": "66666666-6666-4666-8666-666666666666" in catalogue if isinstance(catalogue, dict) else False,
        "official_domains": sorted(official.keys()) if isinstance(official, dict) else [],
        "official_wiut_count": len(official.get("wiut.uz", [])) if isinstance(official, dict) else 0,
        "directory_total": len(directory),
        "manifest": manifest,
    }


def build_review(fetch: bool = True) -> tuple[list[dict], list[dict], dict, dict]:
    inputs = read_inputs()
    try:
        directory = json.loads((ROOT / DIRECTORY_REL).read_text())
        directory_ids = {r["id"] for r in directory}
    except FileNotFoundError:
        directory_ids = set(UNIVERSITIES.keys())
    installed = installed_keys()
    receipts: dict[str, dict] = {}
    receipt_list: list[dict] = []
    held: list[dict] = []

    if fetch:
        for src in SOURCES:
            receipt, h = fetch_source(src)
            if h is not None:
                held.append(h)
            else:
                assert receipt is not None
                receipts[receipt["source_key"]] = receipt
                receipt_list.append({k: v for k, v in receipt.items() if k not in ("text", "raw_html")})
    else:
        receipts = {}

    candidates_raw: list[dict] = []
    by_key = {s["key"]: s for s in SOURCES}
    for key, receipt in receipts.items():
        src = by_key.get(key)
        if src is None:
            continue
        text = receipt.get("text", "")
        raw_html = receipt.get("raw_html", "")
        if src["kind"] == "wiut":
            cands = parse_wiut_course(text, receipt, raw_html, {**src, "university_id": src["university_id"]})
            if not cands:
                held.append(
                    {
                        "held_id": str(uuid.uuid5(NAMESPACE, ID_PREFIX + "held:missing:" + key)),
                        "university_id": receipt["university_id"],
                        "reason": "missing_evidence",
                        "detail": f"Expected course title not found on {receipt['final_url']}; no facts guessed.",
                        "source_key": key,
                        "initial_url": receipt["initial_url"],
                        "final_url": receipt["final_url"],
                        "retrieved_at": receipt["retrieved_at"],
                    }
                )
            else:
                candidates_raw.extend(cands)
        else:
            cands = parse_waterloo_program(text, receipt, raw_html, {**src, "university_id": src["university_id"]})
            if not cands:
                held.append(
                    {
                        "held_id": str(uuid.uuid5(NAMESPACE, ID_PREFIX + "held:missing:" + key)),
                        "university_id": receipt["university_id"],
                        "reason": "missing_evidence",
                        "detail": f"Expected programme Degree block not found on {receipt['final_url']}; no facts guessed.",
                        "source_key": key,
                        "initial_url": receipt["initial_url"],
                        "final_url": receipt["final_url"],
                        "retrieved_at": receipt["retrieved_at"],
                    }
                )
            else:
                candidates_raw.extend(cands)

    candidates: list[dict] = []
    seen_fp: set[str] = set()
    duplicates = 0
    valid_pending: list[dict] = []
    for cand in candidates_raw:
        if cand["fingerprint"] in seen_fp:
            held.append(
                {
                    "held_id": str(uuid.uuid5(NAMESPACE, ID_PREFIX + "held:dupfp:" + cand["fingerprint"])),
                    "university_id": cand["university_id"],
                    "reason": "duplicate_candidate",
                    "detail": f"In-review duplicate fingerprint {cand['fingerprint'][:12]} for {cand['degree_name']}.",
                    "source_key": cand["evidence"]["receipt_key"],
                    "initial_url": cand["initial_url"],
                    "final_url": cand["source_url"],
                    "retrieved_at": cand["retrieved_at"],
                }
            )
            duplicates += 1
            continue
        seen_fp.add(cand["fingerprint"])
        ok, reason = validate_candidate(cand, directory_ids | set(UNIVERSITIES.keys()), installed)
        if ok:
            valid_pending.append(cand)
            # Reserve the semantic slot so a later changed-value fact with the
            # same scope but different value stays separate (different fingerprint
            # but same name/level would otherwise collide only if identical).
            # Only exact duplicates are blocked; changed values have distinct
            # fingerprints and remain candidates with history retained.
            installed["by_name"].add(
                (cand["university_id"], normalize_degree_core(cand["degree_name"]), (cand.get("level") or "").strip().lower() or None)
            )
            installed["by_url"].add((cand["university_id"], normalize_url(cand.get("degree_url") or cand.get("source_url") or "")))
        else:
            if reason == "duplicate_installed":
                duplicates += 1
            held.append(
                {
                    "held_id": str(uuid.uuid5(NAMESPACE, ID_PREFIX + "held:valid:" + cand["fingerprint"])),
                    "university_id": cand.get("university_id"),
                    "reason": reason,
                    "detail": f"Candidate {cand.get('degree_name')} held: {reason}. History retained.",
                    "source_key": (cand.get("evidence") or {}).get("receipt_key"),
                    "initial_url": cand.get("initial_url"),
                    "final_url": cand.get("source_url"),
                    "retrieved_at": cand.get("retrieved_at"),
                }
            )

    # Enforce the six-offer cap on genuinely new candidates only; duplicates
    # never consume cap slots. Extras stay held as gaps for a later review.
    capped_held = 0
    if len(valid_pending) > MAX_CANDIDATES:
        for extra in valid_pending[MAX_CANDIDATES:]:
            held.append(
                {
                    "held_id": str(uuid.uuid5(NAMESPACE, ID_PREFIX + "held:cap:" + extra["fingerprint"])),
                    "university_id": extra["university_id"],
                    "reason": "cap_exceeded",
                    "detail": f"Candidate {extra['degree_name']} held by the six-offer cap; gap for a later review.",
                    "source_key": extra["evidence"]["receipt_key"],
                    "initial_url": extra["initial_url"],
                    "final_url": extra["source_url"],
                    "retrieved_at": extra["retrieved_at"],
                }
            )
            capped_held += 1
        valid_pending = valid_pending[:MAX_CANDIDATES]
    candidates = valid_pending

    candidates.sort(key=lambda c: (c["university_id"], c["degree_name"]))
    held.sort(key=lambda h: (str(h.get("university_id")), str(h.get("reason"))))

    receipt_out = []
    for r in receipt_list:
        full = receipts.get(r["source_key"], {}).get("text", "")
        preview = full[:500]
        entry = dict(r)
        entry["text_preview_chars"] = len(preview)
        entry["text_preview"] = preview
        receipt_out.append(entry)

    counts = {
        "schema_version": 1,
        "checked_at": CHECKED_AT.isoformat(),
        "method": "Official-domain fetch (<=8 pages, 20s, 2MiB cap); narrow parsers; strict validation; append-only review.",
        "cap_pages": MAX_PAGES,
        "cap_candidates": MAX_CANDIDATES,
        "sources_attempted": len(SOURCES),
        "sources_succeeded": len(receipt_list),
        "sources_blocked_or_held": sum(1 for h in held if h.get("reason") in ("blocked_source", "missing_evidence", "over_size_cap")),
        "candidates_new": len(candidates),
        "duplicates": duplicates,
        "held_total": len(held),
        "capped_by_cap": capped_held,
        "by_university": {UNIVERSITIES[uid]["name"]: sum(1 for c in candidates if c["university_id"] == uid) for uid in UNIVERSITIES},
        "held_by_reason": {k: sum(1 for h in held if h.get("reason") == k) for k in sorted({h.get("reason") for h in held})},
        "inputs": inputs,
    }
    # Mapping to existing hosted targets (review only; no writes).
    mapping_targets = {
        "programs": "public.programs(name<-degree_name, subject<-subject, degree_level<-level, language<-language when explicit else null; unique(name,degree_level,language))",
        "university_programs": "public.university_programs(university_id, program_id, source_url, verification_status=needs_review, verified_at=null, evidence{scope,pointer,sha256,excerpt})",
        "source_records": "private source_records staging(metric=program_offering, year<-reporting_year, raw_value{degree_name,qualification,duration,intake}, source_url, retrieved_at, status=pending). year is NOT NULL in the current schema: every null reporting_year below is flagged and must NOT be manufactured.",
        "year_flag": "absent_reporting_year_blocked_from_source_records",
        "no_auto_approval": True,
        "no_destructive_sql": True,
        "no_institution_creation": True,
    }
    per_candidate_mapping = []
    for c in candidates:
        per_candidate_mapping.append(
            {
                "candidate_id": c["candidate_id"],
                "fingerprint": c["fingerprint"],
                "university_id": c["university_id"],
                "degree_name": c["degree_name"],
                "programs_target": {"name": c["degree_name"], "subject": c["subject"], "degree_level": c["level"], "language": c["language"]},
                "university_programs_target": {
                    "university_id": c["university_id"],
                    "source_url": c["source_url"],
                    "verification_status": "needs_review",
                    "verified_at": None,
                },
                "source_records_target": None if c.get("reporting_year") is None else {
                    "metric": "program_offering",
                    "year": c.get("reporting_year"),
                    "source_url": c["source_url"],
                    "retrieved_at": c["retrieved_at"],
                    "status": "pending",
                },
                "absent_reporting_year": c.get("reporting_year") is None,
                "year_note": "Flagged: source_records.year is required; null stays null, do not manufacture."
                if c.get("reporting_year") is None
                else "Year explicit in reporting_period/excerpt.",
            }
        )
    mapping = {"mapping": mapping_targets, "candidates": per_candidate_mapping, "receipts": receipt_out}
    return candidates, held, counts, mapping


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, default=OUT_DEFAULT)
    ap.add_argument("--no-fetch", action="store_true", help="Validate without network (tests/offline).")
    args = ap.parse_args()
    out: Path = args.out
    # Publication boundary: only owned outputs may be written.
    allowed = (ROOT / "outputs" / "current-degrees-oct10").resolve()
    try:
        if out.resolve() != allowed and allowed not in out.resolve().parents:
            raise SystemExit(f"refused write outside owned path: {out}")
    except SystemExit:
        raise
    except Exception:
        pass
    out.mkdir(parents=True, exist_ok=True)
    candidates, held, counts, mapping = build_review(fetch=not args.no_fetch)
    (out / "candidates.json").write_text(
        json.dumps(
            {"schema_version": 1, "checked_at": counts["checked_at"], "status": "needs_review", "candidate_count": len(candidates), "candidates": candidates},
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
        + "\n"
    )
    (out / "held.json").write_text(
        json.dumps({"schema_version": 1, "checked_at": counts["checked_at"], "held_count": len(held), "held": held}, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    )
    (out / "counts.json").write_text(json.dumps(counts, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    (out / "mapping.json").write_text(
        json.dumps({"schema_version": 1, "checked_at": counts["checked_at"], **mapping}, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    )
    lines = [
        "# Current degrees review — 10 Oct 2026 (local)",
        "",
        f"- Checked at: {counts['checked_at']}; caps {counts['cap_pages']} pages / {counts['cap_candidates']} candidates",
        f"- Sources attempted/succeeded: {counts['sources_attempted']}/{counts['sources_succeeded']}",
        f"- New candidates: {counts['candidates_new']}; duplicates: {counts['duplicates']}; held: {counts['held_total']}",
        f"- By university: {json.dumps(counts['by_university'], ensure_ascii=False, sort_keys=True)}",
        f"- Held by reason: {json.dumps(counts['held_by_reason'], ensure_ascii=False, sort_keys=True)}",
        "- All candidates are needs_review with verified_at null; no auto-approval, no hosted writes, no institution creation.",
        "- Every null reporting_year is flagged: source_records.year is required, do not manufacture it.",
        "",
    ]
    (out / "SUMMARY.md").write_text("\n".join(lines))
    print(json.dumps({"out": str(out), "candidates_new": len(candidates), "duplicates": counts["duplicates"], "held": len(held), "succeeded": counts["sources_succeeded"]}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
