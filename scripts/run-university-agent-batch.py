#!/usr/bin/env python3
"""Prepare 200 public-only tasks; execute bounded external-agent jobs with --run.

No credentials, repository files or transcripts are copied into agent folders.
Reports are research candidates and are never imported or published.
"""
from __future__ import annotations

import argparse
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import select
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from urllib.parse import urlparse
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
REVIEW_DATE = datetime.now(timezone.utc).date().isoformat()
MANIFEST_PATH = ROOT / "data/review/university-agent-batch-oct15.json"
MODEL = "opencode/muse-spark-1.3-contributor-free#xhigh"
SCOPES = {"opencode": "academics_admissions_costs_rankings", "freebuff": "identity_people_media"}
FIELDS = {
    "opencode": set("program_directory subject_directory programme entry_requirement required_subject language_requirement language_exemption application_route application_cycle deadline applicant_count admitted_count enrolled_count tuition mandatory_fee living_cost accommodation_cost scholarship financial_aid ranking".split()),
    "freebuff": set("official_name campus founded founder influential_person student_story official_logo brand_guidance campus_gallery campus_photo virtual_tour official_video_channel university_video".split()),
}


def now():
    return datetime.now(timezone.utc).isoformat()


def normalized(value):
    return re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower())


def host(value):
    return (urlparse(value if "://" in value else "https://" + value).hostname or "").removeprefix("www.")


def public_url(value):
    if not isinstance(value, str) or len(value) > 3000:
        return False
    try:
        parsed = urlparse(value)
        name = parsed.hostname or ""
        if parsed.scheme not in ("http", "https") or parsed.username or parsed.password or "." not in name:
            return False
        if name in ("localhost", "example.com", "example.org", "example.edu") or name.endswith((".local", ".localhost", ".example.edu")):
            return False
        try:
            return ipaddress.ip_address(name).is_global
        except ValueError:
            return True
    except ValueError:
        return False


def prepare():
    source = json.loads((ROOT / "data/review/muse-public-universities-oct12.json").read_text())["tasks"]
    directory = json.loads((ROOT / "data/published/global-directory.json").read_text())
    name_index, domain_index = {}, {}
    for record in directory:
        for name in [record["name"], *record.get("aliases", [])]:
            name_index.setdefault(normalized(name), {})[record["id"]] = record
        for domain in [record.get("website") or "", *record.get("domains", [])]:
            if domain:
                domain_index.setdefault(host(domain), {})[record["id"]] = record
    universities, tasks, seen = [], [], set()
    folder = ROOT / "docs/agent-prompts/universities"
    folder.mkdir(parents=True, exist_ok=True)
    for candidate in source:
        matches = name_index.get(normalized(candidate["name"]), {})
        if len(matches) != 1:
            matches = domain_index.get(host(candidate["website"]), {})
        if len(matches) != 1:
            raise ValueError(f"University identity requires review: {candidate['task']}")
        record = next(iter(matches.values()))
        if record["id"] in seen or not public_url(record["website"]):
            raise ValueError("Duplicate university identity or invalid public website")
        seen.add(record["id"])
        university = {"task": candidate["task"], "id": record["id"], "slug": record["slug"], "name": record["name"], "website": record["website"], "countryCode": record["country_code"]}
        universities.append(university)
        for provider, template_name in [("opencode", "opencode-university-evidence-template.md"), ("freebuff", "freebuff-university-people-media-template.md")]:
            prompt = (ROOT / "docs/agent-prompts" / template_name).read_text()
            for key, value in {"NAME": university["name"], "ID": university["id"], "WEBSITE": university["website"], "TASK": university["task"], "DATE": REVIEW_DATE}.items():
                prompt = prompt.replace("{{" + key + "}}", value)
            filename = f"{university['task']}-{provider}.md"
            target = folder / filename
            target.write_text(prompt)
            tasks.append({"task": f"{university['task']}-{provider}", "universityTask": university["task"], "universityId": university["id"], "university": university["name"], "provider": provider, "scope": SCOPES[provider], "prompt": str(target.relative_to(ROOT)), "promptSha256": hashlib.sha256(prompt.encode()).hexdigest()})
    if len(universities) != 100 or len(tasks) != 200:
        raise ValueError("Expected 100 unique universities and 200 provider tasks")
    manifest = {"schemaVersion": 1, "preparedAt": REVIEW_DATE, "status": "prepared_candidates_only", "uniqueUniversities": len(universities), "preparedTasks": len(tasks), "executionTrackedIn": "outputs/university-agent-batch-oct15/*/receipt.json", "publishedRecords": 0, "opencodeModel": MODEL, "freebuffModel": "installed_default", "universities": universities, "tasks": tasks}
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    return manifest


