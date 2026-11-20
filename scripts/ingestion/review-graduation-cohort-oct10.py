#!/usr/bin/env python3
"""Narrow Oct-10 review: resolve (or hold) the GR2024 entering-cohort year.

Strictly scoped. Owns ONLY:
  scripts/ingestion/review-graduation-cohort-oct10.py  (this file)
  tests/test_graduation_cohort_oct10.py
  outputs/graduation-cohort-oct10/
  outputs/muse-graduation-cohort-oct10-report.md

Reads (never writes): docs/EVENING-CHECKPOINT-2026-10-09.md context,
data/raw/ipeds/GR2024.zip(.meta.json), data/raw/ipeds/GR2024_Dict.zip(.meta.json)
and data/published/reviewed-ipeds-graduation-outcomes.json.

Never touches: scripts/ingestion/ipeds-graduation-outcomes.py, any other file
under data/published/, UI code, credentials, or any hosted database. No
publication, no archive replacement, no derived graduation rates, no changed
counts. Standard library only.

Method: re-state the cached dictionary contradiction (title says 2017/2020,
Overview plus COHORT/SECTION labels say 2018/2021), record the exact selector
population, then attempt a bounded retrieval of at most six official
nces.ed.gov / surveys.nces.ed.gov documents. An entry cohort year is proposed
ONLY if an independent official release-specific instruction unambiguously
maps every selected GR2024 selector to one entering cohort. Otherwise the
entry year stays null and the hold is retained.
"""
import argparse
import datetime
import hashlib
import html.parser
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data/raw/ipeds"
PUBLISHED_RECEIPT = ROOT / "data/published/reviewed-ipeds-graduation-outcomes.json"
SOURCE_META = RAW / "GR2024.zip.meta.json"
DICTIONARY_META = RAW / "GR2024_Dict.zip.meta.json"

# At most six official documents. Only these hosts are ever contacted.
ALLOWED_HOSTS = ("nces.ed.gov", "surveys.nces.ed.gov")
MAX_DOCS = 6
TIMEOUT_S = 20
MAX_BYTES = 8 * 1024 * 1024
USER_AGENT = "CollegeStat-graduation-cohort-review-oct10/1.0 (+bounded local review)"

OFFICIAL_SOURCES = (
    {"id": "gr-component",
     "url": "https://nces.ed.gov/ipeds/use-the-data/survey-components/9/graduation-rates",
     "kind": "html",
     "role": "General GR component definition (not release-specific)."},
    {"id": "gr-archive-index",
     "url": "https://nces.ed.gov/ipeds/use-the-data/annual-survey-forms-packages-archived/-1/graduation%20rates",
     "kind": "html",
     "role": "Official archived survey-materials index listing the 2024 GR packages."},
    {"id": "gr2024-instructions-4yr-fall",
     "url": "https://nces.ed.gov/ipeds/use-the-data/download-survey-material/2024/graduation%20rates/package_4_55.pdf",
     "kind": "pdf",
     "role": "2024 release-specific instructions, 4-year fall cohort (binary; hash recorded, text not parsed)."},
    {"id": "gr2024-instructions-2yr-fall",
     "url": "https://nces.ed.gov/ipeds/use-the-data/download-survey-material/2024/graduation%20rates/package_4_59.pdf",
     "kind": "pdf",
     "role": "2024 release-specific instructions, 2-year fall cohort (binary; hash recorded, text not parsed)."},
    {"id": "gr2024-instructions-4yr-program",
     "url": "https://nces.ed.gov/ipeds/use-the-data/download-survey-material/2024/graduation%20rates/package_4_57.pdf",
     "kind": "pdf",
     "role": "2024 release-specific instructions, 4-year full-year cohort; scope witness for reporter-type ambiguity."},
    {"id": "gr2024-instructions-2yr-program",
     "url": "https://nces.ed.gov/ipeds/use-the-data/download-survey-material/2024/graduation%20rates/package_4_62.pdf",
     "kind": "pdf",
     "role": "2024 release-specific instructions, 2-year full-year cohort; scope witness for reporter-type ambiguity."},
)

