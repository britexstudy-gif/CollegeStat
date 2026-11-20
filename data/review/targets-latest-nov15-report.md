# Targets data refresh, 15–16 Nov 2026 (STAGED, not published)

Files:
- `data/review/targets-latest-nov15.json`: 204 records keyed by `slug` and `id` from `data/segment/targets.json`, plus a `coverage` block.
- `data/review/programmes-latest-nov15.json`: programme lists for 20 universities (105 programmes).
- This report.

No DB writes. No published data or app code was touched.

## How each field was filled

- Every field has `source_url`, `retrieved_at` and `origin`:
  - `nov14-merged (verified)` means the value was carried over from `segment-admissions-nov14-merged.json`.
  - `programmes-costs-nov14 (staged)` means it came from that partial file.
  - `nov15-research` means it is new in this pass.
- `method: "search-index extract …"` means the value comes from a search engine's extract of the official page, not from fetching that page directly. **It needs a human check before publishing.** Most new values are of this kind (see the table).
- `stale: true` means the latest figure published is from an earlier cycle. `confidence: "low"` means the source was unclear.
- USD conversion uses ECB euro reference rates of 2026-11-13, crossed through EUR, for GBP, CAD, JPY, KRW, CNY, HKD, SGD, MYR, PLN, CZK, HUF and TRY. It uses Central Bank of Uzbekistan rates of 2026-11-14 for UZS, RUB, KZT, KGS, TJS and AED. Each tuition record stores `usd`, `fx_rate_usd_per_unit`, `fx_source` and `fx_date`.
  - For older nov14 tuition stored as text, the amount was parsed automatically into `amount_parsed_from_text` / `usd_parsed`. The basis (per year, semester or credit) stays in the text.

## Coverage of the 204 targets

"Before" uses the nov14 verified counts (`segment-admissions-nov14-merged-fill-rate.json`). For tuition, "before" also includes the 10 staged values in programmes-costs-nov14.

| Field | Before | After | New this pass | …of which from search index | Target (≥90% = 184) |
|---|---|---|---|---|---|
| Tuition (with a figure) | 77 (+10 staged) | **141** (69%) | 70 | 68 | not met |
| Deadlines (2027 intake, or latest published) | 89 | **163** (80%) | 79 | 56 | not met |
| English / IELTS rule | 44 | **136** (67%) | 94 | 90 | not met |
| Application platform | 122 | **178** (87%) | 59 | 36 | not met |
| SAT/ACT policy | 0 | 16 | 16 | 14 | — |
| Official YouTube videos (checked with oEmbed) | 0 | 10 universities, 21 videos | | | — |
| Supplemental essay prompts + word limits | 0 | 5 (Harvard, Yale, MIT, Princeton, Stanford*) | | | — |
| Required documents (international) | 0 | 4 | | | — |
| Programmes | 18 universities (staged) | 20 universities / 105 programmes | 2 universities | | top 60 not met |

\*The Stanford figure is from its QuestBridge page (~2025) and is flagged stale. 7 tuition and 7 deadline values are stale or low-confidence.

The English field counts three kinds of answer as "covered": a real IELTS figure, an explicit "not required / optional" (several US universities), and an explicit "N/A, taught in German/Korean/Chinese/Russian; language X required". Each record has a `category` field so the app can tell these apart.

### After, by country (tuition / deadlines / English / platform, out of n)

| Country | n | Tuition | Deadlines | English | Platform |
|---|---|---|---|---|---|
| US | 28 | 25 | 27 | 27 | 23 |
| GB | 18 | 15 | 18 | 18 | 18 |
| DE | 14 | 8 | 14 | 10 | 12 |
| KR | 14 | 8 | 12 | 14 | 14 |
| TR | 14 | 1+ | 13 | 11 | 14 |
| CN | 12 | 5+ | 8 | 9 | 8 |
| MY | 10 | 4+ | 7 | 10 | 9 |
| JP | 10 | 9 | 5 | 3 | 7 |
| IT | 10 | 2 | 5 | 0 | 7 |
| CA | 10 | 7 | 9 | 8 | 10 |
| RU | 10 | 2 | 3 | 2 | 7 |
| HU | 8 | 3 | 7 | 2 | 7 |
| PL | 8 | 5 | 6 | 1 | 8 |
| CZ | 6 | 3 | 6 | 0 | 4 |
| AE | 6 | 3 | 1 | 4 | 5 |
| HK | 6 | 4 | 6 | 4 | 5 |
| SG | 4 | 1 | 4 | 3 | 4 |
| UZ / KZ / KG / TJ | 16 | 7 | 12 | 10 | 16 |

The "+" means the per-country count was taken before nov14 tuition text was parsed. The real number is higher; the overall total of 141 already includes the parsed values.