def validate_report(report, job):
    if not isinstance(report, dict) or report.get("universityId") != job["universityId"] or report.get("provider") != job["provider"]:
        return None
    if report.get("scope") != job["scope"] or not isinstance(report.get("facts"), list):
        return None
    facts, rejected = [], 0
    for fact in report["facts"][:200]:
        if not isinstance(fact, dict) or fact.get("field") not in FIELDS[job["provider"]] or not public_url(fact.get("sourceUrl")):
            rejected += 1
            continue
        if any(not isinstance(fact.get(field), str) or not 0 < len(fact[field]) <= 700 for field in ("sourceTitle", "publisher", "population", "evidence")) or "value" not in fact:
            rejected += 1
            continue
        facts.append({key: fact.get(key) for key in ("field", "value", "sourceUrl", "sourceTitle", "publisher", "sourceYear", "retrievedAt", "population", "evidence", "reuse")})
    missing = [item for item in report.get("missing", [])[:100] if isinstance(item, dict) and isinstance(item.get("field"), str) and isinstance(item.get("reason"), str)] if isinstance(report.get("missing"), list) else []
    if not facts and not missing:
        return None
    return {"schemaVersion": 1, "universityId": job["universityId"], "university": job["university"], "provider": job["provider"], "scope": job["scope"], "checkedAt": report.get("checkedAt"), "reviewState": "pending_native_review", "facts": facts, "missing": missing, "conflicts": report.get("conflicts", []) if isinstance(report.get("conflicts", []), list) else [], "validation": {"acceptedFactCount": len(facts), "rejectedFactCount": rejected, "primarySourceReviewRequired": True}, "publishedRecords": 0}


def extract_opencode_report(transcript, job):
    texts = []
    for line in transcript.splitlines():
        try:
            event = json.loads(line)
            if not isinstance(event, dict):
                continue
            if event.get("type") == "text" and isinstance(event.get("part", {}).get("text"), str):
                texts.append(event["part"]["text"])
        except (ValueError, TypeError):
            pass
    decoder, found = json.JSONDecoder(), None
    for text in texts:
        for match in re.finditer(r"\{", text):
            try:
                candidate, _ = decoder.raw_decode(text[match.start():])
                result = validate_report(candidate, job)
                if result:
                    found = result
            except (ValueError, TypeError):
                pass
    return found


def ready_tasks_for_date(jobs, review_date):
    """Resume only from today's completed, schema-valid candidate reports."""
    jobs_by_task = {job["task"]: job for job in jobs}
    ready = set()
    output_root = ROOT / "outputs/university-agent-batch-oct15"
    for receipt_path in output_root.glob("*/receipt.json"):
        try:
            receipt = json.loads(receipt_path.read_text())
            for row in receipt.get("jobs", []):
                job = jobs_by_task.get(row.get("task"))
                if not job or row.get("status") != "candidate_ready" or not str(row.get("finishedAt", "")).startswith(review_date):
                    continue
                candidate_path = (ROOT / row.get("report", "")).resolve()
                if not candidate_path.is_relative_to(output_root.resolve()) or not candidate_path.is_file():
                    continue
                candidate = validate_report(json.loads(candidate_path.read_text()), job)
                if candidate and candidate["facts"]:
                    ready.add(job["task"])
        except (OSError, ValueError, TypeError, AttributeError):
            continue
    return ready