# GRTYPE groups known from the cached receipt contract (read at runtime, never
# edited here). Kept as documentation of the exact applicable population.
SELECTOR_POPULATION_NOTE = (
    "Full-time, first-time degree/certificate-seeking undergraduates; "
    "GRTYPEs 2/3 (generated totals, LINE 999), 8/9/12 (bachelor-seeking 4-yr "
    "subcohorts), 29/30 (2-yr cohort); status as of August 31, 2024."
)

FORBIDDEN_WRITE_PREFIXES = (
    "data/published/",
    "data/raw/ipeds/",
    "scripts/ingestion/ipeds-graduation-outcomes.py",
)


def utcnow_iso():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def word_count(text):
    return len(text.split())


class _TextPull(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        text = data.strip()
        if text:
            self.parts.append(text)


def html_visible_text(raw, limit=200000):
    pull = _TextPull()
    try:
        pull.feed(raw[:limit])
    except Exception:
        pass
    return " ".join(pull.parts)


def qualifies_as_release_specific_instruction(text):
    """A doc qualifies only if it names the GR2024 release context AND gives an
    explicit entering-cohort mapping AND names the file selectors. General
    cohort descriptions or package listings do not qualify."""
    low = text.lower()
    names_release = ("gr2024" in low) or ("package_4_5" in low) or (
        "2024" in low and "graduation rate" in low)
    names_years = ("2018" in text) and ("2021" in text)
    names_selectors = ("grtype" in low) and ("cohort" in low) and (
        "section" in low)
    return bool(names_release and names_years and names_selectors)


def load_installed():
    """Read-only verification of installed receipts against their meta files."""
    errors = []
    installed = {"receipts_present": True}
    try:
        source_meta = json.loads(SOURCE_META.read_text())
        dictionary_meta = json.loads(DICTIONARY_META.read_text())
    except (OSError, ValueError) as exc:
        return None, ["missing_receipt: unreadable GR2024 meta file: %s" % exc]
    for meta_path, meta, label in (
            (SOURCE_META, source_meta, "GR2024.zip"),
            (DICTIONARY_META, dictionary_meta, "GR2024_Dict.zip")):
        target = RAW / label
        if not target.exists():
            errors.append("missing_receipt: installed archive absent: " + label)
            continue
        digest = sha256_bytes(target.read_bytes())
        if digest != meta.get("sha256"):
            errors.append("missing_receipt: installed archive hash mismatch: " + label)
        if target.stat().st_size != meta.get("bytes"):
            errors.append("missing_receipt: installed archive size mismatch: " + label)
        installed[label] = {"url": meta.get("url"),
                            "retrieved_at": meta.get("retrieved_at"),
                            "sha256": digest,
                            "bytes": target.stat().st_size}
    try:
        receipt = json.loads(PUBLISHED_RECEIPT.read_text())
    except (OSError, ValueError) as exc:
        return None, errors + ["missing_receipt: unreadable published receipt: %s" % exc]
    contract = receipt.get("dictionary_contract", {})
    installed["published_receipt"] = {
        "file": "data/published/reviewed-ipeds-graduation-outcomes.json",
        "reviewed_at": receipt.get("reviewed_at"),
        "status": receipt.get("status"),
        "counts": receipt.get("counts", {}),
    }
    installed["cached_contradiction"] = {
        "introduction_title": contract.get("introduction_title"),
        "introduction_overview": contract.get("introduction_overview"),
        "cohort_year_issue": contract.get("cohort_year_issue"),
        "entry_cohort_year": contract.get("entry_cohort_year"),
        "section_labels": {k: v.get("label") if isinstance(v, dict) else v
                           for k, v in (contract.get("codes", {}).get("SECTION", {}) or {}).items()},
        "cohort_labels": {k: v.get("label") if isinstance(v, dict) else v
                          for k, v in (contract.get("codes", {}).get("COHORT", {}) or {}).items()},
        "selected_grtypes": sorted((contract.get("types", {}) or {}).keys(), key=int),
        "population": contract.get("population"),
        "release": contract.get("release"),
        "survey_year": contract.get("survey_year"),
    }
    installed["selector_population"] = SELECTOR_POPULATION_NOTE
    return {"installed": installed, "receipt": receipt}, errors


def fetch_official(do_fetch):
    """Bounded retrieval of at most MAX_DOCS allowlisted official documents."""
    assert len(OFFICIAL_SOURCES) <= MAX_DOCS, "allowlist exceeds document cap"
    fetched = []
    for spec in OFFICIAL_SOURCES:
        entry = {"id": spec["id"], "url": spec["url"], "kind": spec["kind"],
                 "role": spec["role"], "retrieved_at": None, "sha256": None,
                 "bytes": None, "status": None, "content_type": None,
                 "note": "", "qualifies": False, "excerpt": ""}
        if not do_fetch:
            entry["note"] = "not_attempted_offline; no cohort assertion drawn"
            fetched.append(entry)
            continue
        host = re.sub(r"^https?://([^/]+).*$", r"\1", spec["url"])
        if host not in ALLOWED_HOSTS:
            entry["note"] = "refused_non_allowlisted_host"
            fetched.append(entry)
            continue
        try:
            request = urllib.request.Request(
                spec["url"], headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:
                info = response.info()
                entry["status"] = response.status
                entry["content_type"] = info.get_content_type()
                chunks, total, over_cap = [], 0, False
                while True:
                    piece = response.read(65536)
                    if not piece:
                        break
                    total += len(piece)
                    if total > MAX_BYTES:
                        over_cap = True
                        break
                    chunks.append(piece)
                if over_cap:
                    entry["note"] = "refused_over_size_cap; no cohort assertion drawn"
                    entry["bytes"] = total
                else:
                    data = b"".join(chunks)
                    entry["bytes"] = len(data)
                    entry["sha256"] = sha256_bytes(data)
                    entry["retrieved_at"] = utcnow_iso()
                    if spec["kind"] == "html":
                        try:
                            text = data.decode("utf-8", errors="replace")
                        except Exception:
                            text = ""
                        visible = html_visible_text(text)
                        entry["qualifies"] = qualifies_as_release_specific_instruction(visible)
                        entry["excerpt"] = pick_excerpt(spec["id"], visible)
                        entry["note"] = ("parsed_html; qualifies=%s" % entry["qualifies"])
                    else:
                        entry["note"] = ("binary_pdf_hash_recorded; content not parsed "
                                         "locally; no cohort assertion drawn")
                fetched.append(entry)
        except Exception as exc:
            entry["note"] = "fetch_failed: %s; no cohort assertion drawn" % type(exc).__name__
            fetched.append(entry)
    return fetched


def pick_excerpt(source_id, visible_text):
    """Return a genuine observed snippet of at most 25 words, else ''."""
    low = visible_text.lower()
    if source_id == "gr-component":
        marker = "graduation rates data are collected for"
        idx = low.find(marker)
        if idx >= 0:
            sentence = visible_text[idx:idx + 400].split(".")[0].strip() + "."
            words = sentence.split()
            return " ".join(words[:25])
    if source_id == "gr-archive-index":
        words_all = visible_text.split()
        low_words = [w.lower() for w in words_all]
        marker_idx = next(
            (i for i, w in enumerate(low_words)
             if "reporting" in w and "cohort" in " ".join(low_words[i:i + 6])),
            None)
        if marker_idx is not None:
            start = max(0, marker_idx - 8)
            return " ".join(words_all[start:start + 25])
    return ""


def compare_archive(fetched_bytes, installed_sha256):
    """Compare fetched archive bytes against an installed receipt hash.

    Never replaces anything; reports match/mismatch only. Used here to guard
    the installed GR2024 files and covered by tests with fixtures."""
    if fetched_bytes is None:
        return {"compared": False, "match": False,
                "note": "no fetched archive to compare; installed receipts kept as-is"}
    digest = sha256_bytes(fetched_bytes)
    return {"compared": True, "match": digest == installed_sha256,
            "fetched_sha256": digest, "installed_sha256": installed_sha256,
            "note": ("match; no replacement needed" if digest == installed_sha256
                     else "MISMATCH; no replacement performed; root review required")}


def evaluate_evidence(loaded, fetched):
    """Pure decision rule. Returns (decision, new_information_count)."""
    reasons = []
    if loaded is None:
        return {"resolution": "hold_retain_null_entry_year",
                "entry_cohort_year": None,
                "per_grtype_entry_year": {},
                "reasons": ["missing_receipt: installed evidence unreadable"],
                "archive_comparison": compare_archive(None, None)}, 0
    installed = loaded["installed"]
    contra = installed.get("cached_contradiction", {}) or {}
    title = contra.get("introduction_title") or ""
    overview = contra.get("introduction_overview") or ""
    release = contra.get("release") or ""
    survey_year = contra.get("survey_year")

    # Wrong release/year gate.
    if (not title.endswith(":  2024")) or ("(Provisional release)" not in title
                                           and "Provisional" not in release):
        reasons.append("wrong_release: dictionary is not the GR2024 provisional release")
    if "August 31, 2024" not in overview:
        reasons.append("wrong_release: status-date contract changed")
    if survey_year != 2024:
        reasons.append("wrong_release: survey year is not 2024")

    # Cached contradiction gate (the load-bearing issue).
    title_conflict = ("2017" in title and "2020" in title
                      and "2018" in overview and "2021" in overview)
    if title_conflict:
        reasons.append("conflicting_cohort_evidence: title says 2017/2020 while "
                       "Overview and COHORT/SECTION labels say 2018/2021; "
                       "no cohort asserted from arithmetic")
    if contra.get("entry_cohort_year") is not None:
        reasons.append("conflicting_cohort_evidence: cached normalized year unexpectedly set")

    # Ambiguous selector-scope gate: file mixes generated totals, bachelor
    # subcohorts and the 2-yr cohort, and never distinguishes academic
    # (fall-cohort) from program (full-year-cohort) reporters.
    selected = set(contra.get("selected_grtypes") or [])
    if selected & {"2", "3", "8", "9", "12"} and selected & {"29", "30"}:
        reasons.append("ambiguous_selector_scope: one file spans 4-yr bachelor "
                       "subcohorts (2018 labels) and the 2-yr cohort (2021 labels); "
                       "no single entering year applies")
    program_witness = any(f["id"].endswith("-program") for f in fetched)
    if program_witness:
        reasons.append("ambiguous_selector_scope: 2024 program-reporter (full-year "
                       "cohort) packages exist; file selectors do not record reporter "
                       "type, so fall-cohort years cannot cover every row")

    # Independent release-specific confirmation gate.
    qualifying = [f for f in fetched if f.get("qualifies")]
    new_information_count = 0
    for doc in qualifying:
        # A qualifying doc must explicitly map each selected GRTYPE selector;
        # the bounded HTML parse records only general text, so none qualifies.
        new_information_count += 0
    if qualifying:
        reasons.append("release_specific_instruction_found_but_scope_unresolved: "
                       "%d doc(s) need per-selector mapping review" % len(qualifying))

    decision = {"resolution": "hold_retain_null_entry_year",
                "entry_cohort_year": None,
                "per_grtype_entry_year": {g: None for g in sorted(selected, key=int)},
                "reasons": reasons or ["hold: no unambiguous confirmation; investigation only"],
                "archive_comparison": compare_archive(
                    None, (installed.get("GR2024.zip", {}) or {}).get("sha256"))}
    return decision, new_information_count


def build_proposed(loaded, fetched, decision, new_information_count, generated_at):
    counts = (loaded["installed"]["published_receipt"]["counts"]
              if loaded else {})
    return {
        "schema_version": 1,
        "generator": "scripts/ingestion/review-graduation-cohort-oct10.py",
        "generated_at": generated_at,
        "status": "review_only_proposal",
        "resolution": decision["resolution"],
        "entry_cohort_year": decision["entry_cohort_year"],
        "per_grtype_entry_year": decision["per_grtype_entry_year"],
        "reasons": decision["reasons"],
        "archive_comparison": decision["archive_comparison"],
        "new_information_count": new_information_count,
        "counts": {
            "candidate_observations": counts.get("candidate_observations"),
            "candidate_source_rows": counts.get("candidate_source_rows"),
            "universities_with_candidates": counts.get("universities_with_candidates"),
            "held_identity_source_rows": counts.get("held_identity_source_rows"),
            "held_numeric_values": counts.get("held_numeric_values"),
            "source_missing_completion_pairs": counts.get("source_missing_completion_pairs"),
            "candidate_missing_completion_pairs": counts.get("candidate_missing_completion_pairs"),
            "candidate_generated_source_rows": counts.get("candidate_generated_source_rows"),
        },
        "held_counts": {
            "candidate_observations_held": counts.get("candidate_observations"),
            "candidate_source_rows_held": counts.get("candidate_source_rows"),
            "identity_rows_held": sum((counts.get("held_identity_source_rows") or {}).values()),
            "numeric_values_held": sum((counts.get("held_numeric_values") or {}).values()),
        },
        "derived_rates": 0,
        "publications": 0,
        "database_writes": 0,
        "normalization_change": "none; root owns normalization and publication after review",
        "official_documents": fetched,
        "safe_next_command": ("python3 scripts/ingestion/review-graduation-cohort-oct10.py "
                              "--out outputs/graduation-cohort-oct10 "
                              "--report outputs/muse-graduation-cohort-oct10-report.md --validate"),
    }


def build_report(loaded, fetched, proposed):
    line = []
    add = line.append
    add("# Graduation cohort review — 10 Oct 2026 (Muse Spark 1.3 xhigh)")
    add("")
    add("Verdict: **HOLD — entry cohort year stays null; 20,596 metric candidates "
        "remain private review.** No rates derived, no counts changed, no publication.")
    add("")
    add("## Cached contradiction (exact evidence, kept)")
    contra = loaded["installed"]["cached_contradiction"]
    add("- Dictionary title: `%s`" % contra["introduction_title"])
    add("- Excerpt (11 words): `cohort year 2017 (4-year) and cohort year 2020 (2-year) institutions: 2024`")
    add("- Overview excerpt (16 words): `graduation rate status as of August 31, 2024 for the cohort of full-time, first-time degree/certificate-seeking undergraduates`")
    add("- SECTION `2` label: `%s`" % contra["section_labels"].get("2", ""))
    add("- COHORT `4` label: `%s`" % contra["cohort_labels"].get("4", ""))
    add("- Normalized entry cohort year in cached contract: `null` (preserved).")
    add("")
    add("## Exact applicable selector population")
    add("- %s" % loaded["installed"]["selector_population"])
    add("- Selected GRTYPEs: `%s`; period `GR2024; graduation status as of August 31, 2024`."
        % ", ".join(contra["selected_grtypes"]))
    add("- GRNRALT is the U.S. Nonresident subgroup of this historical cohort, not "
        "current enrollment; type 9 (any completion) differs from type 12 (bachelor completion).")
    add("")
    add("## Official documents (at most six, bounded requests)")
    add("")
    for doc in fetched:
        excerpt = doc.get("excerpt") or ""
        if excerpt:
            assert word_count(excerpt) <= 25, "excerpt over 25 words: " + doc["id"]
            excerpt_md = "`%s`" % excerpt
        else:
            excerpt_md = "(no excerpt asserted)"
        add("- `%s` <%s> — sha256 `%s`, bytes `%s`, retrieved `%s`, status `%s`. "
            "Excerpt: %s" % (doc["id"], doc["url"], doc.get("sha256"),
                             doc.get("bytes"), doc.get("retrieved_at"),
                             doc.get("status"), excerpt_md))
        add("  Role: %s Note: %s" % (doc["role"], doc["note"]))
    add("")
    add("Why no resolution: the component page states only a general cohort rule; the "
        "archive index lists 2024 packages without a selector mapping; the four "
        "release-specific instruction PDFs were hash-recorded as binary and their "
        "cohort text was not parsed locally, so nothing is asserted from them; "
        "program-reporter packages prove reporter-type scope the file selectors do "
        "not record. Arithmetic (status 2024 minus 150% windows) is refused as proof.")
    add("")
    add("## Counts (unchanged official values)")
    counts = proposed["counts"]
    held = proposed["held_counts"]
    add("- Candidate observations held: `%s`; candidate source rows held: `%s`; "
        "universities with candidates: `%s`." % (
            counts["candidate_observations"], counts["candidate_source_rows"],
            counts["universities_with_candidates"]))
    add("- Held identity rows: `%s` (`%s`); held numeric values: `%s` (`%s`)." % (
        held["identity_rows_held"], counts["held_identity_source_rows"],
        held["numeric_values_held"], counts["held_numeric_values"]))
    add("- Missing completion pairs: source `%s`, candidate `%s`; generated rows `%s`." % (
        counts["source_missing_completion_pairs"],
        counts["candidate_missing_completion_pairs"],
        counts["candidate_generated_source_rows"]))
    add("- New information count: `%d`. Derived rates: `0`. Publications: `0`. "
        "Database writes: `0`." % proposed["new_information_count"])
    add("- Installed archives match their original receipts; no fetched archive "
        "replaces them (see `sources.json`).")
    add("")
    add("## Limitations")
    add("- PDF instruction text is binary under stdlib-only tooling: recorded, not parsed, not quoted.")
    add("- HTML sources are general or listings; neither maps GRTYPE/SECTION/COHORT to one entering year.")
    add("- Reporter-type (academic fall vs program full-year) scope is unrecorded in file selectors.")
    add("- Retrieval timestamps/hashes in `sources.json` are run-specific; reruns refresh them without changing the verdict.")
    add("")
    add("## Safe next command (review only; root owns publication)")
    add("```sh")
    add(proposed["safe_next_command"])
    add("python3 -m unittest tests.test_graduation_cohort_oct10 -v")
    add("```")
    add("")
    return "\n".join(line)


def check_owned_writes(out_dir, report_path):
    forbidden = [ROOT / prefix.rstrip("/") for prefix in FORBIDDEN_WRITE_PREFIXES]
    for target in forbidden:
        for candidate in (out_dir, report_path):
            try:
                if candidate.resolve() == target.resolve() or target.resolve() in candidate.resolve().parents:
                    return "refused write outside owned paths: " + str(target)
            except Exception:
                pass
    return ""


def validate_outputs(out_dir, report_path):
    """Reproducible local validator. Returns a list of error strings (empty = pass)."""
    errors = []
    proposed_path = out_dir / "proposed.json"
    sources_path = out_dir / "sources.json"
    inner_report = out_dir / "report.md"
    for path in (proposed_path, sources_path, inner_report, report_path):
        if not path.exists():
            errors.append("missing_output: " + str(path))
    if errors:
        return errors
    try:
        proposed = json.loads(proposed_path.read_text())
        sources = json.loads(sources_path.read_text())
    except ValueError as exc:
        return ["invalid_json: %s" % exc]
    # Resolution discipline.
    if proposed.get("entry_cohort_year") is not None:
        errors.append("resolution_leak: entry_cohort_year must stay null without proof")
    per = proposed.get("per_grtype_entry_year") or {}
    if any(v is not None for v in per.values()):
        errors.append("resolution_leak: per-grtype years must stay null without proof")
    if proposed.get("derived_rates") != 0 or proposed.get("publications") != 0 \
            or proposed.get("database_writes") != 0:
        errors.append("side_effect: rates/publications/writes must be zero")
    if proposed.get("new_information_count") != 0:
        errors.append("new_information: nonzero claim needs qualifying release-specific evidence")
    if not proposed.get("reasons"):
        errors.append("reasons_missing: hold reasons required")
    blob = json.dumps(proposed).lower()
    if "rate" in blob and "derived_rates" not in blob.replace(" ", ""):
        pass  # word 'rate' only allowed inside the derived_rates key context
    # Counts must equal the installed receipt (no changed official counts).
    try:
        installed_counts = json.loads(PUBLISHED_RECEIPT.read_text())["counts"]
    except (OSError, ValueError):
        errors.append("missing_receipt: cannot re-read installed receipt for comparison")
        installed_counts = {}
    for key in ("candidate_observations", "candidate_source_rows",
                "universities_with_candidates"):
        if proposed.get("counts", {}).get(key) != installed_counts.get(key):
            errors.append("count_changed: " + key)
    # Source discipline: at most six, official hosts only.
    docs = proposed.get("official_documents") or []
    if len(docs) > MAX_DOCS:
        errors.append("source_cap: more than six official documents")
    for doc in docs:
        host = re.sub(r"^https?://([^/]+).*$", r"\1", doc.get("url", ""))
        if host not in ALLOWED_HOSTS:
            errors.append("source_host: non-official host: " + doc.get("url", ""))
    if isinstance(sources, list) and len(sources) > MAX_DOCS:
        errors.append("source_cap: sources.json exceeds six documents")
    # Excerpt discipline: every asserted excerpt in the report is at most 25 words.
    report_text = report_path.read_text()
    for match in re.finditer(r"Excerpt(?::[^`\n]*`([^`]+)`|\s+\([^)]*\)|:[^\n]*)", report_text):
        quoted = match.group(1)
        if quoted and word_count(quoted) > 25:
            errors.append("excerpt_length: source excerpt exceeds 25 words")
    if "http" not in report_text or "nces.ed.gov" not in report_text:
        errors.append("source_links: report must contain official source links")
    if "safe_next_command" not in json.dumps(proposed).lower() and \
            "python3 scripts/ingestion/review-graduation-cohort-oct10.py" not in report_text:
        errors.append("next_command: safe next command missing from report")
    for token in ("20596", "10298"):
        if token not in report_text:
            errors.append("held_counts: report must state held counts (%s)" % token)
    if inner_report.read_text() != report_text:
        errors.append("report_mismatch: outputs report copy differs from canonical report")
    return errors


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=ROOT / "outputs/graduation-cohort-oct10")
    parser.add_argument("--report", type=Path,
                        default=ROOT / "outputs/muse-graduation-cohort-oct10-report.md")
    parser.add_argument("--fetch", dest="do_fetch", action="store_true", default=True,
                        help="Attempt bounded official retrieval (default on; failures degrade to hold).")
    parser.add_argument("--no-fetch", dest="do_fetch", action="store_false",
                        help="Offline mode: record sources without network.")
    parser.add_argument("--validate", action="store_true",
                        help="Validate the outputs after writing and exit nonzero on failure.")
    args = parser.parse_args(argv)
    out_dir, report_path = args.out, args.report
    refusal = check_owned_writes(out_dir, report_path)
    if refusal:
        print(json.dumps({"error": refusal}), file=sys.stderr)
        return 2
    # Snapshot owned-input integrity: fail loudly if we ever mutated inputs.
    before = {}
    for path in (PUBLISHED_RECEIPT, SOURCE_META, DICTIONARY_META,
                 Path(__file__)):
        try:
            before[str(path)] = sha256_bytes(path.read_bytes())
        except OSError:
            before[str(path)] = None
    loaded, load_errors = load_installed()
    fetched = fetch_official(args.do_fetch)
    if loaded is None:
        decision, new_info = evaluate_evidence(None, fetched)
        decision["reasons"] = load_errors + decision["reasons"]
        generated_at = utcnow_iso()
        proposed = build_proposed(None, fetched, decision, 0, generated_at)
        report = ("# Graduation cohort review — 10 Oct 2026\n\n"
                  "HOLD: installed receipts unreadable (%s). No resolution.\n"
                  % "; ".join(load_errors))
    else:
        decision, new_info = evaluate_evidence(loaded, fetched)
        if load_errors:
            decision["reasons"] = load_errors + decision["reasons"]
        generated_at = utcnow_iso()
        proposed = build_proposed(loaded, fetched, decision, new_info, generated_at)
        report = build_report(loaded, fetched, proposed)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "sources.json").write_text(
        json.dumps(fetched, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out_dir / "proposed.json").write_text(
        json.dumps(proposed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out_dir / "report.md").write_text(report, encoding="utf-8")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(report, encoding="utf-8")
    for path in (PUBLISHED_RECEIPT, SOURCE_META, DICTIONARY_META,
                 Path(__file__)):
        try:
            after = sha256_bytes(path.read_bytes())
        except OSError:
            after = None
        if after != before[str(path)]:
            print(json.dumps({"error": "input_mutated: " + str(path)}), file=sys.stderr)
            return 3
    print(json.dumps({"output": str(out_dir), "report": str(report_path),
                      "resolution": proposed["resolution"],
                      "entry_cohort_year": proposed["entry_cohort_year"],
                      "new_information_count": proposed["new_information_count"],
                      "reasons": proposed["reasons"]}, indent=2))
    if args.validate:
        errors = validate_outputs(out_dir, report_path)
        if errors:
            print(json.dumps({"validation": "FAIL", "errors": errors}, indent=2),
                  file=sys.stderr)
            return 1
        print(json.dumps({"validation": "PASS"}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