Biggest remaining gaps:
- Italy, Czechia, Hungary, Poland, Russia: English rules and tuition.
- Japan: English rules for OMU, TMU, Nagaoka and TUMSAT.
- AE: deadlines.
- Central Asian home campuses: tuition. Several have fees only as structured nov14 text, or none at all.

`coverage` in the JSON and `missing` lists can be regenerated with `scratchpad/tr_scripts/report.py`.

## Sites skipped and why

- **ox.ac.uk**: Cloudflare "Just a moment" challenge (403). Not bypassed. Oxford values come from the search index only.
- **UCL 2027-28 fee schedule page**: 403 to automated fetch. The 2026 entry range was used instead.
- **sis.itu.edu.tr (ITU fees and calls)**: TLS certificate failure. ITU tuition left null. The fee table shows 94,500 / 79,000 with no currency stated.
- **Edinburgh, UWL, KCL course pages**: fees load client-side (template placeholders in the HTML). Tuition left null.
- **Cambridge college fee PDF, Harvard supplement PDF**: binary PDFs that could not be parsed. Harvard essay data comes from the search index of the same PDF and the Harvard FAQ.

## Problems with the target list (owner review)

- **SUNY Downstate Health Sciences University** only takes upper-division or transfer students; it has no first-year bachelor entry. Core fields are null. Recommend removing it.
- **Eastern Institute of Technology, Ningbo**: no international undergraduate admissions found. Its 2026 intake was 130 students, all from Zhejiang. Probably not a real option.
- **University of Tokyo PEAK** made its final intake for fall 2026. English-taught entry moves to the UTokyo College of Design (2027 Route B: IELTS >6.0, Duolingo >110).
- **Turkey**: several universities do not accept IELTS (YÖK rule), including Koç, Sabancı, METU and BAU's proficiency page. Boğaziçi still lists IELTS 6.5. The app should not show an IELTS figure as accepted for Turkey by default.
- **TOEFL iBT changed to a 1–6 scale from 21 Jan 2026.** Many records store both old and new cut-offs. Show the scale next to the score.
- **Germany**: almost all target bachelor's degrees are taught in German, so `english.category = german_taught`. TUM, FAU and Baden-Württemberg universities charge non-EU tuition. FAU's new fees (€1,000–3,000 per semester) start in summer semester 2027.

## Conflicts noted (stored in `conflict` or `note` fields)

- **Padua deadlines**: nov14 has the first call 15 Sep–15 Nov 2026 (most programmes); nov15 found the Information Engineering non-EU call 7 Jan–7 Mar 2027. The nov14 value was kept and the nov15 one added as `additional_nov15`. Padua runs several calls.
- **University of Washington tuition**: $44,580 on one UW page, $45,789 on another.
- **Boston College**: $75,070 tuition / $95,258 cost of attendance (trustees) versus $75,075 / $95,978 (international page).
- **Boğaziçi tuition**: USD 8,000–10,000 per year on one page, USD 4,000–5,000 per semester on another (same totals). Its English criteria page was updated on 12 Jun 2026 and may change the cut-offs.
- **Missouri S&T**: fall recommended date is 15 June on one catalogue page and 1 July on another. **UT Arlington**: fall priority date is 15 Feb on the international page and 1 May in the catalogue.
- **BAU**: IELTS "not accepted" on the proficiency page, but 6.5 on another BAU page.
- **UChicago**: older pages give Nov 1 / Jan 2 or Jan 6. The current first-year page (Nov 2 / Jan 4) was used.
- **Yale QuestBridge**: Oct 1 in the counselor guide, Nov 1 on the apply page.
- **nov15 replaced nov14 values only where they were consistent** (Berkeley/Caltech IELTS, TUM, Marburg, USM, Nagoya, ELTE, CityU): the newer data is the same or more detailed.
- **Removed as unverified**: SAT/ACT "test-blind" for the UC campuses. This is the known UC policy, but it was not re-checked on an official page, so it was set to null with a note.

## Not done / next steps

- The 90% target for the 4 core fields was **not reached** (69 / 80 / 67 / 87%).
- Programmes were done for 20 universities, not the top 60.
- Videos (10 universities), essays (5) and required documents (4) are a first slice only.
- About 85% of new values come from the search index. A reviewer should open the `source_url` and confirm before anything is promoted to published data.
- Scripts used (scratch only): `/private/tmp/claude-501/-Users-likeanew-Documents-CollegeStat/9441e680-0d40-4c1b-955e-c39e4b6d14aa/scratchpad/tr_scripts/` (`upd.py` patch merger, `fx.py`, `report.py`, batch files `b01–b34.py`).
