# CollegeStat: the offer (20 Nov 2026)

Method: the Offers lens (founder-board/lenses.md). Inputs: `idea.md` and `board.md` (third review). No buyer panel, CFO numbers or competitor map exist yet, so the problems below are from the brief, the board memos and the product itself. Costs are relative (1 = almost free, 5 = expensive founder time). Every price here is a hypothesis for `/founder-pricing` to test.

## The market check
- **Pain:** real and dated. Missing one deadline or one requirement costs a year.
- **Money:** families pay for this today (agencies, counsellors, prep centres), but what they pay is unknown. That's for `/founder-competitors`.
- **Easy to reach:** partly. They are in Russian- and Uzbek-language Telegram channels and on search engines; no channel has been tested yet.
- **Growing:** assumed, not measured.

## Who buys
**The parent pays and the student uses it.** The parent holds the money and the fear ("will my child miss something?"). The student does the work. The offer has to speak to both: a result the parent can see, and tools the student actually uses.

## The problem list (in the buyer's words)
**Before buying**
1. "We don't know which universities he can really get into."
2. "We don't know which ones we can afford."
3. "Every site has different numbers; who do we trust?"
4. "It's all in English; I can't follow it as a parent."
5. "Agencies cost a lot and we don't know if they're honest."
6. "Is this just another website?"
7. "Monthly subscription? We need it for one season."

**During**
8. "Each university uses a different portal and form."
9. "We'll miss a deadline."
10. "We don't know what documents, translations or apostilles are needed."
11. "The essay: is it good enough? Who checks it?"
12. "IELTS/SAT: is the score enough for this school?"
13. "Scholarships: which ones are actually open to Uzbek/Kazakh students?"
14. "As a parent I can't see if my child is on track."
15. "Too many tools; where do we start?"

**After**
16. "What if the data was wrong and we missed something?"
17. "What if we get rejected everywhere?"
18. "What if it doesn't help? We paid for nothing."

## Solutions, scored (value 1-5 / cost 1-5)
| # | Solution | Value | Cost | Keep? |
|---|---|---|---|---|
| 1, 2, 12 | **Verified shortlist:** 8-10 universities matched to grades, scores and budget, each with deadline, total yearly cost and English minimum checked against the official page | 5 | 2 (data work done once, reused) | Core |
| 8, 18 | **Practice run of each real application** (Common App, UCAS, uni-assist…) with a review of what is missing | 5 | 1 (built) | Core |
| 9, 15 | **Dated plan to submission:** every task and deadline for the shortlist, in order | 5 | 1 (built) | Core |
| 3, 16 | **"Verified" badge with source and date** on every number; "not verified" otherwise | 4 | 2 | Core |
| 4, 14 | **Parent report in Russian/Uzbek**, weekly: on track, what's due, what's missing | 5 | 2 (the AI report exists; needs a parent view) | Bonus |
| 13 | **Scholarship match** for the shortlist, marked open/not open to Central Asian students | 4 | 2 | Bonus |
| 11 | **Essay review rounds** (AI review by category, unlimited in season) | 4 | 1 | Bonus |
| 10 | **Document checklist per country** (translations, apostille, proof of funds) from the guides | 4 | 1 (guides exist) | Bonus |
| 9 | Telegram deadline reminders | 4 | 3 (not built) | Later |
| 5 | Human counsellor calls | 5 | 5 | No (doesn't scale) |
| 17 | Admission guarantee | 5 | 5 | Never (can't be promised) |

## The stack

### Name
**"2027 Ready-to-Submit"** (UZ: *"2027: Topshirishga tayyor"*, RU: *"2027: Готов к подаче"*).

### The core (described by outcome)
> **Your child's 2027 applications, ready to submit on time, to universities you can afford.**
> A verified shortlist of 8-10 universities that fit their grades and your budget, a practice run of each real application, and a dated plan to the last deadline.

### Bonuses (each kills one objection)
1. **Parent report in Russian or Uzbek, every week:** kills "I can't follow it / I can't see progress" (4, 14).
2. **Scholarship match for your shortlist:** kills "we can't afford it" (13).
3. **Unlimited essay review for the season:** kills "is the essay good enough?" (11).

### Guarantee (affordable because it is tied to the data, not to admission)
> **The verified-data promise:** if any deadline, cost or English requirement we marked "verified" on your shortlist turns out to be wrong, we refund the full season. Plus a **14-day no-questions refund**.

Never promise admission. This guarantee also forces the data work the board asked for, because it is only safe to offer once shortlist data is really verified.

### Urgency (true only)
- **The real deadlines:** UCAS, January Common App rounds and spring uni-assist dates. The season pass ends at the student's last deadline. This is real.
- **Optional real scarcity:** a "first 20 families" batch where the founder personally checks each shortlist. Use it only if the founder actually caps it.

### Price (hypothesis to test, not decided)
- **One season price, not monthly.** The live site already has Admit at $99/year. A season pass at about that level is the obvious first test.
- Test it against what local counsellors charge (unknown → `/founder-competitors`, `/founder-pricing`).
- The free plan stays: search, guides and one practice application, so the paid pass is the "ready to submit" result.

## Value equation (1-10, before → after)
| Element | Before (toolbox, $6-15/mo) | After (Ready-to-Submit) | What moves it |
|---|---|---|---|
| Dream outcome | 5 | 8 | Named result: "ready to submit on time, affordable" |
| Perceived likelihood | 2 | 5 | Verified badges + data guarantee + practice runs. It reaches 7+ only with real families' results. |
| Time to result | 4 | 7 | Shortlist on day 1, dated plan |
| Effort and sacrifice | 4 | 7 | One path instead of 7 tools; parent report in their language |

Likelihood stays the weakest score. Only proof fixes it: the first 5 paying families and their outcomes.

## What it requires before selling
1. Shortlist data verified to 90%+ for the 204 targets (deadline, cost, English). The guarantee depends on it.
2. A parent view of the weekly report (RU/UZ).
3. One price page, landing page and paywall rewritten around this offer.
4. Feature freeze: everything else becomes supporting or hidden.

## Re-test
Not run. `/founder-consumer --quick` needs a buyer panel, and none exists yet. Run `/founder-consumer` (it builds the panel), then compare buy rates for the old toolbox pitch (`pitch-v1.md`) and this one (`pitch.md`).
