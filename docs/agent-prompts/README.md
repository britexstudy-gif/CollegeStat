# University evidence prompts

Two complementary research tasks are prepared for each of 100 universities:

- **OpenCode:** official subject/programme directories, admissions requirements and cycles, cohort counts, tuition/living costs, aid and university-wide ranking positions.
- **Freebuff:** identity/founding history, founders and influential people, official public student stories, logo guidance, campus galleries, virtual tours and official videos.

The shared templates are `opencode-university-evidence-template.md` and `freebuff-university-people-media-template.md`. The `universities/` folder contains all 200 fully resolved prompts with exact catalogue IDs, official university websites, review date and a fixed output schema. Prepared task hashes are recorded in `data/review/university-agent-batch-oct15.json`.

Prepare or regenerate without starting agents:

```sh
python3 -B scripts/run-university-agent-batch.py
```

Execute one university through both installed agents:

```sh
python3 -B scripts/run-university-agent-batch.py --run --task 001 --provider all --concurrency 2 --timeout 300
```

Execute the 100-university batch:

```sh
python3 -B scripts/run-university-agent-batch.py --run --provider all --limit 100 --concurrency 6 --timeout 300
```

Run only one provider by selecting `--provider opencode` or `--provider freebuff`. `--limit` counts universities. Use `--skip-ready` to resume while reusing today's completed, schema-valid candidate reports; a previous-date report, missing file or mismatched university does not count. The maximum process concurrency is six; Freebuff is capped at two simultaneous terminal sessions. The maximum job deadline is six minutes. The OpenCode model is the locally verified `opencode/muse-spark-1.3-contributor-free#xhigh`; Freebuff uses its installed default routing. The launcher does not choose a paid model or modify provider settings.

Each job receives only its public prompt in its own temporary working directory. OpenCode emits complete JSON in its final output; Freebuff receives a short plain-text instruction to read the public prompt file after nine seconds of terminal startup, with Enter sent separately after the paste is processed. Before the hard deadline, Freebuff is asked to stop researching and save a partial report with explicit gaps. Freebuff writes `report.json` in that temporary directory. The launcher validates identity, provider, scope and public evidence URLs; accepted JSON is staged under `outputs/university-agent-batch-oct15/<batch>/`. Raw terminal transcripts are not persisted. The receipt records each actually started job, exit status, deadline, report bytes, fact count and any skipped jobs. It retains only boolean terminal milestones for diagnostics. Three consecutive quota, network, authentication, startup or timeout failures stop that provider's remaining jobs.

Prompt preparation uses the actual UTC date. Collection receipts record actual start and finish timestamps separately from the agent's reported source-check date. Early Oct 16 runs used immutable prompts prepared with an Oct 15 review label; those labels are not independent proof of source retrieval on either date. Native source review must record its own inspection date before publishing evidence.

The prepared manifest is not an execution claim. Review each batch receipt for actual started/completed counts. Every fact remains `pending_native_review`; no report is automatically imported, published, used as a live university fact, or treated as verified merely because an external agent returned it. A partial programme list stays labelled a sample, missing evidence stays missing, ranking years and applicant populations must match, media rights must be checked, and exact official video IDs must be verified before use.
