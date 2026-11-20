# CollegeStat roadmap (15 Nov 2026)

Goal: a real product for Central Asian students applying abroad (bachelor's, 2027 intake).
Calm, minimal, all needed info in one place, AI at the centre.

## Phase 0 — Fix what is broken (today, ~half a day)
- Email: code-only emails (no supabase.co link), sender `CollegeStat <hello@collegestat.xyz>` with a reply-to, redesigned templates (clean, branded, light/dark safe), check spam score.
- Finish or revert the half-done code from the stopped workers so the build is clean.
- Deploy the speed work. Click-test live.
- Submit to Google Search Console, Bing Webmaster (feeds ChatGPT/Copilot), Yandex Webmaster; turn on IndexNow.

## Phase 1 — Learn from rivals (1–2 days, research only)
Study and write down the best ideas (ideas only, no copied text/assets):
OnePrep (college section), CollegeVine (chances, AI counsellor), Niche, Common App, UCAS, Crimson/Unibuddy,
BigFuture, Studyportals/Mastersportal, uni-assist, Medium (article reading), Bluebook (digital SAT), IELTS/TOEFL official practice,
local agencies and Telegram channels in UZ/KZ.
Output: `docs/research/rivals-nov.md` with a ranked feature list.

## Phase 2 — Data foundation (1–2 weeks, runs in parallel with Phase 3)
- New Supabase schema: universities, admissions (per intake), deadlines, costs (per year), programmes, requirements,
  essay_prompts, scholarships + scholarship_universities, media (logos, photos, videos), sources (url + checked date per value).
  Student side: profiles, my_colleges, applications, essays.
- Move existing JSON data in; one clean dataset folder; archive the rest.
- Fill the ~204 target universities to ≥90%: tuition 2026/27, 2027 deadlines, platform, IELTS/TOEFL/Duolingo, SAT policy,
  acceptance rate, documents, English-taught programmes with requirements, essay prompts.
- Logos for most universities (official site icons, Wikidata/Wikimedia where licence allows). Target ≥90% of targets, ≥75% overall.
- Videos: official university YouTube videos (campus tour, admissions) embedded, checked for relevance.
- Scholarships rebuilt: what it covers, who can apply, how to get it step by step, deadline, image, linked universities.
- Workers: Codex for bulk collection, Haiku for cheap validation/translation checks, Opus/Sonnet for review and merging.

## Phase 3 — Design system + mockups (3–4 days, owner approves before building)
- One component kit (cards, stat strip, charts, tables, empty/"not yet verified" states, skeletons).
- Mockups: university page, My colleges, dashboard home, onboarding, scholarship page, article page, AI assistant.

## Phase 4 — Build the product (2–3 weeks)
1. Onboarding (serious): country + grade system (UZ/KZ/KG/TJ scales, UNT, ORT, IB, A-level), certificates with dates,
   activities and honours (Common App style), majors, dream countries, budget, scholarship need. World map at the end.
2. Agentic AI: the assistant can act, not only chat — search the catalogue, add to My colleges, compare,
   build the list (reach/target/safety), make a deadline plan, review an essay, explain a requirement. Uses the profile.
3. Personalised AI dashboard: next deadlines, list by fit, gaps to fix, AI daily suggestions, map.
4. Chances everywhere: Reach/Target/Likely on every card and page, "you vs admitted" bars.
5. University page: stats first, your fit, cost vs budget + scholarships, how to apply (timeline + checklist + simulator),
   programmes, essay prompts, campus media, FAQ, sources.
6. My colleges: reach/target/safety board, status per application, "6 of 9 done", next deadline.
7. Certificates (test prep) in official exam style: IELTS, TOEFL, SAT (Bluebook-like), Duolingo — real format,
   timing and scoring; original questions; enough of them.
8. Writing desk: excellent editor, prompts per university, AI-only feedback (structure, story, grammar, word limit).
9. Application simulators: real Common App / UCAS feel, fix all bugs, auto-detect the platform per university.
10. Articles: Medium-style reading; CollegeStat guides in simple words; outside articles shown as summary + link
    (we cannot republish other authors' full text unless the licence allows), useful videos embedded.
11. Account: settings, language, theme, data export, delete account (needs the Supabase service key).

## Phase 5 — Landing, SEO, AI search, launch
- Landing: only the essentials (search + chances, university pages, AI plan). 3 blocks.
- SEO/GEO: per-university pages in Uzbek and Russian, FAQ + structured data, sources and dates, outreach to Telegram channels.
- QA: real browser click-tests, Lighthouse, 10 real students.

## Open decisions for the owner
- Pause Spanish, German and Chinese? (recommended: yes)
- Approve mockups before building? (recommended: yes)
- Order of Phase 4 items.