def infrastructure_failure(text, timed_out=False):
    text = text.lower()
    if any(value in text for value in ["quota exceeded", "usage limit", "rate_limit_exceeded", "insufficient credits", "insufficient balance", "daily limit"]):
        return "quota"
    if any(value in text for value in ["apiconnectionerror", "econnrefused", "enotfound", "getaddrinfo", "unable to connect", "network is unreachable", "could not connect"]):
        return "network"
    if any(value in text for value in ["authentication required", "not logged in", "unauthorized", "invalid api key"]):
        return "authentication"
    if "standalone server exited before reporting readiness" in text:
        return "startup"
    return "timeout" if timed_out else None


def diagnostic_summary(text):
    """Persist only bounded failure lines, with credentials and local paths removed."""
    selected = []
    for line in text.splitlines():
        try:
            event = json.loads(line)
            if not isinstance(event, dict):
                continue
            if "error" in event.get("type", ""):
                error = event.get("error", {})
                line = error.get("message", "Agent returned an error") if isinstance(error, dict) else str(error)
            elif event.get("type") == "text":
                line = event.get("part", {}).get("text", "")[-300:]
            else:
                continue
        except (ValueError, TypeError):
            if not re.search(r"error|eperm|enoent|unknown|cannot|failed|usage|permission|not found", line, re.I):
                continue
        line = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", line)
        line = re.sub(r"(?i)(bearer\s+|(?:api[_-]?key|token|password|secret)[\s\"':=]+)[A-Za-z0-9._~+/=-]{6,}", r"\1[redacted]", line)
        line = re.sub(r"https?://[^\s]+", "[url omitted]", line)
        line = re.sub(r"/(?:Users|private|var|tmp)/[^\s\"')]+", "[local path]", line)
        selected.append(line.strip())
    return " | ".join(selected[-3:])[:500] or "Agent exited without a validated report; no error detail emitted."


def terminal_progress(text):
    """Record UI milestones without retaining terminal contents or account data."""
    plain = re.sub(r"\x1b\][^\x07]*(?:\x07|\x1b\\)", "", text)
    plain = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", plain).lower()
    return {
        "welcomeVisible": "your first message starts" in plain,
        "researchInstructionVisible": "read the public research instructions" in plain,
        "modelSessionStarted": "starting your model session" in plain,
        "modelThinking": "thinking" in plain,
        "toolActivity": any(marker in plain for marker in ("read url", "web search", "read file", "write file")),
        "researchCompleted": "research_complete" in plain,
    }


