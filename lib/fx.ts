/** Approximate USD rates, only for comparing tuition with a student's budget (never shown as a
 * price). Fixed values from 2025 averages; a budget check is a rough guide, not a quote.
 * Update the table, not the callers, when rates move. */
export const FX_AS_OF = "2025";
const USD_PER: Record<string, number> = {
  USD: 1, EUR: 1.08, GBP: 1.27, CHF: 1.13, CAD: 0.73, AUD: 0.66, NZD: 0.6, SGD: 0.74, HKD: 0.128, JPY: 0.0067,
  KRW: 0.00073, CNY: 0.14, TWD: 0.031, MYR: 0.22, THB: 0.028, INR: 0.012, AED: 0.272, SAR: 0.267, QAR: 0.275,
  ILS: 0.27, TRY: 0.029, SEK: 0.095, NOK: 0.093, DKK: 0.145, PLN: 0.25, CZK: 0.043, HUF: 0.0027, RON: 0.22,
  RUB: 0.011, KZT: 0.002, UZS: 0.000079, KGS: 0.0115, TJS: 0.093, BRL: 0.19, MXN: 0.055, ZAR: 0.055,
};

/** Amount in USD, or undefined when the currency is unknown. */
export function toUSD(amount: number, currency: string | undefined | null): number | undefined {
  const rate = USD_PER[(currency || "").toUpperCase()];
  return rate === undefined ? undefined : Math.round(amount * rate);
}
