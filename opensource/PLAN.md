# Open-sourcing CollegeStat: plan (draft for the owner)

Nothing here is published. No repo exists yet. Everything in this folder is ready to copy into a new public repo once you decide.

## 1. Recommended split

Open three things in this order. Each can ship on its own.

| Layer | What | Why | Licence (recommended) |
|---|---|---|---|
| A. Dataset | Curated university facts (`data/curated/universities.ndjson` reduced to redistributable fields) with a source URL and date on every value | This is what people want to fix. A data repo has the lowest contribution barrier: edit one line, cite one URL | CC BY 4.0 (see section 3) |
| B. Data tooling | `scripts/data-ops/*` (model, merge, gates, check, queue), `scripts/ingest/*`, collectors/adapters | Lets contributors validate their change locally with `npm run data:check` | Apache-2.0 |
| C. App core (optional, later) | Public university pages, search, compare, the shared UI kit | Invites code PRs, but is the most work to keep clean | AGPL-3.0 or Apache-2.0 (decision, section 3) |

Suggested repo layout: `collegestat-data` (A + B together, one repo, two licences marked per folder) first. Add `collegestat` (C) only if you want code contributors.

### What stays private

- Secrets: `.env.local`, `.dev.vars`, any key, Supabase service role, DeepSeek key, Cloudflare tokens. Scan git history before any push; if the private repo history ever held a secret, publish from a fresh history instead (squashed export), never the old one.
- User data: everything in Supabase auth and user tables, saved plans, essays, chat logs, analytics, email lists, `supabase/` migrations that expose policy details you prefer to keep.
- Paid (Pro) features: payment UI, entitlements, Pro-only routes. Keep behind a private overlay or feature flag.
- AI layer: system prompts, `server/ai*`, `lib/ai*`, assistant routes. Your call; prompts are a competitive asset and easy to abuse once public. Recommended: keep private.
- Rival-derived or unlicensed content: anything copied or paraphrased from competitors, scraped rankings with restrictive terms, library/article text from other authors, Hipo-derived rows are MIT (keep the notice in `data/published/HIPO-LICENSE.txt`).
- Brand: name and logo stay yours. Say so in README ("code is open, the CollegeStat name and logo are not").
- Raw downloads and `data/raw`, `data/review` (staged, unverified).

## 2. Source licences we must respect

| Source | Terms | What we do |
|---|---|---|
| IPEDS / College Scorecard (US government) | Public domain (US federal works) | Freely redistributable. Keep attribution as courtesy and keep `collector` = `ipeds-*` / scorecard |
| Wikidata | CC0 | Freely redistributable |
| Wikimedia Commons images | Per-file licences (CC BY, CC BY-SA, PD, some non-free) | Never bulk-export images. Store file URL + author + licence per image, or leave images out of the dataset |
| University websites | Facts are not copyrightable in most places (tuition, deadlines, minimum scores). Wording, layout, photos and logos are | Publish values and the source URL only; no copied prose, no logos, no photos |
| Rankings (QS, THE, etc.) | Usually restrictive terms | Exclude rank values from the open dataset unless the publisher's licence allows it |
| Hipo university list | MIT | Keep notice |
| Third-party articles/guides | Author copyright | Summary + link only; exclude from the export |

Rule of thumb: a value is exportable only if it has a `source_url`, a `retrieved_at` and a source class from the table above. See EXPORT.md.

Caveat: this is a practical summary, not legal advice. Database rights (EU sui generis) can apply to systematic extraction from a single site; our values are individually sourced facts, but have a lawyer glance at it before launch.

## 3. Licence comparison in plain words

### Code

- **MIT**: do anything, keep the notice. Competitors can take it, close it and sell it. Maximum adoption, zero protection.
- **Apache-2.0**: like MIT plus an explicit patent grant and a clearer contributor story. Still lets anyone close-source a fork. Good default for tooling that you want others to build on.
- **AGPL-3.0**: if someone runs a modified version as a website, they must publish their changes. This blocks a competitor from cloning the app as a closed SaaS. Downsides: some companies and contributors avoid it, and it needs a CLA or dual-licensing if you want to sell a commercial licence later.

### Data

- **CC BY 4.0**: anyone may use, even commercially, if they credit CollegeStat and link back. Simple and well understood. Compatible with the public-domain and CC0 inputs.
- **ODbL**: share-alike for databases: derived databases must stay open under ODbL, with attribution. Protects against someone repackaging and closing the data; more friction for users (OpenStreetMap uses it).
- **CC0**: no conditions at all. Maximum reuse, no credit required, no protection. Fine for Wikidata-like generosity but gives you no attribution traffic.

### Recommendation for a startup that wants contributors and a business

- Dataset: **CC BY 4.0**. You get credit and backlinks (growth, SEO), contributors are comfortable, and your business is not the raw facts but the product on top (AI, personalised chances, plans, Pro).
- Data tooling: **Apache-2.0** (patent grant, contributor friendly).
- App core, if opened: **AGPL-3.0** only if the fear is a clone; otherwise **Apache-2.0**. Recommended: do not open the app core yet. Open data + tooling first, watch for contributors, decide later.
- Contributions: use **DCO sign-off** (`Signed-off-by`) instead of a CLA at the start. Contributors keep copyright and agree their data is under CC BY 4.0, their code under the repo licence.
- Note: the current repo `LICENSE` is MIT with "Ascend Team" as holder. Confirm the legal owner name before publishing.

## 4. Order of work

1. Owner decides (section 5). 
2. Build the export script (EXPORT.md) and run it into a scratch folder; review a sample by hand.
3. Create the public repo yourself, copy `opensource/*` (README, CONTRIBUTING, CoC, SECURITY, DATA_SCHEMA, templates, workflow), add `LICENSE` files, add the exported dataset.
4. Secret scan (gitleaks or trufflehog) on the exact tree being published.
5. Soft launch: invite 5-10 students/volunteers, fix friction, then announce.
6. Later: the in-app correction flow (IN-APP-CONTRIBUTIONS.md) feeds the same review queue.

## 5. Decisions for the owner

1. Scope: data + tooling only (recommended), or also the app core? And if app core: AGPL or Apache?
2. Data licence: CC BY 4.0 (recommended) vs ODbL (share-alike) vs CC0.
3. Keep AI prompts and Pro features private (recommended), and the legal entity name for licence headers and the contact emails (security@, conduct@) used in the files.
