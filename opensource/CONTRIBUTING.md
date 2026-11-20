# Contributing

Thank you. Most helpful contributions are corrections and missing facts with a real source.

## Data contributions

Every value you add or change must have:

1. **Official source URL**: the university's own page or an official government dataset (IPEDS, College Scorecard). Not rankings sites, agents, forums, social posts or AI answers.
2. **Date checked** (`retrieved_at`, `YYYY-MM-DD`).
3. **Academic year** the value belongs to, as `2026/27` or `2025/26`. **Latest year only**: if only 2024/25 or older exists, leave the field empty; old values are not accepted in the current view.
4. **Facts only**: numbers, dates, yes/no policies. Do not paste paragraphs from the website. Short factual notes in your own words are fine.
5. Currency as shown by the university (ISO code), the period (year, semester, credit) and whether it is a range.

Unknown stays unknown. Do not guess, round or convert yourself; USD is computed by the pipeline.

### Review process

1. You open a PR (or an issue; a maintainer turns it into a PR).
2. CI runs `npm run data:check`: schema, ranges, source present, no stale year.
3. A maintainer opens the source URL and compares the value. Two checks: the URL supports the value, and the year is current.
4. Merged data is credited to you in the changelog and contributors list. Corrections to facts you got wrong are welcome without blame.
5. Typical review time: a few days. Large batches: please split by university or country.

Disputes: the official source wins. If two official pages disagree, we keep both as alternatives and flag it.

### Fields

See [DATA_SCHEMA.md](DATA_SCHEMA.md).

## Code contributions

Setup (Node.js 22.13+):

```sh
npm ci
npm run data:check
node --import tsx --test tests/*.test.ts
```

- Keep changes small and focused; one topic per PR.
- TypeScript, strict types, validate with zod models in `scripts/data-ops/model.ts`.
- Add or update a test for behavior changes.
- Run `npm run lint` and `npx tsc --noEmit` before opening the PR.
- Do not add dependencies without discussion.
- Sign off commits (`git commit -s`): you confirm you have the right to submit the work under the repo licence (DCO).
- Never commit secrets or personal data.

## Be kind

Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
