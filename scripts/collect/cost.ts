// Token-usage ledger and hard spend cap.
export const PRICE = { inputPerM: 0.30, outputPerM: 1.20 };
export const costOf = (inTok: number, outTok: number): number => (inTok * PRICE.inputPerM + outTok * PRICE.outputPerM) / 1e6;

export class Budget {
  inTok = 0; outTok = 0; calls = 0;
  constructor(public cap = 1.5, public startSpent = 0) {}
  get spent() { return this.startSpent + costOf(this.inTok, this.outTok); }
  add(inTok: number, outTok: number) { this.inTok += inTok; this.outTok += outTok; this.calls++; }
  /** True when another call (worst case ~`reserve` USD) would breach the cap. */
  exhausted(reserve = 0.002): boolean { return this.spent + reserve >= this.cap; }
}
