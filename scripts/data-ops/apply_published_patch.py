"""Apply data/curated/published-patch.json to data/published/global-directory.json.

Owner-approved 16 Nov 2026. Idempotent: re-running on an already patched file changes nothing.
Backup of the pre-patch files: data/archive/backup-2026-11-16/published/.

- updates: sets the Scorecard values and records per-field provenance in `field_sources`
  ({academic_year, source, source_url, retrieved_at}) taken from data/curated/universities.ndjson.
- exclusions: the record stays in the file with `published: false` and `exclusion: {reason, detail}`
  (hidden, never deleted; undo via data/curated/overrides.json or the backup).
- duplicate merges: identity fields the kept record lacks (ror, external_ids, founded_year,
  coordinates) are copied from the duplicate, its name/aliases are added to the kept record's aliases,
  the duplicate gets `exclusion.merged_into`, and identity-redirects.json maps the duplicate id/slug to
  the kept record so old URLs permanently redirect.

Usage: python3 scripts/data-ops/apply_published_patch.py [--dry-run]
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DIRECTORY = ROOT / "data/published/global-directory.json"
REDIRECTS = ROOT / "data/published/identity-redirects.json"
PATCH = ROOT / "data/curated/published-patch.json"
CURATED = ROOT / "data/curated/universities.ndjson"

FACT_OF = {
    "tuition_fees_out_of_state": "tuition",
    "acceptance_rate": "acceptance_rate",
    "sat_reading_25": "sat_scores", "sat_reading_75": "sat_scores",
    "sat_math_25": "sat_scores", "sat_math_75": "sat_scores",
    "act_25": "act_scores", "act_75": "act_scores",
}


def main(dry: bool) -> None:
    raw = DIRECTORY.read_text()
    directory = json.loads(raw)
    by_id = {r["id"]: r for r in directory}
    patch = json.loads(PATCH.read_text())
    redirects = json.loads(REDIRECTS.read_text())
    wanted = {u["id"] for u in patch["updates"]}
    curated = {}
    with CURATED.open() as fh:
        for line in fh:
            if not line.strip():
                continue
            rec = json.loads(line)
            if rec["id"] in wanted:
                curated[rec["id"]] = rec["facts"]

    stats = {"records_updated": 0, "values_set": 0, "hidden": 0, "merged": 0, "redirects_added": 0}
    for u in patch["updates"]:
        row = by_id[u["id"]]
        facts = curated.get(u["id"], {})
        sources = dict(row.get("field_sources") or {})
        touched = False
        for key, ch in u["changes"].items():
            fact = facts.get(FACT_OF[key]) or {}
            meta = {
                "academic_year": fact.get("academic_year") or u["academic_year"],
                "source": u["source"],
                "source_url": fact.get("source_url") or "https://collegescorecard.ed.gov/data/",
                "retrieved_at": fact.get("retrieved_at") or "2026-11-16",
            }
            if row.get(key) != ch["to"]:
                row[key] = ch["to"]
                stats["values_set"] += 1
                touched = True
            if sources.get(key) != meta:
                sources[key] = meta
                touched = True
        if sources:
            row["field_sources"] = dict(sorted(sources.items()))
        stats["records_updated"] += touched

    merged_into = {}
    for m in patch["duplicate_merges"]:
        for d in m["merge"]:
            merged_into[d["id"]] = m["keep"]

    for e in patch["exclusions"]:
        row = by_id.get(e["id"])
        if row is None:
            continue
        exclusion = {"reason": e["reason"], "detail": e["detail"], "decided_at": "2026-11-16"}
        if e["id"] in merged_into:
            exclusion["merged_into"] = merged_into[e["id"]]
        if row.get("published") is not False or row.get("exclusion") != exclusion:
            stats["hidden"] += row.get("published") is not False
            row["published"] = False
            row["exclusion"] = exclusion

    for dup_id, keep_id in merged_into.items():
        dup, keep = by_id.get(dup_id), by_id.get(keep_id)
        if dup is None or keep is None:
            continue
        changed = False
        for key in ("ror", "external_ids", "founded_year", "latitude", "longitude"):
            if keep.get(key) is None and dup.get(key) is not None:
                keep[key] = dup[key]
                changed = True
        aliases = list(keep.get("aliases") or [])
        for name in [dup["name"], *(dup.get("aliases") or [])]:
            if name and name != keep["name"] and name not in aliases:
                aliases.append(name)
                changed = True
        if aliases:
            keep["aliases"] = aliases
        stats["merged"] += changed
        target = {"id": keep_id, "slug": keep["slug"], "old_slug": dup["slug"]}
        if dup["slug"] != keep["slug"] and redirects.get(dup_id) != target:
            redirects[dup_id] = target
            stats["redirects_added"] += 1

    print(json.dumps(stats))
    if dry:
        return
    out = json.dumps(directory, separators=(",", ":"), ensure_ascii=True) + "\n"
    if out != raw:
        DIRECTORY.write_text(out)
    REDIRECTS.write_text(json.dumps(redirects, indent=2) + "\n")


if __name__ == "__main__":
    main("--dry-run" in sys.argv)
