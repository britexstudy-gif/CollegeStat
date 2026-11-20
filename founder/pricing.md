# CollegeStat pricing (20 Nov 2026)

Inputs: 20 simulated buyers (`panel/answers`, curve in `pricing-curve.md`), the competitor prices (`competitors.md`) and the offer (`offer.md`). **No CFO numbers exist yet** (`numbers.json` is missing), so the margin at each price is not computed. Run `/founder-cfo` before committing.

## What the panel says
- Acceptable range: **$25 to $113** for the season. Least resistance (OPP) is **$65**; bargain = expensive (IPP) at **$54**.
- Median answers: too cheap $10, bargain $30, expensive $70, too expensive $150.
- $99 is inside the range but near the top, and **0 of 20 bought at $99**. Only 2 of 20 passed on price. 11 passed on **trust** (unknown site, paying a foreign card, no person to talk to), so a lower price alone will not fix the buy rate.
- The panel splits in two:
  - **Self-serve families** (middle and upper-middle income, Germany/Korea/Turkey/Poland, UK/Europe): too expensive above about $70-120, bargain at about $20-40.
  - **Premium families** (US/UK top schools, 3 of 20): $99 reads as *too cheap to be serious*. Their bargain is $150-400 and their "too expensive" $2,000-6,000, but they want a named human counsellor, not software.

## What competitors charge (for one season of help)
| | Price | Includes |
|---|---|---|
| Ladnaan | $99.99 | one session, one application |
| Borderless (Kai Max) | $300 | season pass to 1 Apr 2027 |
| SI-UK Premium | £490 | 5 UCAS applications, human advisers |
| Study America | 399,990 ₽ | full US service |
| Crimson | "upwards of $25,000" (reported) | full premium consulting |
| Local agencies (4PREP, Instrux, Everstudy, Euroschool) | not published | often "free" to families (paid by university commission) |

Software-only at a published season price sits well below every human service. The cheapest human-led pass found is Borderless at $300.

## 1. The price
**Season Pass: $49 for the 2027 season**, charged in local currency (so'm via Click/Payme, tenge via Kaspi).
- **Why:**
  - It sits between IPP ($54) and the bargain median ($30), in the low-resistance zone for the self-serve majority.
  - It is a sixth of the cheapest human season pass ($300), so it clearly reads as a tool, not an agency.
  - It is low enough to try once trust exists.
- **Margin:** not known until `/founder-cfo` runs. The variable cost per family is mostly AI calls and hosting and is expected to be small, but that is an assumption, not a number.

## 2. The ladder
| Rung | Price | Who | Reason to step up |
|---|---|---|---|
| **Explorer** | Free | everyone | search, guides, **one full practice application**. This is where a family sees the product catch a real mistake |
| **Season Pass** | $49 / season | self-serve families (the majority) | verified shortlist for all schools, every practice application, dated plan, weekly parent report in RU/UZ, scholarship match |
| **Season Pass + Counsellor** | test $299-399 / season | premium families (US/UK top schools) | a named Russian-/Uzbek-speaking person: shortlist call, two essay reviews by a human, deadline check-ins. Offer **only if** the founder can staff it. |

This replaces the current Scholar $6/month and Admit $15/month. A monthly price suits a seasonal decision badly.

## 3. The opening offer
**Founding families price: $39 for the first 50 families, until 31 Dec 2026**, and that price holds for their whole 2027 season.
- No "was $X" anchor: $49 is simply the price after the founding batch.
- The cap of 50 must be real.
- Pair it with what the panel actually asked for: payment by Click/Payme/Kaspi, a named person answering on Telegram, and the 14-day refund.

## 4. What to test with real buyers
- **Price:** two pre-sale pages, **$39 vs $59**, each taking real payment by Click/Payme. Measure paid conversions per 100 visitors from the same Telegram post.
- **Premium:** a waitlist page for "Season Pass + Counsellor" at $349, to count genuine interest before staffing anything.
- **Trust before price:** the same page with and without "talk to us on Telegram + pay in so'm". The panel says this moves more than price.

## 5. Top price objections, verbatim (simulated buyers, not customers)
1. "$99 is about two weeks of my family's income, and we already pay for IELTS prep." (P008)
2. "$99 is almost a week and a half of what I earn, paid by an international card I barely use." (P018)
3. "If another parent I know… told me it caught a mistake the agency made, or a cheaper first payment so I can try it before giving the full $99." (P007)

And the premium side: "$99 for 'unlimited essay review' sounds too good to be serious." (P001)

## Honest limits
These are 20 simulated buyers, not customers. Use them to pick what to test, not as proof. Price is not the main blocker; trust is. Next: `/founder-cfo` for the margin, then `/founder-offer` to rebuild the offer around trust.
