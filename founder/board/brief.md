# CollegeStat

- What it is: an online research and application-prep platform. Students can:
  - search and compare 14,003 universities (rankings, costs, admit rates, entry requirements, programmes, deadlines, each figure with a cited source);
  - find scholarships, each with its own page;
  - practise tests (SAT, IELTS, TOEFL style);
  - write essays in a writing desk with a timer and an AI check;
  - fill practice replicas of real application forms (Common App, UCAS, uni-assist, direct);
  - get a personalised plan from a long onboarding;
  - ask an AI assistant (DeepSeek).
  The interface is in 6 languages (English, Uzbek, Russian, Spanish, German, Chinese).
- Who it is for: students in Central Asia (Uzbekistan, Kazakhstan, Kyrgyzstan, Tajikistan) applying for bachelor's degrees abroad, intake 2027, and their families. Who pays (student or parent) is not decided yet.
- What it sells, at what price:
  - Free tier: search, rankings, scholarships, plan, question bank, 1 mock per exam, writing checks, 5 AI requests/day.
  - Pro: $9/month or $5.40/month billed yearly. It covers full mocks with score history, unlimited AI essay review, the admission simulator and a personal study plan.
  - Payments are not connected. During early access Pro is free and "Upgrade" joins a waitlist.
  - A per-season price was suggested by the previous board but not adopted.
- Where and how: web app (React/TypeScript on vinext, Supabase for accounts and search, DeepSeek AI).
  - Hosting: live since 15 Nov 2026 at collegestat.xyz on Cloudflare Workers (last production deploy 18 Nov; newer work below is built but not yet deployed).
  - Search: verified in Google Search Console, Bing and Yandex; sitemaps and IndexNow submitted. No traffic or user numbers have been reported to the board.
  - Sign-in: email codes, Google; GitHub enabled 20 Nov.
  - Acquisition: no channel has been chosen beyond SEO.
- Budget and constraints:
  - A solo founder builds it with AI coding agents. Budget, revenue goal and launch date are not stated.
  - There are no users and no revenue yet.
- Progress since the last board review (3.3/10):
  - Segment chosen.
  - Since the last review the founder has built:
    - a landing page aimed at the segment;
    - a target list of 204 universities;
    - verified admissions data for the targets (application routes 122, deadlines 89, tuition 77, IELTS minimums 44 universities);
    - 69 verified scholarships, 71 of 88 collected marked open to Central Asian students;
    - 5 published plain-English guides, with 11 more in draft;
    - Wikidata facts for 13,087 universities;
    - official logos for about 54% of universities;
    - an application-form simulator;
    - SEO and AI-agent discoverability (sitemaps, structured data, llms.txt).
  - Data gaps remain:
    - international tuition for most non-US universities;
    - foundation-year options;
    - scholarships aimed specifically at Central Asian students (none found yet).

- Progress since the second board review (15 Nov, 4.3/10), built 18-20 Nov (most not yet deployed):
  - Chances ("Imkoniyatlar") rebuilt as a practice application in the portal each university really uses (Common App, UCAS, uni-assist, Studielink, UC, Campus France, Universitaly), with the real sections, limits and a review/submit step, ending in a practice decision letter with reasons.
  - Writing desk redesigned (essay types with official limits and prompts, progress ring, AI review by category).
  - AI assistant with tools (search, profile, plan tasks); when the daily AI allowance runs out a paywall opens (payments still not connected: paid choices join early access).
  - Dashboard home redesigned around deadlines and readiness; plan calendar; a downloadable AI report.
  - 30 own guides now also in Russian and Uzbek.
  - Longer onboarding with a generated plan; profile with sticker avatars; cookie consent; first-run tour.
  - Landing page reworked (feature screenshots, AI assistant and articles sections).
  - A data import of 50 more verified values is prepared but not applied.
- Still unchanged: no payments, no stated revenue, no reported users, payer undecided, Pro still $9/month.

## Context for the board
- This is the third review. The second review (15 Nov 2026) scored 4.3/10, 3 "fund if". Its top risks: nothing live and no users; the segment chosen but the product not narrowed (7 features, ~16 dashboard sections, 6 languages); holes in core data for the 204 targets (deadlines 44%, tuition 38%, IELTS 22%); no offer or price rework, payer undecided; no moat.
- The previous memos are in founder/board/v2-nov15/ for comparison.
- The founder asks: rate the project now and name its weaknesses.
