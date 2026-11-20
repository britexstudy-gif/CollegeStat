# CollegeStat: board verdict (second review, 15 Nov 2026)

**Vote: 3 fund if, 0 pass. Average score 4.3 / 10, up from 3.3.**

| Lens | Score | Vote | Last time |
|---|---|---|---|
| Offers | 4 | FUND IF | 3, FUND IF |
| Monopoly | 4 | FUND IF | 3, PASS |
| Product | 5 | FUND IF | 4, FUND IF |

The previous review is kept in `founder/board/v1-nov14/`.

## What changed the votes

Choosing the segment (Central Asia, bachelor's abroad, 2027 intake) fixed the top risk from the first review. That alone turned the Monopoly lens from a pass into a "fund if". All three lenses also credit the start of verified, sourced data for the 204 target universities and the Uzbek and Russian interface.

## Risks raised by more than one member

1. **Nothing is live, and there are no users or paying customers (all three).** No domain, no hosting, no installed email and no channel. The 2027 deadlines will not wait, and every month without students shrinks the window. Pro is free, so nobody has yet shown they will pay.
2. **The segment was chosen but the product did not narrow (all three).** The landing page still sells seven features, the dashboard has about 16 sections and there are six languages. The hero leads with "14,003 universities" instead of the 204 this student targets. All three lenses answer the founder's "what else do we need?" with *less*, not more.
3. **The main path still has holes (Product, Monopoly, Offers).** Of the 204 targets:
   - deadlines cover 89 (44%);
   - tuition covers 77 (38%);
   - IELTS minimums cover 44 (22%).

   No scholarship is aimed specifically at Central Asian students. "Can I afford it, can I get in, by when?" is the student's first question, and most target pages cannot answer it fully.
4. **No offer, no price rework, payer undecided (Offers, Monopoly).** It is still $9 a month, priced against free tools. A monthly plan suits a seasonal business badly. Whether the parent or the student pays is not decided.
5. **No stated secret or moat (Monopoly, Product).** Public data can be re-collected. Nothing yet compounds, such as outcomes from this year's students or a trusted local brand.

## Where the members disagree

- **What "better" means.**
  - The Product lens says cut hard: hide the simulators, test prep, people, certificates and report behind one link, and drop Spanish, German and Chinese.
  - The Offers lens is less worried about the feature count than about turning it into one named result with a deadline and a guarantee.
  - The Monopoly lens says depth plus reach: finish the 204 and get distribution.
- **Languages.** The Product lens asks why there is Spanish, German and Chinese but no Kazakh, Kyrgyz or Tajik. The Monopoly lens sees Uzbek and Russian as the wedge.
- **The next priority.**
  - The Offers lens puts paying users first: 5 paid families before more building.
  - The Product lens puts 10 watched first sessions first.
  - The Monopoly lens puts going live and measuring the channel first.

## Conditions checklist: "what else we need"

**Ship (this week)**
- [ ] Go live on Cloudflare with a real domain. Install the email templates. Keep one honest Pro waitlist flow. (all)
- [ ] Move large datasets out of the app bundle into the database and static storage so the deploy fits. (technical prerequisite)

**Narrow**
- [ ] One job in one sentence: *"Find which of these 204 universities you can afford and get into, and what to do by when."* (Product, Offers)
- [ ] Cut the landing page to three blocks. Hide the extras behind one "Practice" link: test bank, form simulator, admission simulator, people, certificates, report. Lead with the 204, not the 14,003. (Product)
- [ ] Decide on the languages. Keep English, Uzbek and Russian. Consider Kazakh. Drop or park Spanish, German and Chinese. (Product)
- [ ] Freeze new features and new styling layers until users exist. Merge the roughly 50 CSS files. (Product, Monopoly)

**Finish the slice**
- [ ] Bring deadlines, tuition and IELTS to at least 90% across the 204, or shrink the list to what can be covered fully. Show a clear "not yet verified" state, never a blank. (all)
- [ ] Find and verify scholarships aimed at Central Asian students, or remove the promise. (Product, Offers)

**Prove it**
- [ ] Watch 10 real students from the segment use it for their first five minutes. Fix what breaks. (Product) → `/founder-consumer` first, then real people
- [ ] Get 5 paying families in Uzbekistan or Kazakhstan, each with one measurable result: a finished shortlist or a submitted application. (Offers)
- [ ] Measure where the first 100 students come from and what each costs. (Monopoly) → `/founder-marketing`, `/founder-cfo`

**Offer and price**
- [ ] Decide who pays, parent or student. (Offers, Monopoly) → `/founder-consumer`
- [ ] Turn Pro into a named result with a deadline and a guarantee. Example: "your affordable shortlist plus scholarships plus a calendar in 7 days". Price it as a season pass against what a local counsellor charges. (Offers) → `/founder-competitors`, `/founder-pricing`, `/founder-offer`

**Moat**
- [ ] Write down the secret in one sentence and test it against local agencies, Telegram channels and global platforms. (Monopoly) → `/founder-competitors`
- [ ] Start collecting outcomes from this year's students (where they applied, where they got in) to give next year's cohort something no copycat has. (Monopoly)

## The strongest version the board can see

It is the same direction as last time, now clearer. CollegeStat should be **the verified application guide for Central Asian students going abroad**. For the 200 or so universities they actually target, it answers three questions in their own language: can I afford it, can I get in, and what do I do by when. Every figure is sourced and current. It is sold to the family as a season pass with a concrete result, not as a monthly app. The features already built are not wasted, but most of them sit one click deep until real students ask for them. The edge is depth plus outcomes: complete data for this slice and, from next year, the record of who from Tashkent and Almaty got in where. The board would not fund more breadth. It would fund going live within days, closing the data gaps on the 204, and 5 to 10 real families.
