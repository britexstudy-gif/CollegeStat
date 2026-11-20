# Logo coverage report (Nov 19)

## 1. Coverage (anon REST read, 14,003 published universities)
- `universities.logo_url` is NULL for 13,716 (97.96%). 287 have one.
- Fallback sources in the UI (`primitives.tsx`): official-logos map (11 records), `auto_logo` (server-resolved site icon, 9,157 ids in `data/published/auto-logos.json`, all files present on disk), then `logo_url`, then `website_icon_url` (column does not exist in the DB; it is only on the TS type).
- Effective coverage: 8,875 via auto_logo + 287 via logo_url = 9,162 (65.4%). **4,841 universities (34.6%) have no logo of any kind.** Largest gaps: US 1,072, ID 335, IN 222, KR 193, MX 188, RU 166, CN 164, IR 156.

## 2. Fallback behaviour
- There is no runtime favicon service (no Google s2 / DuckDuckGo lookup). Candidates that fail `onError`, or are tiny (<48px), or wider/taller than 2.2:1, are dropped.
- When none remain, the UI shows a coloured monogram (initials plus brand tint). Checked on 10 random no-logo pages on collegestat.xyz (all HTTP 200): every one rendered `logo-monogram-letters` in the SSR HTML and no broken `<img>` for the logo. The `/logos/publishers/*` imgs in the HTML are hidden ranking badges, not logos.
- So: no broken images found in the sample. The fallback works, but it is a monogram, not a logo.

## 3. Proposed logos
- Ranked no-logo universities with any ranking row: 577. Top 300 of those selected.
- Wikimedia Commons search returned 429 rate limits on most requests. The search job was stopped before completion.
- The 4 hits from the first (pre-backoff) run are not in the top-300 set and are mostly wrong: Vanderbilt "Athletics" logo, University of Ibadan "Fan Club" logo, and "ADU Zagreb" (an arts academy, not the University of Zagreb). Kyung Hee's SVG is plausible but unverified for branding.
- `proposed.json` is therefore `[]`. Nothing was proposed without a verified match.
- Next step: rerun `/private/tmp/claude-501/-Users-likeanew-Documents-CollegeStat/9441e680-0d40-4c1b-955e-c39e4b6d14aa/scratchpad/logos/find_logos.py` with slower pacing (about 5 s), then review each hit by eye. Expect some hits to be athletics or fan logos and some to be wordmarks the UI rejects.

## 4. Recommended code fix (not applied)
- Add a per-university logo review queue for the 4,841 with no logo (ranked first), and accept only curated logos with a licence note.
- Do not fall back to third-party favicon services for legal reasons. Keep the monogram as the default.
- Optionally, when `auto_logo` is absent, skip the lazy 300 KB map download for records already known to have no icon, so that case does not cost a download.
