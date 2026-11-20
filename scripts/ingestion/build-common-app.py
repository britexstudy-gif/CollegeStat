"""Build data/published/common-app-members.json from Common App's public
"Explore colleges" pages (commonapp.org/explore). Each school's page-data JSON
carries its IPEDS UNITID, which joins it to CollegeStat ids through
global-directory.json; non-US members fall back to an exact name match.

Usage: python3 scripts/ingestion/build-common-app.py <dir of page-data .json files> <retrieved yyyy-mm-dd>
"""

import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PUBLISHED = ROOT / "data" / "published"
DESIGNATIONS = {
    "field_filter_hbcu": "HBCU",
    "field_filter_hsi": "Hispanic-Serving Institution",
    "field_filter_aanapisi": "AANAPISI",
    "field_filter_pbi": "Predominantly Black Institution",
    "field_filter_nasnti": "NASNTI",
    "field_filter_aanhi": "ANNH",
}


def yes(value):
    return None if value is None else value == "Yes"


def aid(value):
    return {"Yes": True, "No": False}.get(value)


def clean(text, limit=600):
    if not text:
        return None
    text = re.sub(r"<[^>]+>", " ", html.unescape(html.unescape(text)))
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > limit:
        text = text[:limit].rsplit(" ", 1)[0] + "…"
    return text or None


def norm(name):
    return re.sub(r"[^a-z0-9]", "", name.lower())


def build(pages_dir, retrieved):
    directory = json.loads((PUBLISHED / "global-directory.json").read_text())
    by_unitid = {str(r["unitid"]): r["id"] for r in directory if r.get("unitid")}
    by_name = {}
    for r in directory:
        by_name.setdefault(norm(r["name"]), r["id"])
    records, unmatched = {}, []
    for path in sorted(Path(pages_dir).glob("*.json")):
        try:
            node = json.loads(path.read_text())["result"]["data"]["nodeSchool"]
        except (ValueError, KeyError, TypeError):
            continue
        rel = node.get("relationships") or {}
        site = rel.get("field_site_update") or {}
        member = rel.get("field_membership_profile") or {}
        uid = by_unitid.get(str(site.get("field_su_ipeds") or "")) or by_name.get(norm(node["title"]))
        if not uid:
            unmatched.append(node["title"])
            continue
        majors = (site.get("field_su_details_aca_prog_tag") or [])[:12]
        rec = {
            "url": "https://www.commonapp.org/explore/" + path.stem,
            "test_flexible": yes(site.get("field_su_ff_fy_tp")),
            "charges_fee": yes(site.get("field_su_ff_fy_caf")),
            "essay_required": yes(site.get("field_su_ff_fy_per")),
            "recs_required": yes(site.get("field_su_ff_fy_rec_req")),
            "self_reported_scores": yes(site.get("field_su_ff_fy_srs")),
            "transfer": node.get("field_acc_md_tr_participation") == "Yes",
            "need_aid": aid(member.get("field_mp_fac_need_fa")),
            "merit_aid": aid(member.get("field_mp_fac_merit_fa")),
            "international_aid": aid(member.get("field_mp_fac_international_fa")),
            "first_year_note": clean(site.get("field_su_tb_applying_to_fy")),
            "majors": majors or None,
            "student_life": (site.get("field_su_details_student_exp_tag") or [])[:14] or None,
            "setting": site.get("field_su_details_campus_setting"),
            "size": site.get("field_su_details_enroll_size"),
            "designations": [label for key, label in DESIGNATIONS.items() if node.get(key)] or None,
        }
        records[uid] = {k: v for k, v in rec.items() if v is not None}
    out = {
        "source": {
            "name": "Common App — Explore colleges (public member profiles)",
            "url": "https://www.commonapp.org/explore",
            "retrieved_at": retrieved,
            "notes": [
                "Requirement flags describe first-year applications through Common App and can change during the season.",
                "Deadlines and fees per plan are in Common App's requirements grid, which is only available after signing in.",
            ],
        },
        "records": records,
    }
    target = PUBLISHED / "common-app-members.json"
    target.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False))
    print(f"{len(records)} matched, {len(unmatched)} unmatched -> {target} ({target.stat().st_size // 1024} KB)")
    if unmatched:
        print("unmatched sample:", unmatched[:15])


if __name__ == "__main__":
    build(sys.argv[1], sys.argv[2])
