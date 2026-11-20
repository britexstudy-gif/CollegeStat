#!/usr/bin/env python3
"""Fill admissions-data gaps (English minimums, tuition, fees, deadlines, SAT, acceptance rate)
with Codex agents using live web search. Writes review files only
(data/review/codex-gaps-nov18/out/batch-*.json); nothing is imported or published.
Resumable: finished batches are skipped. Usage: codex-gaps.py [--size 4] [--jobs 6] [--limit N]"""
import argparse, json, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DIR = ROOT / "data/review/codex-gaps-nov18"
WORK = Path("/private/tmp/claude-501/-Users-likeanew-Documents-CollegeStat/9441e680-0d40-4c1b-955e-c39e4b6d14aa/scratchpad/codex-work")

ap = argparse.ArgumentParser()
ap.add_argument("--size", type=int, default=4)
ap.add_argument("--jobs", type=int, default=6)
ap.add_argument("--limit", type=int, default=0)
ap.add_argument("--targets", default="targets.json")
ap.add_argument("--out", default="out")
a = ap.parse_args()

targets = json.load(open(DIR / a.targets))
if a.limit:
    targets = targets[: a.limit]
batches = [targets[i : i + a.size] for i in range(0, len(targets), a.size)]
prompt = (DIR / "prompt.md").read_text()
(DIR / "runs").mkdir(exist_ok=True)
(DIR / a.out).mkdir(exist_ok=True)
WORK.mkdir(parents=True, exist_ok=True)


def run(i_batch):
    i, batch = i_batch
    out = DIR / a.out / f"batch-{i:03d}.json"
    if out.exists() and out.stat().st_size > 20:
        return i, "skip"
    body = prompt + "\n".join(f"- id: {t['id']} | {t['name']} | {t['city']}, {t['country_code']} | {t['website']}" for t in batch)
    log = open(DIR / f"runs/{a.out}-batch-{i:03d}.log", "w")
    for attempt in range(2):
        r = subprocess.run(
            ["codex", "exec", "--skip-git-repo-check", "--ephemeral", "-s", "read-only", "-c", 'web_search="live"',
             "-C", str(WORK), "--output-schema", str(DIR / "schema.json"), "-o", str(out), "-"],
            input=body, text=True, stdout=log, stderr=subprocess.STDOUT, timeout=1500,
        )
        try:
            json.load(open(out))
            return i, "ok"
        except Exception:
            out.unlink(missing_ok=True)
    return i, f"fail rc={r.returncode}"


with ThreadPoolExecutor(a.jobs) as ex:
    for i, status in ex.map(run, enumerate(batches)):
        print(f"batch {i:03d}/{len(batches)} {status}", flush=True)
