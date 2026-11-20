# Board brief: CollegeStat (second review)

This is the second board review. The first one, a week of building earlier, scored the business 3.3/10 with a vote of 2 "fund if" and 1 "pass". Its memos and verdict are in founder/board/v1-nov14/. Read them, then judge what has changed and what has not.

The founder's question for this review: "What else do we need to make the app better?" Answer it as a business question, not only a feature list.

## The idea (founder/idea.md, verbatim)

- **What it is:** an online research and application-prep platform. Students can:
  - search and compare 14,003 universities (rankings, costs, admit rates, entry requirements, programmes, deadlines; every figure has a cited source);
  - find scholarships, each with its own page;
  - practise tests (SAT, IELTS and TOEFL style);
  - write essays at a writing desk with a timer and an AI check;
  - fill in practice replicas of real application forms (Common App, UCAS, uni-assist, direct applications);
  - get a personalised plan from a long onboarding;
  - ask an AI assistant (DeepSeek).

  The interface comes in 6 languages: English, Uzbek, Russian, Spanish, German and Chinese.
- **Who it is for:** students in Central Asia (Uzbekistan, Kazakhstan, Kyrgyzstan, Tajikistan) applying for bachelor's degrees abroad for the 2027 intake, and their families. Who pays, the student or the parent, is not decided yet.
- **What it sells, at what price:**
  - Free tier: search, rankings, scholarships, the plan, the question bank, 1 mock exam per test, writing checks and 5 AI requests a day.
  - Pro: $9/month, or $5.40/month billed yearly. It adds full mock exams with score history, unlimited AI essay review, the admission simulator and a personal study plan.
  - Payments are not connected. During early access Pro is free, and "Upgrade" joins a waitlist.
  - The previous board suggested a per-season price. It was not adopted.
- **Where and how:** a web app built with React/TypeScript on vinext, with Supabase for accounts and search and DeepSeek for the AI.
  - Hosting will be Cloudflare Workers. The account is connected, but nothing is live and there is no domain yet.
  - Sign-in uses email codes. Branded email templates are written but not yet installed.
  - No channel for finding customers has been chosen.
- **Budget and constraints:**
  - A solo founder builds it with AI coding agents.
  - Budget, revenue goal and launch date are not stated.
  - There are no users and no revenue yet.
- **Progress since the last review:**
  - The segment is chosen.
  - A landing page aimed at that segment.
  - A target list of 204 universities.
  - Verified admissions data for the targets:

    | Data point | Universities covered |
    |---|---|
    | Application routes | 122 |
    | Deadlines | 89 |
    | Tuition | 77 |
    | IELTS minimums | 44 |

  - 69 verified scholarships. Of 88 collected, 71 are marked as open to Central Asian students.
  - 5 published plain-English guides, with 11 more in draft.
  - Wikidata facts for 13,087 universities.
  - Official logos for about 54% of universities.
  - An application-form simulator.
  - Search-engine and AI-agent discoverability: sitemaps, structured data and an llms.txt file.
- **Data gaps that remain:**
  - International tuition for most non-US universities.
  - Foundation-year options.
  - Scholarships aimed specifically at Central Asian students; none found yet.

## Other facts from the founder

- The founder wants a calm, minimal app with all the needed information in one place, and wants it to rank at the top of Google and be readable by AI agents.
- The founder keeps adding features: dashboard sections, simulators, onboarding, test prep, an AI assistant. The previous board warned this was breadth with no centre.
- Planned next steps the founder mentioned:
  - publish to Cloudflare;
  - move the large datasets into a database and static storage;
  - custom email sending once a domain is bought.
- Still not done from the previous board's checklist:
  - no real users tested;
  - no paying users;
  - no acquisition channel;
  - no pricing rework;
  - no stated "secret".
