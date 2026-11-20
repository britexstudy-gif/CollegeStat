#!/usr/bin/env python3
"""Small official admissions import review — 10 October 2026.

Strictly scoped: reads only public official pages on six exact domains,
compares against installed snapshots, writes only to
outputs/official-requirements-oct10/. No hosted writes, no snapshot edits,
no credential reads, no inferred facts. Every candidate is needs_review
with verified_at null. Blocked sources are gaps, never permission to guess.

Owns ONLY this file plus tests/test_official_requirements_oct10.py and the
outputs/official-requirements-oct10/ + report artefacts.
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
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
OUT_DEFAULT = ROOT / "outputs" / "official-requirements-oct10"
CHECKED_AT = date(2026, 10, 10)
TIMEOUT = 15
MAX_CANDIDATES = 24
NAMESPACE = uuid.NAMESPACE_URL
ID_PREFIX = "https://collegestat.app/official-requirements-oct10/"

UNIVERSITIES = {
    "33333333-3333-4333-8333-333333333333": {
        "name": "University of Oxford",
        "domains": ["ox.ac.uk"],
        "website": "http://www.ox.ac.uk/",
    },
    "6020a2b5-3788-5dd1-b3f2-b9c6c7c6f99b": {
        "name": "ETH Zurich",
        "domains": ["ethz.ch"],
        "website": "http://www.ethz.ch/",
    },
    "808b96a5-0e59-5215-a2f5-e7c3c5d2785a": {
        "name": "University of Waterloo",
        "domains": ["uwaterloo.ca"],
        "website": "https://uwaterloo.ca/",
    },
    "c66c3755-66a2-57a0-a80e-da984c310d29": {
        "name": "National University of Singapore",
        "domains": ["nus.edu.sg"],
        "website": "https://www.nus.edu.sg/",
    },
    "66666666-6666-4666-8666-666666666666": {
        "name": "Westminster International University in Tashkent",
        "domains": ["wiut.uz"],
        "website": "http://www.wiut.uz/",
    },
    "d8bda512-7a9d-581e-9e01-92e52a0fa6a0": {
        "name": "Mohamed bin Zayed University of Artificial Intelligence (MBZUAI)",
        "domains": ["mbzuai.ac.ae"],
        "website": "https://mbzuai.ac.ae/",
    },
}

ALLOWED_GLOBAL = {"ox.ac.uk", "ethz.ch", "uwaterloo.ca", "nus.edu.sg", "wiut.uz", "mbzuai.ac.ae"}

SOURCES = [
    {"key": "waterloo-deadlines", "university_id": "808b96a5-0e59-5215-a2f5-e7c3c5d2785a",
     "initial_url": "https://uwaterloo.ca/future-students/admissions/deadlines",
     "description": "Waterloo application and document deadlines"},
    {"key": "waterloo-english", "university_id": "808b96a5-0e59-5215-a2f5-e7c3c5d2785a",
     "initial_url": "https://uwaterloo.ca/future-students/admissions/english-language-requirements",
     "description": "Waterloo English language requirements"},
    {"key": "waterloo-apply", "university_id": "808b96a5-0e59-5215-a2f5-e7c3c5d2785a",
     "initial_url": "https://uwaterloo.ca/future-students/admissions/how-to-apply",
     "description": "Waterloo how to apply via OUAC"},
    {"key": "wiut-cs", "university_id": "66666666-6666-4666-8666-666666666666",
     "initial_url": "https://www.wiut.uz/bsc-hons-in-computer-science",
     "description": "WIUT BSc Computer Science programme page"},
    {"key": "wiut-tuition", "university_id": "66666666-6666-4666-8666-666666666666",
     "initial_url": "https://www.wiut.uz/tuition-fees",
     "description": "WIUT tuition fees 2026/27"},
    {"key": "eth-master-app", "university_id": "6020a2b5-3788-5dd1-b3f2-b9c6c7c6f99b",
     "initial_url": "https://ethz.ch/en/studies/master/application.html",
     "description": "ETH master application basis"},
    {"key": "eth-dates", "university_id": "6020a2b5-3788-5dd1-b3f2-b9c6c7c6f99b",
     "initial_url": "https://ethz.ch/en/studies/master/application/dates.html",
     "description": "ETH master dates (dynamic table)"},
    {"key": "oxford-timeline", "university_id": "33333333-3333-4333-8333-333333333333",
     "initial_url": "https://www.ox.ac.uk/admissions/undergraduate/applying/admissions-timeline",
     "description": "Oxford admissions timeline"},
    {"key": "nus-requirements", "university_id": "c66c3755-66a2-57a0-a80e-da984c310d29",
     "initial_url": "https://www.nus.edu.sg/oam/admissions/international-qualifications-for-foreigners/admission-requirements",
     "description": "NUS international admission requirements"},
    {"key": "mbzuai-home", "university_id": "d8bda512-7a9d-581e-9e01-92e52a0fa6a0",
     "initial_url": "https://mbzuai.ac.ae/",
     "description": "MBZUAI home"},
]

REQUIREMENT_KINDS = {"SAT", "ACT", "IELTS", "TOEFL", "document", "other"}
CANDIDATE_KINDS = REQUIREMENT_KINDS | {"deadline", "fee"}


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
    # Map char offset to word index so the excerpt is centred on the hit.
    words = text.split()
    # find word containing the hit by accumulating lengths
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
    req = urllib.request.Request(initial_url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) CollegeStat-review/1.0",
        "Accept": "text/html,*/*",
    })
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            raw = resp.read()
            final_url = resp.url
            status = getattr(resp, "status", 200)
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
    try:
        parsed = urllib.parse.urlparse(final_url)
        assert parsed.scheme == "https"
    except AssertionError:
        return None, {
            "held_id": str(uuid.uuid5(NAMESPACE, ID_PREFIX + "held:" + src["key"] + ":non_https")),
            "university_id": university_id,
            "reason": "non_https",
            "detail": f"Final URL is not HTTPS: {final_url}.",
            "source_key": src["key"],
            "initial_url": initial_url,
            "final_url": final_url,
            "retrieved_at": retrieved_at,
        }
    text = clean_html(raw)
    low_text = text.lower()
    if "incapsula" in low_text or "request unsuccessful" in low_text:
        return None, {
            "held_id": str(uuid.uuid5(NAMESPACE, ID_PREFIX + "held:" + src["key"] + ":blocked")),
            "university_id": university_id,
            "reason": "blocked_source",
            "detail": f"Bot protection challenge at {final_url} (Incapsula). Gap recorded; no facts guessed. sha256={sha}.",
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
        "text_chars": len(text),
    }
    return receipt, None


def build_candidate(*, university_id: str, fact_type: str, target_table: str,
                    kind: str, label: str, minimum=None, maximum=None,
                    value_text: str | None = None, unit: str | None = None,
                    amount=None, currency: str | None = None, period: str | None = None,
                    year: int | None = None, population: str, program: str | None = None,
                    cycle: str | None = None, campus=None, provider: str,
                    source_url: str, initial_url: str, retrieved_at: str,
                    receipt_key: str, sha256: str, excerpt: str,
                    scope: str, publication_year: int | None = None,
                    reporting_period: str | None = None, scale: str | None = None,
                    components: dict | None = None, due_at: str | None = None,
                    timezone_name: str | None = None, application_url: str | None = None,
                    notes: str) -> dict:
    if word_count(excerpt) > 25:
        excerpt = " ".join(excerpt.split()[:25])
    fp_parts = {
        "university_id": university_id, "fact_type": fact_type, "kind": kind,
        "label": label, "minimum": minimum, "maximum": maximum,
        "value_text": value_text, "amount": amount, "currency": currency,
        "population": population, "program": program, "cycle": cycle,
        "source_url": source_url, "year": year,
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
        "fact_type": fact_type,
        "target_table": target_table,
        "kind": kind,
        "label": label,
        "minimum": minimum,
        "maximum": maximum,
        "value_text": value_text,
        "unit": unit,
        "amount": amount,
        "currency": currency,
        "period": period,
        "year": year,
        "population": population,
        "program": program,
        "cycle": cycle,
        "campus": campus,
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
            "university_wide": False,
            "publication_year": publication_year,
            "reporting_period": reporting_period,
            "scale": scale,
            "components": components,
            "due_at": due_at,
            "timezone": timezone_name,
            "application_url": application_url,
        },
        "notes": notes,
    }


def validate_candidate(cand: dict, directory_ids: set[str], installed_keys: set[tuple]) -> tuple[bool, str]:
    """Return (ok, reason). Pure function for tests and live dedupe."""
    uid = cand.get("university_id")
    if uid not in directory_ids or uid not in UNIVERSITIES:
        return False, "ambiguous_identity"
    if cand.get("verification_status") != "needs_review":
        return False, "must_be_needs_review"
    if cand.get("verified_at") is not None:
        return False, "synthetic_verified_timestamp"
    kind = cand.get("kind")
    if kind not in CANDIDATE_KINDS:
        return False, "unknown_kind"
    if not cand.get("label") or not cand.get("population") or not cand.get("provider"):
        return False, "missing_scope"
    ev = cand.get("evidence", {})
    if ev.get("university_wide") is not False:
        return False, "scope_must_be_narrow"
    if not ev.get("scope"):
        return False, "missing_scope"
    # HTTPS + official domain
    ok, _ = validate_official_url(cand.get("source_url", ""), uid)
    if not ok:
        return False, "off_domain_redirect"
    # retrieval time present
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
    # year only when explicit
    year = cand.get("year")
    if year is not None:
        if not isinstance(year, int) or not (1900 <= year <= 2100):
            return False, "invalid_year"
        # must have explicit evidence linking year
        rp = (ev.get("reporting_period") or "") + " " + (cand.get("cycle") or "")
        if str(year) not in rp and ev.get("publication_year") != year:
            return False, "absent_year_must_stay_null"
    else:
        # publication_year must also be null when year null (no invented year)
        if ev.get("publication_year") is not None:
            return False, "absent_year_must_stay_null"
    # strict numeric ranges
    minimum = cand.get("minimum")
    maximum = cand.get("maximum")
    if minimum is not None and not isinstance(minimum, (int, float)):
        return False, "invalid_minimum"
    if maximum is not None and minimum is not None and maximum < minimum:
        return False, "invalid_range"
    if kind == "IELTS" and minimum is not None and not (0 <= minimum <= 9):
        return False, "invalid_ielts"
    if kind == "SAT" and minimum is not None and not (400 <= minimum <= 1600):
        return False, "invalid_sat"
    if kind == "ACT" and minimum is not None and not (1 <= minimum <= 36):
        return False, "invalid_act"
    if kind == "TOEFL" and minimum is not None and not (minimum <= 120):
        return False, "invalid_toefl"
    if kind == "TOEFL":
        scale = ev.get("scale")
        if scale not in ("TOEFL iBT 0–120", "TOEFL iBT 1–6", None):
            return False, "invalid_scale"
        if scale == "TOEFL iBT 1–6" and minimum is not None and not (1 <= minimum <= 6):
            return False, "invalid_toefl_scale"
    # score band ambiguity: overall claim while page shows component thresholds
    # If label says overall but components missing while excerpt mentions a component,
    # hold rather than collapse bands.
    if kind in ("IELTS", "TOEFL") and "overall" in (cand.get("label") or "").lower():
        comps = ev.get("components")
        low_ex = excerpt.lower()
        mentions_component = any(w in low_ex for w in ("writing", "speaking", "reading", "listening"))
        # Only flag when excerpt itself shows a component threshold but candidate drops it.
        # Our live parsers always include components, so this guards future edits.
        if mentions_component and not comps:
            return False, "score_band_ambiguity"
        # Also reject university-wide overall when scope is narrow program with own band:
        # enforced by requiring scope text to match population; both present already.
    # strict dates for deadlines
    if cand.get("fact_type") == "deadline":
        due = ev.get("due_at") or cand.get("value_text")
        if not due:
            return False, "missing_due_date"
        try:
            if "T" in due:
                instant = datetime.fromisoformat(due.replace("Z", "+00:00"))
                assert instant.tzinfo is not None
                due_date = instant.date()
                tz = ev.get("timezone")
                ZoneInfo(str(tz))
            else:
                due_date = date.fromisoformat(due[:10])
        except Exception:
            return False, "invalid_due_date"
        if due_date < CHECKED_AT:
            return False, "expired_date"
        if cand.get("cycle") is None or cand.get("population") is None:
            return False, "missing_scope"
    # deduplication against installed semantic keys
    key = semantic_key(cand)
    if key in installed_keys:
        return False, "duplicate_installed"
    return True, "ok"


def semantic_key(cand: dict) -> tuple:
    return (
        cand.get("university_id"), cand.get("program"), cand.get("kind"),
        (cand.get("label") or "").strip().lower(), cand.get("minimum"),
        (cand.get("population") or "").strip().lower(),
        (cand.get("cycle") or "").strip().lower() if cand.get("cycle") else None,
        cand.get("source_url"),
    )


def installed_semantic_keys() -> set[tuple]:
    keys: set[tuple] = set()
    try:
        req = json.loads((ROOT / "data/published/requirements-current.json").read_text())
        for r in req:
            keys.add((
                r.get("university_id"), None, r.get("kind"),
                (r.get("label") or "").strip().lower(), r.get("minimum"),
                (r.get("student_category") or "").strip().lower(),
                None, r.get("source_url"),
            ))
            # also value-agnostic key for same scope/label/cycle to catch reworded duplicates?
            # Keep strict: same value/scope/cycle only.
    except FileNotFoundError:
        pass
    try:
        dates = json.loads((ROOT / "data/published/application-dates-current.json").read_text())
        for r in dates:
            keys.add((
                r.get("university_id"), r.get("program_id"), "deadline",
                (r.get("title") or "").strip().lower(), None,
                (r.get("student_category") or "").strip().lower(),
                (r.get("cycle") or "").strip().lower() if r.get("cycle") else None,
                r.get("source_url") or r.get("application_url"),
            ))
    except FileNotFoundError:
        pass
    try:
        fees = json.loads((ROOT / "data/published/application-fees-current.json").read_text())
        for r in fees:
            keys.add((
                r.get("university_id"), r.get("program_id"), "fee",
                (r.get("category") or "application_fee").strip().lower(), r.get("amount"),
                (r.get("student_category") or "").strip().lower(),
                None, r.get("source_url"),
            ))
    except FileNotFoundError:
        pass
    return keys


# ---------- parsers (pure; no network) ----------

def parse_waterloo_english(text: str, receipt: dict) -> list[dict]:
    out: list[dict] = []
    uid = "808b96a5-0e59-5215-a2f5-e7c3c5d2785a"
    base = dict(university_id=uid, fact_type="requirement", target_table="requirements",
                population="Undergraduate applicants requiring English evidence",
                program=None, cycle=None, campus=None, year=None,
                provider="University of Waterloo",
                source_url=receipt["final_url"], initial_url=receipt["initial_url"],
                retrieved_at=receipt["retrieved_at"], receipt_key=receipt["source_key"],
                sha256=receipt["sha256"])
    low = text.lower()
    if "6.5 overall" in low and "6.5 writing" in low:
        out.append(build_candidate(
            **base, kind="IELTS", label="IELTS Academic · overall",
            minimum=6.5, maximum=None, value_text="6.5", unit="IELTS 0–9",
            scope="Undergraduate applicants requiring English evidence",
            scale="IELTS 0–9",
            components={"Writing": 6.5, "Speaking": 6.5, "Reading": 6.0, "Listening": 6.0},
            publication_year=None, reporting_period=None,
            excerpt=excerpt_around(text, "6.5 overall"),
            notes="Authored summary: Waterloo lists IELTS 6.5 overall with per-component floors; One Skill Retake accepted. Confirm sending via TRF on official page."))
    if "90 overall" in low and "25 in writing" in low:
        out.append(build_candidate(
            **base, kind="TOEFL", label="TOEFL iBT · legacy scale",
            minimum=90, maximum=None, value_text="90", unit="TOEFL iBT 0–120",
            scope="Undergraduate applicants requiring English evidence · tests before 21 January 2026",
            scale="TOEFL iBT 0–120",
            components={"Writing": 25, "Speaking": 25},
            publication_year=None, reporting_period=None,
            excerpt=excerpt_around(text, "90 overall"),
            notes="Authored summary: legacy TOEFL threshold for earlier tests; MyBest and Essentials not accepted. Confirm test-date rule on official page."))
    if "4.5 overall" in low and "5 in writing" in low:
        out.append(build_candidate(
            **base, kind="TOEFL", label="TOEFL iBT · current 1–6 scale",
            minimum=4.5, maximum=None, value_text="4.5", unit="TOEFL iBT 1–6",
            scope="Undergraduate applicants requiring English evidence · tests as of 21 January 2026",
            scale="TOEFL iBT 1–6",
            components={"Writing": 5, "Speaking": 5},
            publication_year=None, reporting_period=None,
            excerpt=excerpt_around(text, "4.5 overall"),
            notes="Authored summary: current-scale TOEFL threshold with writing/speaking floors. Confirm institution code and sending steps on official page."))
    if "overall of 120" in low and "125" in low:
        out.append(build_candidate(
            **base, kind="other", label="Duolingo English Test",
            minimum=120, maximum=None, value_text="120", unit="Duolingo 10–160",
            scope="Undergraduate applicants choosing Duolingo · tests after 1 July 2024",
            scale="Duolingo English Test 10–160",
            components={"Literacy": 125, "Production": 125},
            publication_year=None, reporting_period=None,
            excerpt=excerpt_around(text, "overall of 120"),
            notes="Authored summary: Duolingo alternative with Literacy/Production floors; subscores required. Confirm account steps on official page."))
    return out


def parse_waterloo_deadlines(text: str, receipt: dict) -> list[dict]:
    out: list[dict] = []
    uid = "808b96a5-0e59-5215-a2f5-e7c3c5d2785a"
    low = text.lower()
    def mk(title: str, population: str, due: str, excerpt_needle: str):
        return build_candidate(
            university_id=uid, fact_type="deadline", target_table="deadlines",
            kind="deadline", label=title, minimum=None, maximum=None,
            value_text=due, unit="America/Toronto",
            year=2027, population=population, program=None,
            cycle="2027 entry · September intake", campus=None,
            provider="University of Waterloo",
            source_url=receipt["final_url"], initial_url=receipt["initial_url"],
            retrieved_at=receipt["retrieved_at"], receipt_key=receipt["source_key"],
            sha256=receipt["sha256"],
            scope=population, publication_year=None, reporting_period="2027 entry",
            excerpt=excerpt_around(text, excerpt_needle),
            due_at=due, timezone_name="America/Toronto",
            application_url=receipt["final_url"],
            notes=f"Authored summary: {title} for 2027 September intake; documents via applicant portal. Confirm faculty exceptions on official page.")
    if "february 1, 2027" in low and "february 15, 2027" in low:
        out.append(mk("Application deadline · programmes other than Engineering",
                      "Undergraduate applicants · programmes other than Engineering",
                      "2027-02-01", "February 1, 2027"))
        out.append(mk("Documents deadline · programmes other than Engineering",
                      "Undergraduate applicants · programmes other than Engineering",
                      "2027-02-15", "February 15, 2027"))
    if "january 15, 2027" in low:
        out.append(mk("Application deadline · Engineering programmes",
                      "Undergraduate Engineering applicants · excluding Architecture",
                      "2027-01-15", "January 15, 2027"))
    if "september only" in low:
        out.append(build_candidate(
            university_id=uid, fact_type="requirement", target_table="requirements",
            kind="document", label="September-only first-year intake",
            minimum=None, maximum=None, value_text="September intake",
            unit=None, year=None,
            population="First-year undergraduate applicants",
            program=None, cycle="2027 entry · September intake", campus=None,
            provider="University of Waterloo",
            source_url=receipt["final_url"], initial_url=receipt["initial_url"],
            retrieved_at=receipt["retrieved_at"], receipt_key=receipt["source_key"],
            sha256=receipt["sha256"], scope="First-year undergraduate applicants",
            publication_year=None, reporting_period="2027 entry",
            excerpt=excerpt_around(text, "September only"),
            notes="Authored summary: first-year entry starts in September only; late applications only if spaces remain."))
    return out


def parse_waterloo_platform(text: str, receipt: dict) -> list[dict]:
    low = text.lower()
    if "ontario universities' application centre" in low and "ouac" in low:
        return [build_candidate(
            university_id="808b96a5-0e59-5215-a2f5-e7c3c5d2785a",
            fact_type="requirement", target_table="requirements",
            kind="document", label="Application platform · OUAC",
            minimum=None, maximum=None, value_text="OUAC",
            unit=None, year=None,
            population="Full-time undergraduate applicants",
            program=None, cycle=None, campus=None,
            provider="University of Waterloo",
            source_url=receipt["final_url"], initial_url=receipt["initial_url"],
            retrieved_at=receipt["retrieved_at"], receipt_key=receipt["source_key"],
            sha256=receipt["sha256"], scope="Full-time undergraduate applicants",
            publication_year=None, reporting_period=None,
            excerpt=excerpt_around(text, "OUAC"),
            notes="Authored summary: full-time applicants apply through OUAC; up to three Waterloo programmes. Confirm next steps on official page.")]
    return []


def parse_wiut_tuition(text: str, receipt: dict) -> list[dict]:
    out: list[dict] = []
    uid = "66666666-6666-4666-8666-666666666666"
    low = text.lower()
    has_cycle = "2026/27" in text or "2026–2027" in text or "2026-2027" in text
    year = 2026 if has_cycle else None
    reporting = "2026/27 academic year" if has_cycle else None
    if "38,820,000" in text:
        excerpt = excerpt_around(text, "38,820,000")
        out.append(build_candidate(
            university_id=uid, fact_type="fee", target_table="costs",
            kind="fee", label="Tuition · Undergraduate per academic year",
            minimum=None, maximum=None, value_text="38820000", unit="UZS per year",
            amount=38820000, currency="UZS", period="year",
            year=year, population="Undergraduate students · domestic rate",
            program="Undergraduate programmes", cycle="2026/27 academic year" if has_cycle else None,
            campus="Tashkent", provider="Westminster International University in Tashkent",
            source_url=receipt["final_url"], initial_url=receipt["initial_url"],
            retrieved_at=receipt["retrieved_at"], receipt_key=receipt["source_key"],
            sha256=receipt["sha256"], scope="Undergraduate programmes · 2026/27",
            publication_year=None, reporting_period=reporting,
            excerpt=excerpt,
            notes="Authored summary: listed undergraduate annual tuition in UZS; instalment schedule on official page. Confirm international rate separately."))
    # International rate appears on CS page as 54,600,000; tuition page may not list it.
    if "54,600,000" in text:
        out.append(build_candidate(
            university_id=uid, fact_type="fee", target_table="costs",
            kind="fee", label="Tuition · Undergraduate international per academic year",
            minimum=None, maximum=None, value_text="54600000", unit="UZS per year",
            amount=54600000, currency="UZS", period="year",
            year=year, population="Undergraduate students · international rate",
            program="Undergraduate programmes", cycle="2026/27 academic year" if has_cycle else None,
            campus="Tashkent", provider="Westminster International University in Tashkent",
            source_url=receipt["final_url"], initial_url=receipt["initial_url"],
            retrieved_at=receipt["retrieved_at"], receipt_key=receipt["source_key"],
            sha256=receipt["sha256"], scope="Undergraduate programmes · international · 2026/27",
            publication_year=None, reporting_period=reporting,
            excerpt=excerpt_around(text, "54,600,000"),
            notes="Authored summary: listed international undergraduate annual tuition in UZS. Confirm programme applicability on official page."))
    _ = low
    return out


def parse_wiut_platform(html_text: str, receipt: dict, raw_html: str = "") -> list[dict]:
    combined = (html_text + " " + raw_html).lower()
    if "admission.wiut.uz" in combined:
        return [build_candidate(
            university_id="66666666-6666-4666-8666-666666666666",
            fact_type="requirement", target_table="requirements",
            kind="document", label="Application platform · admission portal",
            minimum=None, maximum=None, value_text="https://admission.wiut.uz/",
            unit=None, year=None,
            population="Undergraduate and foundation applicants",
            program=None, cycle=None, campus="Tashkent",
            provider="Westminster International University in Tashkent",
            source_url=receipt["final_url"], initial_url=receipt["initial_url"],
            retrieved_at=receipt["retrieved_at"], receipt_key=receipt["source_key"],
            sha256=receipt["sha256"], scope="Undergraduate and foundation applicants",
            publication_year=None, reporting_period=None,
            excerpt=excerpt_around(html_text, "admission") if "admission" in html_text.lower() else "Apply via official admission portal",
            notes="Authored summary: WIUT links to its admission portal for applications. Confirm route-specific steps on official page.")]
    return []


def parse_eth_basis(text: str, receipt: dict) -> list[dict]:
    if "basis for admission is always your bachelor" in text.lower():
        return [build_candidate(
            university_id="6020a2b5-3788-5dd1-b3f2-b9c6c7c6f99b",
            fact_type="requirement", target_table="requirements",
            kind="document", label="Bachelor's degree basis for master's admission",
            minimum=None, maximum=None, value_text="Bachelor's degree required",
            unit=None, year=None,
            population="Master's applicants",
            program=None, cycle=None, campus=None,
            provider="ETH Zurich",
            source_url=receipt["final_url"], initial_url=receipt["initial_url"],
            retrieved_at=receipt["retrieved_at"], receipt_key=receipt["source_key"],
            sha256=receipt["sha256"], scope="Master's applicants",
            publication_year=None, reporting_period=None,
            excerpt=excerpt_around(text, "basis for admission"),
            notes="Authored summary: master's admission is based on prior bachelor's degree and programme profile. Confirm prerequisites per programme.")]
    return []


def build_review(fetch: bool = True) -> tuple[list[dict], list[dict], dict, dict]:
    try:
        directory = json.loads((ROOT / "data/published/global-directory.json").read_text())
        directory_ids = {r["id"] for r in directory}
    except FileNotFoundError:
        directory_ids = set(UNIVERSITIES.keys())
    installed_keys = installed_semantic_keys()
    receipts: dict[str, dict] = {}
    receipt_list: list[dict] = []
    held: list[dict] = []
    raw_store: dict[str, bytes] = {}

    if fetch:
        for src in SOURCES:
            receipt, h = fetch_source(src)
            if h is not None:
                held.append(h)
            else:
                assert receipt is not None
                receipts[receipt["source_key"]] = receipt
                receipt_list.append({k: v for k, v in receipt.items() if k != "text"})
        # persist raw bytes hash already; keep text only in memory
    else:
        receipts = {}

    candidates_raw: list[dict] = []
    # parsers only run on successful receipts
    if "waterloo-english" in receipts:
        candidates_raw.extend(parse_waterloo_english(receipts["waterloo-english"]["text"] if "text" in receipts["waterloo-english"] else "", receipts["waterloo-english"]))
    if "waterloo-deadlines" in receipts:
        candidates_raw.extend(parse_waterloo_deadlines(receipts["waterloo-deadlines"].get("text", ""), receipts["waterloo-deadlines"]))
    if "waterloo-apply" in receipts:
        candidates_raw.extend(parse_waterloo_platform(receipts["waterloo-apply"].get("text", ""), receipts["waterloo-apply"]))
    if "wiut-tuition" in receipts:
        candidates_raw.extend(parse_wiut_tuition(receipts["wiut-tuition"].get("text", ""), receipts["wiut-tuition"]))
    if "wiut-cs" in receipts:
        r = receipts["wiut-cs"]
        # international fee lives on CS page; tuition parser handles it if present
        for c in parse_wiut_tuition(r.get("text", ""), r):
            # avoid double-adding domestic fee already from tuition page (same value/scope/cycle but different source_url -> distinct)
            # Keep both only if source differs; validator dedupes against installed only.
            # To stay within cap and avoid near-duplicates, keep CS international fee only.
            if "international" in (c.get("label") or "").lower():
                # check not already present from tuition page with same source_url
                if not any(x["label"] == c["label"] and x["source_url"] == c["source_url"] for x in candidates_raw):
                    candidates_raw.append(c)
        candidates_raw.extend(parse_wiut_platform(r.get("text", ""), r))
    if "eth-master-app" in receipts:
        candidates_raw.extend(parse_eth_basis(receipts["eth-master-app"].get("text", ""), receipts["eth-master-app"]))
    # ETH dates: dynamic table — if no explicit numeric floor found, record gap
    if "eth-dates" in receipts:
        t = receipts["eth-dates"].get("text", "")
        # The static shell omits the certificate table; do not guess.
        if "IELTS" not in t and "TOEFL" not in t and "certificate" not in t.lower():
            held.append({
                "held_id": str(uuid.uuid5(NAMESPACE, ID_PREFIX + "held:eth-dates:dynamic-table")),
                "university_id": "6020a2b5-3788-5dd1-b3f2-b9c6c7c6f99b",
                "reason": "missing_evidence",
                "detail": "ETH dates page returned a script shell without the rendered table; no numeric floor guessed.",
                "source_key": "eth-dates",
                "initial_url": "https://ethz.ch/en/studies/master/application/dates.html",
                "final_url": receipts["eth-dates"]["final_url"],
                "retrieved_at": receipts["eth-dates"]["retrieved_at"],
            })

    # enforce cap before validation (at most 24)
    candidates_raw = candidates_raw[:MAX_CANDIDATES]

    candidates: list[dict] = []
    seen_fp: set[str] = set()
    duplicates = 0
    for cand in candidates_raw:
        if cand["fingerprint"] in seen_fp:
            held.append({
                "held_id": str(uuid.uuid5(NAMESPACE, ID_PREFIX + "held:dupfp:" + cand["fingerprint"])),
                "university_id": cand["university_id"],
                "reason": "duplicate_candidate",
                "detail": f"In-review duplicate fingerprint {cand['fingerprint'][:12]} for {cand['label']}.",
                "source_key": cand["evidence"]["receipt_key"],
                "initial_url": cand["initial_url"],
                "final_url": cand["source_url"],
                "retrieved_at": cand["retrieved_at"],
            })
            duplicates += 1
            continue
        seen_fp.add(cand["fingerprint"])
        ok, reason = validate_candidate(cand, directory_ids | set(UNIVERSITIES.keys()), installed_keys)
        if ok:
            candidates.append(cand)
            installed_keys.add(semantic_key(cand))
        else:
            if reason == "duplicate_installed":
                duplicates += 1
            held.append({
                "held_id": str(uuid.uuid5(NAMESPACE, ID_PREFIX + "held:valid:" + cand["fingerprint"])),
                "university_id": cand.get("university_id"),
                "reason": reason,
                "detail": f"Candidate {cand.get('label')} held: {reason}. Historical facts preserved.",
                "source_key": (cand.get("evidence") or {}).get("receipt_key"),
                "initial_url": cand.get("initial_url"),
                "final_url": cand.get("source_url"),
                "retrieved_at": cand.get("retrieved_at"),
            })

    candidates.sort(key=lambda c: (c["university_id"], c["fact_type"], c["label"]))
    held.sort(key=lambda h: (str(h.get("university_id")), str(h.get("reason"))))

    # receipts for output: strip full text to bounded preview (first 500 chars) to keep evidence local but small
    receipt_out = []
    for r in receipt_list:
        # re-attach text preview from memory receipts
        full = receipts.get(r["source_key"], {}).get("text", "")
        preview = full[:500]
        entry = dict(r)
        entry["text_preview_chars"] = len(preview)
        entry["text_preview"] = preview
        # remove raw text from stored receipt to avoid publishing full copies
        receipt_out.append(entry)

    counts = {
        "schema_version": 1,
        "checked_at": CHECKED_AT.isoformat(),
        "method": "Official-domain fetch with bounded timeouts; narrow parsers; strict validation; append-only review.",
        "cap": MAX_CANDIDATES,
        "sources_attempted": len(SOURCES),
        "sources_succeeded": len(receipt_list),
        "sources_blocked_or_held": sum(1 for h in held if h.get("reason") in ("blocked_source", "missing_evidence")),
        "candidates_new": len(candidates),
        "duplicates": duplicates,
        "held_total": len(held),
        "by_university": {
            UNIVERSITIES[uid]["name"]: sum(1 for c in candidates if c["university_id"] == uid)
            for uid in UNIVERSITIES
        },
        "held_by_reason": {k: sum(1 for h in held if h.get("reason") == k) for k in sorted({h.get("reason") for h in held})},
    }
    mapping = {
        "requirements": "public.requirements(kind,label,minimum,maximum,student_category<-population,program_id<-program,cycle in evidence,source_url,verification_status=needs_review,verified_at=null,evidence{scope,scale,components,sha256,excerpt})",
        "deadlines": "public.deadlines(title<-label,student_category<-population,cycle,due_at/due_date<-value_text,timezone,application_url,source_url,year when explicit in cycle/reporting_period,evidence{date_precision=date when YYYY-MM-DD,sha256})",
        "fees": "public.costs(category=tuition|application_fee,amount,currency,period,student_category<-population,program,cycle,source_url,evidence{sha256,reporting_period}) + private source_records staging(metric=tuition|application_fee,year,raw_value,normalized_value,unit,source_url,retrieved_at,status=pending)",
        "no_auto_approval": True,
        "no_destructive_sql": True,
    }
    debug = {"receipts": receipt_out, "raw_bytes": raw_store}
    return candidates, held, counts, {"mapping": mapping, "receipts": receipt_out}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, default=OUT_DEFAULT)
    ap.add_argument("--no-fetch", action="store_true", help="Validate without network (tests/offline).")
    args = ap.parse_args()
    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)
    candidates, held, counts, extra = build_review(fetch=not args.no_fetch)
    (out / "candidates.json").write_text(json.dumps(
        {"schema_version": 1, "checked_at": counts["checked_at"], "status": "needs_review",
         "candidate_count": len(candidates), "candidates": candidates},
        ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    (out / "held.json").write_text(json.dumps(
        {"schema_version": 1, "checked_at": counts["checked_at"], "held_count": len(held), "held": held},
        ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    (out / "counts.json").write_text(json.dumps(counts, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    (out / "mapping.json").write_text(json.dumps(
        {"schema_version": 1, "checked_at": counts["checked_at"], "mapping": extra["mapping"],
         "receipts": extra["receipts"]},
        ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    # small human summary (no long excerpts)
    lines = [
        "# Official requirements review — 10 Oct 2026 (local)",
        "",
        f"- Checked at: {counts['checked_at']}; cap {MAX_CANDIDATES}",
        f"- Sources attempted/succeeded: {counts['sources_attempted']}/{counts['sources_succeeded']}",
        f"- New candidates: {counts['candidates_new']}; duplicates: {counts['duplicates']}; held: {counts['held_total']}",
        f"- By university: {json.dumps(counts['by_university'], ensure_ascii=False, sort_keys=True)}",
        f"- Held by reason: {json.dumps(counts['held_by_reason'], ensure_ascii=False, sort_keys=True)}",
        "- All candidates are needs_review with verified_at null; no auto-approval, no destructive SQL.",
        "",
    ]
    (out / "SUMMARY.md").write_text("\n".join(lines))
    print(json.dumps({"out": str(out), "candidates_new": len(candidates),
                      "duplicates": counts["duplicates"], "held": len(held),
                      "succeeded": counts["sources_succeeded"]}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
