import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/run-university-agent-batch.py"
spec = importlib.util.spec_from_file_location("university_agent_batch", SCRIPT)
batch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(batch)


def job(number="001"):
    return {"task": number + "-opencode", "universityTask": number, "universityId": "test-university", "university": "Public Test University", "provider": "opencode", "scope": "academics_admissions_costs_rankings", "prompt": "public-prompt.md", "promptSha256": hashlib.sha256(b"Public university research only.").hexdigest()}


def report():
    return {"universityId": "test-university", "university": "Public Test University", "provider": "opencode", "scope": "academics_admissions_costs_rankings", "checkedAt": "2026-10-15", "facts": [{"field": "program_directory", "value": "Official programme catalogue", "sourceUrl": "https://catalog.mit.edu/", "sourceTitle": "MIT Catalog", "publisher": "MIT", "sourceYear": None, "retrievedAt": "2026-10-15", "population": "Institute catalogue", "evidence": "The catalogue lists programme directories.", "reuse": "metadata_link_only"}], "missing": [], "conflicts": []}


class UniversityAgentBatchTests(unittest.TestCase):
    def test_prepared_manifest_has_100_unique_identities_and_200_public_prompts(self):
        manifest = json.loads(batch.MANIFEST_PATH.read_text())
        self.assertEqual(len(manifest["universities"]), 100)
        self.assertEqual(len({row["id"] for row in manifest["universities"]}), 100)
        self.assertEqual(len(manifest["tasks"]), 200)
        self.assertEqual(manifest["publishedRecords"], 0)
        for task in manifest["tasks"]:
            prompt = (batch.ROOT / task["prompt"]).read_text()
            self.assertEqual(hashlib.sha256(prompt.encode()).hexdigest(), task["promptSha256"])
            self.assertNotIn("{{", prompt)
            self.assertNotIn("/Users/", prompt)
            self.assertNotIn(".env", prompt)
            self.assertIn(task["universityId"], prompt)
            self.assertIn("pending_native_review", prompt)
            self.assertIn("report.json", prompt)

    def test_reports_must_match_identity_provider_scope_and_public_evidence(self):
        valid = batch.validate_report(report(), job())
        self.assertEqual(len(valid["facts"]), 1)
        self.assertEqual(valid["reviewState"], "pending_native_review")
        self.assertEqual(valid["publishedRecords"], 0)
        for field, value in [("universityId", "other-university"), ("provider", "freebuff"), ("scope", "other")]:
            candidate = report()
            candidate[field] = value
            self.assertIsNone(batch.validate_report(candidate, job()))
        for url in ["file:///etc/passwd", "http://127.0.0.1/", "https://user:password@mit.edu/", "https://official.example.edu/page", "http://192.168.1.2/", "https://local.local/page"]:
            candidate = report()
            candidate["facts"][0]["sourceUrl"] = url
            self.assertIsNone(batch.validate_report(candidate, job()), url)

    def test_unsupported_fields_are_rejected_and_explicit_gaps_remain_visible(self):
        candidate = report()
        candidate["facts"][0]["field"] = "private_applicant"
        candidate["missing"] = [{"field": "ranking", "reason": "Publisher page unavailable"}]
        valid = batch.validate_report(candidate, job())
        self.assertEqual(valid["facts"], [])
        self.assertEqual(valid["validation"]["rejectedFactCount"], 1)
        self.assertEqual(valid["missing"][0]["field"], "ranking")

    def test_json_extraction_uses_agent_final_text_and_ignores_tool_echoes(self):
        text = json.dumps({"type": "tool_use", "part": {"text": json.dumps(report())}})
        self.assertIsNone(batch.extract_opencode_report(text, job()))
        text += "\n" + json.dumps({"type": "text", "part": {"text": "```json\n" + json.dumps(report()) + "\n```\nRESEARCH_COMPLETE"}})
        self.assertEqual(batch.extract_opencode_report(text, job())["facts"][0]["sourceUrl"], "https://catalog.mit.edu/")

    def test_resume_skips_only_current_date_reports_with_matching_identity_and_evidence(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            folder = root / "outputs/university-agent-batch-oct15/test-batch"
            folder.mkdir(parents=True)
            candidate_path = folder / "001-opencode.json"
            candidate_path.write_text(json.dumps(report()))
            receipt_path = folder / "receipt.json"
            row = {"task": "001-opencode", "status": "candidate_ready", "finishedAt": "2026-10-16T03:00:00Z", "report": str(candidate_path.relative_to(root))}
            receipt_path.write_text(json.dumps({"jobs": [row]}))
            with patch.object(batch, "ROOT", root):
                self.assertEqual(batch.ready_tasks_for_date([job()], "2026-10-16"), {"001-opencode"})
                self.assertEqual(batch.ready_tasks_for_date([job()], "2026-10-17"), set())
                candidate = report()
                candidate["universityId"] = "wrong-university"
                candidate_path.write_text(json.dumps(candidate))
                self.assertEqual(batch.ready_tasks_for_date([job()], "2026-10-16"), set())
                row["report"] = "public-prompt.md"
                receipt_path.write_text(json.dumps({"jobs": [row]}))
                self.assertEqual(batch.ready_tasks_for_date([job()], "2026-10-16"), set())

    def test_public_cli_result_is_staged_with_truthful_receipt_and_no_transcript(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "public-prompt.md").write_text("Public university research only.")
            executable = root / "public-test-agent"
            executable.write_text("#!/usr/bin/env python3\nimport json, sys, os\nfrom pathlib import Path\nprompt = Path(sys.argv[sys.argv.index('--file') + 1])\nassert prompt.is_absolute() and prompt.is_file()\nassert Path(os.environ['PWD']).resolve() == Path.cwd()\nprint(" + repr(json.dumps({"type": "text", "part": {"text": json.dumps(report())}})) + ")\n")
            executable.chmod(0o755)
            with patch.object(batch, "ROOT", root), patch.object(batch.shutil, "which", return_value=str(executable)):
                run = batch.Batch([job()], argparse.Namespace(concurrency=1, timeout=15))
                result = run.run(job())
                self.assertEqual(result["status"], "candidate_ready")
                self.assertEqual(result["reportSource"], "agent_final_json")
                self.assertEqual(result["exitStatus"], 0)
                self.assertEqual(result["factCount"], 1)
                receipt = json.loads((run.output / "receipt.json").read_text())
                self.assertEqual(receipt["startedTasks"], 1)
                self.assertEqual(receipt["candidateFactCount"], 1)
                self.assertEqual(receipt["publishedRecords"], 0)
                self.assertFalse(any("transcript" in file.name for file in run.output.iterdir()))

    def test_three_quota_failures_stop_provider_before_a_fourth_cli_run(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "public-prompt.md").write_text("Public university research only.")
            executable = root / "public-test-agent"
            executable.write_text("#!/usr/bin/env python3\nprint('quota exceeded')\nraise SystemExit(1)\n")
            executable.chmod(0o755)
            jobs = [job(f"{index:03}") for index in range(1, 5)]
            with patch.object(batch, "ROOT", root), patch.object(batch.shutil, "which", return_value=str(executable)):
                run = batch.Batch(jobs, argparse.Namespace(concurrency=1, timeout=15))
                results = [run.run(task) for task in jobs]
                self.assertEqual(results[-1]["status"], "skipped_provider_unavailable")
                self.assertNotIn("startedAt", results[-1])
                self.assertEqual(run.disabled["opencode"]["reason"], "quota")
                receipt = json.loads((run.output / "receipt.json").read_text())
                self.assertEqual(receipt["startedTasks"], 3)
                self.assertEqual(receipt["candidateReports"], 0)

    def test_freebuff_gets_short_public_file_instruction_and_stages_written_report(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "public-prompt.md").write_text("Public university research only.")
            task = job()
            task.update({"task": "001-freebuff", "provider": "freebuff", "scope": "identity_people_media"})
            candidate = report()
            candidate.update({"provider": "freebuff", "scope": "identity_people_media"})
            candidate["facts"][0]["field"] = "campus_gallery"
            executable = root / "public-test-agent"
            executable.write_text("#!/usr/bin/env python3\nimport os,sys,time\nfrom pathlib import Path\nassert os.tcgetpgrp(sys.stdin.fileno()) == os.getpgrp(), 'Interactive CLI requires a controlling terminal'\ninstruction = sys.stdin.readline()\nassert 'Read the public research instructions in ' in instruction\nassert 'Do not read any other local files.' in instruction\nassert len(instruction) < 700\nPath('report.json').write_text(" + repr(json.dumps(candidate)) + ")\ntime.sleep(10)\n")
            executable.chmod(0o755)
            with patch.object(batch, "ROOT", root), patch.object(batch.shutil, "which", return_value=str(executable)):
                run = batch.Batch([task], argparse.Namespace(concurrency=1, timeout=15))
                result = run.run(task)
                self.assertEqual(result["status"], "candidate_ready")
                self.assertEqual(result["reportSource"], "agent_report_file")
                self.assertTrue(result["terminatedAfterReport"])
                self.assertEqual(result["factCount"], 1)

    def test_failure_diagnostics_omit_credentials_and_user_paths(self):
        message = "Error: API_KEY=abcdef123456 token: qwerty987654 /Users/person/private/data.json https://host.invalid/?token=private"
        result = batch.diagnostic_summary(message)
        self.assertIn("[redacted]", result)
        for private in ["abcdef123456", "qwerty987654", "/Users/person", "token=private"]:
            self.assertNotIn(private, result)
        self.assertLessEqual(len(result), 500)


if __name__ == "__main__":
    unittest.main()