class Batch:
    def __init__(self, jobs, args):
        self.jobs, self.args = jobs, args
        self.id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid4().hex[:6]
        self.work = Path(tempfile.mkdtemp(prefix="collegestat-public-agents-", dir="/tmp"))
        self.output = ROOT / "outputs/university-agent-batch-oct15" / self.id
        self.output.mkdir(parents=True)
        self.lock, self.stop = threading.RLock(), threading.Event()
        self.results, self.processes, self.failures, self.disabled = {}, {}, {"opencode": 0, "freebuff": 0}, {}
        self.freebuff_slots = threading.Semaphore(2)
        self.started = now()
        self.prompts = {}
        for job in jobs:
            prompt = (ROOT / job["prompt"]).read_text()
            if hashlib.sha256(prompt.encode()).hexdigest() != job["promptSha256"]:
                raise ValueError("Prepared public prompt changed; prepare again")
            self.prompts[job["task"]] = prompt

    def save(self):
        with self.lock:
            payload = {"schemaVersion": 1, "batchId": self.id, "startedAt": self.started, "updatedAt": now(), "status": "interrupted" if self.stop.is_set() else ("finished" if len(self.results) == len(self.jobs) and all(row["status"] != "running" for row in self.results.values()) else "running"), "requestedTasks": len(self.jobs), "startedTasks": sum(bool(row.get("startedAt")) for row in self.results.values()), "finishedTasks": sum(row["status"] not in ("running", "skipped_provider_unavailable", "skipped_interrupted") for row in self.results.values()), "candidateReports": sum(bool(row.get("report")) for row in self.results.values()), "candidateFactCount": sum(row.get("factCount", 0) for row in self.results.values()), "publishedRecords": 0, "concurrency": self.args.concurrency, "timeoutSeconds": self.args.timeout, "opencodeModel": MODEL, "freebuffModel": "installed_default", "disabledProviders": self.disabled, "jobs": list(self.results.values())}
            target = self.output / "receipt.json"
            temporary = target.with_suffix(".tmp")
            temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
            temporary.replace(target)

    def terminate(self, process):
        if process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=3)
            except ProcessLookupError:
                pass

    def cancel(self, *_):
        self.stop.set()
        with self.lock:
            processes = list(self.processes.values())
        for process in processes:
            self.terminate(process)

    def run(self, job):
        semaphore = self.freebuff_slots if job["provider"] == "freebuff" else threading.Semaphore(1)
        with semaphore:
            return self.run_one(job)

    def run_one(self, job):
        row = {key: job[key] for key in ("task", "universityId", "university", "provider", "scope")}
        row.update({"status": "running", "report": None, "reportBytes": 0, "factCount": 0, "publishedRecords": 0})
        with self.lock:
            if self.stop.is_set() or job["provider"] in self.disabled:
                row["status"] = "skipped_interrupted" if self.stop.is_set() else "skipped_provider_unavailable"
                self.results[job["task"]] = row
                self.save()
                return row
            row["startedAt"] = now()
            self.results[job["task"]] = row
            self.save()
        folder = self.work / job["task"]
        folder.mkdir()
        prompt = self.prompts[job["task"]]
        (folder / "prompt.md").write_text(prompt)
        executable = shutil.which(job["provider"]) or str(Path.home() / ".local/bin" / job["provider"])
        transcript, process, master, stream = bytearray(), None, None, None
        timed_out, terminated_after_report, report, source = False, False, None, None
        started = time.monotonic()
        try:
            if job["provider"] == "opencode":
                command = [executable, "run", "--standalone", "--model", MODEL, "--format", "json", "--file", str(folder / "prompt.md"), "Complete only the attached public-source task. Emit the complete report JSON in your final response. Do not write files or read repository/private files."]
                process = subprocess.Popen(command, cwd=folder, env={**os.environ, "PWD": str(folder)}, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
                stream = process.stdout.fileno()
            else:
                import fcntl
                import struct
                import termios
                master, slave = os.openpty()
                fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 140, 0, 0))
                terminal_launcher = "import fcntl,os,sys,termios; fcntl.ioctl(0,termios.TIOCSCTTY,0); os.execv(sys.argv[1],sys.argv[1:])"
                process = subprocess.Popen([sys.executable, "-c", terminal_launcher, executable, "--cwd", str(folder)], cwd=folder, stdin=slave, stdout=slave, stderr=slave, start_new_session=True, env={**os.environ, "TERM": "xterm-256color", "PWD": str(folder)})
                os.close(slave)
                stream = master
            with self.lock:
                self.processes[job["task"]] = process
            pasted, submitted, pasted_at = False, False, None
            finalize_stage, finalize_at, progress_at, ui_progress = None, None, 0, {}
            while True:
                elapsed = time.monotonic() - started
                if self.stop.is_set() or elapsed >= self.args.timeout:
                    timed_out = elapsed >= self.args.timeout
                    self.terminate(process)
                    break
                if job["provider"] == "freebuff" and not pasted and elapsed >= 9:
                    instruction = f"Read the public research instructions in {folder / 'prompt.md'} and complete only that task. Write report.json in {folder}. Do not read any other local files."
                    os.write(master, instruction.encode())
                    pasted = True
                    pasted_at = time.monotonic()
                if job["provider"] == "freebuff" and pasted and not submitted and time.monotonic() - pasted_at >= 1:
                    # OpenTUI must finish processing pasted text before Enter
                    # arrives; combining them can leave the task in draft.
                    os.write(master, b"\r")
                    submitted = True
                if job["provider"] == "freebuff" and submitted and finalize_stage is None and elapsed >= max(12, min(270, self.args.timeout * 0.75)):
                    # Leave time to save useful partial research before the
                    # hard deadline instead of discarding a long thinking run.
                    os.write(master, b"\x1b")
                    finalize_stage, finalize_at = "interrupted_research", time.monotonic()
                if finalize_stage == "interrupted_research" and time.monotonic() - finalize_at >= 3:
                    instruction = f"Stop research now. Save the useful partial evidence already inspected to {folder / 'report.json'} using the exact report schema from prompt.md. Put unverified categories in missing. Do not inspect more sources. All facts remain pending_native_review."
                    os.write(master, instruction.encode())
                    finalize_stage, finalize_at = "pasted_save_request", time.monotonic()
                if finalize_stage == "pasted_save_request" and time.monotonic() - finalize_at >= 1:
                    os.write(master, b"\r")
                    finalize_stage = "submitted_save_request"
                    row["partialReportRequestedAt"] = now()
                if select.select([stream], [], [], 0.25)[0]:
                    try:
                        chunk = os.read(stream, 65536)
                    except OSError:
                        chunk = b""
                    transcript.extend(chunk)
                    if job["provider"] == "freebuff":
                        progress = terminal_progress(chunk.decode("utf-8", "replace"))
                        ui_progress = {key: value or ui_progress.get(key, False) for key, value in progress.items()}
                    if len(transcript) > 2_000_000:
                        del transcript[:-2_000_000]
                if job["provider"] == "freebuff" and elapsed - progress_at >= 30:
                    progress_at = elapsed
                    row["terminalProgress"] = ui_progress
                    row["promptSubmitted"] = submitted
                    self.save()
                destination = folder / "report.json"
                if destination.is_file() and destination.stat().st_size <= 512_000:
                    try:
                        report = validate_report(json.loads(destination.read_text()), job)
                    except (ValueError, OSError):
                        report = None
                    if report:
                        source = "agent_report_file"
                        if job["provider"] == "freebuff" or process.poll() is None:
                            terminated_after_report = process.poll() is None
                            self.terminate(process)
                        break
                if process.poll() is not None:
                    while select.select([stream], [], [], 0)[0]:
                        try:
                            chunk = os.read(stream, 65536)
                        except OSError:
                            break
                        if not chunk:
                            break
                        transcript.extend(chunk)
                    break
            text = transcript.decode("utf-8", "replace")
            if not report and job["provider"] == "opencode":
                report = extract_opencode_report(text, job)
                if report:
                    source = "agent_final_json"
            row.update({"exitStatus": process.wait(timeout=4), "timedOut": timed_out, "terminatedAfterReport": terminated_after_report, "finishedAt": now(), "durationSeconds": round(time.monotonic() - started, 2)})
            if job["provider"] == "freebuff":
                row["promptSubmitted"] = submitted
                progress = terminal_progress(text)
                row["terminalProgress"] = {key: value or ui_progress.get(key, False) for key, value in progress.items()}
                row["sessionStarted"] = row["terminalProgress"]["modelSessionStarted"] or row["terminalProgress"]["modelThinking"] or row["terminalProgress"]["toolActivity"]
            if report:
                report["collection"] = {"startedAt": row["startedAt"], "finishedAt": row["finishedAt"], "promptReviewDate": REVIEW_DATE, "agentReportedCheckedAt": report.get("checkedAt"), "sourceRetrievalNotIndependentlyVerified": True}
                target = self.output / (job["task"] + ".json")
                target.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
                row.update({"status": "candidate_ready" if report["facts"] else "completed_no_facts", "report": str(target.relative_to(ROOT)), "reportBytes": target.stat().st_size, "factCount": len(report["facts"]), "reportSource": source})
            else:
                row["status"] = "interrupted" if self.stop.is_set() else ("timeout" if timed_out else ("failed" if row["exitStatus"] else "completed_no_report"))
                row["failureReason"] = diagnostic_summary(text)
                event_counts = {}
                for line in text.splitlines():
                    try:
                        event = json.loads(line)
                        if not isinstance(event, dict):
                            continue
                        event_type = str(event.get("type", "unknown"))[:80]
                        event_counts[event_type] = event_counts.get(event_type, 0) + 1
                    except (ValueError, TypeError):
                        pass
                row["eventCounts"] = event_counts
                failure = infrastructure_failure(text, timed_out)
                if failure:
                    row["infrastructureFailure"] = failure
        except (OSError, subprocess.SubprocessError, ValueError) as error:
            if process:
                self.terminate(process)
            row.update({"status": "failed", "errorType": type(error).__name__, "exitStatus": process.returncode if process else None, "finishedAt": now(), "durationSeconds": round(time.monotonic() - started, 2)})
        finally:
            if master is not None:
                os.close(master)
            if process and process.stdout:
                process.stdout.close()
            with self.lock:
                self.processes.pop(job["task"], None)
                provider = job["provider"]
                self.failures[provider] = self.failures[provider] + 1 if row.get("infrastructureFailure") else 0
                if self.failures[provider] >= 3:
                    self.disabled[provider] = {"reason": row["infrastructureFailure"], "consecutiveInfrastructureFailures": self.failures[provider], "stoppedAt": now()}
                self.results[job["task"]] = row
                self.save()
            print(json.dumps({"task": job["task"], "status": row["status"], "factCount": row["factCount"], "reportBytes": row["reportBytes"]}), flush=True)
        return row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", action="store_true", help="Execute selected public-only tasks; otherwise prepare prompts only")
    parser.add_argument("--provider", choices=["all", "opencode", "freebuff"], default="all")
    parser.add_argument("--limit", type=int, default=100, help="Number of universities, 1..100")
    parser.add_argument("--task", help="One university task number, e.g. 001")
    parser.add_argument("--skip-ready", action="store_true", help="Skip today's schema-valid candidate reports when resuming a batch")
    parser.add_argument("--concurrency", type=int, default=3, help="Concurrent CLI processes, 1..6; Freebuff is capped at 2")
    parser.add_argument("--timeout", type=int, default=300, help="Per-job deadline in seconds, 15..360")
    args = parser.parse_args()
    if not 1 <= args.limit <= 100 or not 1 <= args.concurrency <= 6 or not 15 <= args.timeout <= 360:
        parser.error("limit must be 1..100, concurrency 1..6 and timeout 15..360")
    manifest = prepare()
    selected = manifest["universities"]
    if args.task:
        selected = [university for university in selected if university["task"] == args.task]
        if not selected:
            parser.error("task is not in the public university manifest")
    selected_ids = {university["id"] for university in selected[:args.limit]}
    jobs = [job for job in manifest["tasks"] if job["universityId"] in selected_ids and (args.provider == "all" or job["provider"] == args.provider)]
    ready = ready_tasks_for_date(jobs, REVIEW_DATE) if args.skip_ready else set()
    jobs = [job for job in jobs if job["task"] not in ready]
    print(json.dumps({"preparedUniversities": manifest["uniqueUniversities"], "preparedTasks": manifest["preparedTasks"], "selectedTasks": len(jobs), "reusedCandidateTasks": len(ready), "executionRequested": args.run, "manifest": str(MANIFEST_PATH), "publishedRecords": 0}), flush=True)
    if not args.run:
        return 0
    batch = Batch(jobs, args)
    batch.save()
    print(json.dumps({"receipt": str(batch.output / "receipt.json"), "publicWorkDirectory": str(batch.work)}), flush=True)
    signal.signal(signal.SIGINT, batch.cancel)
    signal.signal(signal.SIGTERM, batch.cancel)
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        list(pool.map(batch.run, jobs))
    batch.save()
    return 1 if any(row["status"] in ("failed", "timeout", "interrupted") for row in batch.results.values()) else 0


if __name__ == "__main__":
    raise SystemExit(main())
