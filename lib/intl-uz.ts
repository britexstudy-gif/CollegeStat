/* Uzbek dates that read the same in every browser.
 * Chrome and Safari ship without Uzbek calendar data, so Intl prints "2027 M02 1" and "+75 d".
 * This patches Intl.DateTimeFormat, Intl.RelativeTimeFormat and Date#toLocale*String for "uz*"
 * locales only: the date is laid out like en-GB (day, month, year) with Uzbek month and weekday
 * names, and relative times read "75 kundan keyin" / "3 kun oldin". It always runs for Uzbek
 * (even where the runtime has data) so the server and the browser print the same text.
 * Imported once on the server (app/layout.tsx) and once in the browser (components/college/i18n.tsx). */

const MONTHS_LONG = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const MONTHS_SHORT = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];
const DAYS_LONG = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];
const DAYS_SHORT = ["yak", "dush", "sesh", "chor", "pay", "jum", "shan"];
const EN_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const isUz = (locales: unknown) => {
  const first = Array.isArray(locales) ? locales[0] : locales;
  return typeof first === "string" && /^uz(-|$)/i.test(first);
};

declare global {
  // eslint-disable-next-line no-var
  var __csIntlUz:
    | { DTF: typeof Intl.DateTimeFormat; RTF: typeof Intl.RelativeTimeFormat; date: Pick<Date, "toLocaleDateString" | "toLocaleString" | "toLocaleTimeString"> }
    | undefined;
}

export function installUzbekIntl() {
  if (typeof Intl === "undefined") return;
  // Keep the engine's own constructors from the first run, so a dev reload re-patches from them (never wraps a wrapper).
  if (typeof globalThis.__csIntlUz !== "object") globalThis.__csIntlUz = undefined;
  const base = (globalThis.__csIntlUz ??= {
    DTF: Intl.DateTimeFormat,
    RTF: Intl.RelativeTimeFormat,
    date: { toLocaleDateString: Date.prototype.toLocaleDateString, toLocaleString: Date.prototype.toLocaleString, toLocaleTimeString: Date.prototype.toLocaleTimeString },
  });
  const DTF = base.DTF;
  const RTF = base.RTF;

  class UzDateFormat {
    private en: Intl.DateTimeFormat;
    private key: Intl.DateTimeFormat;
    private opts: Intl.DateTimeFormatOptions;
    constructor(options?: Intl.DateTimeFormatOptions) {
      this.opts = options ?? {};
      this.en = new DTF("en-GB", options);
      // Month and weekday as indexes, in the same time zone.
      this.key = new DTF("en-US", { timeZone: this.en.resolvedOptions().timeZone, month: "numeric", weekday: "short" });
    }
    formatToParts(date?: Date | number): Intl.DateTimeFormatPart[] {
      const d = date === undefined ? new Date() : date;
      const keys = this.key.formatToParts(d);
      const m = Number(keys.find((p) => p.type === "month")?.value ?? 1) - 1;
      const w = EN_DAYS.indexOf(keys.find((p) => p.type === "weekday")?.value ?? "Sun");
      const numericMonth = this.opts.month === "numeric" || this.opts.month === "2-digit";
      return this.en.formatToParts(d).map((p) => {
        if (p.type === "month" && !numericMonth) return { ...p, value: this.opts.month === "long" || this.opts.dateStyle === "long" || this.opts.dateStyle === "full" ? MONTHS_LONG[m] : MONTHS_SHORT[m] };
        if (p.type === "weekday") return { ...p, value: this.opts.weekday === "narrow" ? DAYS_SHORT[w][0].toUpperCase() : this.opts.weekday === "long" || this.opts.dateStyle === "full" ? DAYS_LONG[w] : DAYS_SHORT[w] };
        if (p.type === "literal" && p.value === "/") return { ...p, value: "." };
        return p;
      });
    }
    format = (date?: Date | number) => this.formatToParts(date).map((p) => p.value).join("");
    formatRange(a: Date | number, b: Date | number) {
      return this.format(a) + " – " + this.format(b);
    }
    resolvedOptions() {
      return { ...this.en.resolvedOptions(), locale: "uz" };
    }
  }

  const PatchedDTF = function (this: unknown, locales?: string | string[], options?: Intl.DateTimeFormatOptions) {
    return isUz(locales) ? new UzDateFormat(options) : new DTF(locales, options);
  } as unknown as typeof Intl.DateTimeFormat;
  (PatchedDTF as unknown as { prototype: object }).prototype = DTF.prototype;
  PatchedDTF.supportedLocalesOf = DTF.supportedLocalesOf.bind(DTF);
  (Intl as unknown as Record<string, unknown>).DateTimeFormat = PatchedDTF;

  if (RTF) {
    const WORD: Record<string, string> = { second: "soniya", minute: "daqiqa", hour: "soat", day: "kun", week: "hafta", month: "oy", quarter: "chorak", year: "yil" };
    class UzRelative {
      constructor(private opts: Intl.RelativeTimeFormatOptions = {}) {}
      format(value: number, unit: Intl.RelativeTimeFormatUnit) {
        const u = String(unit).replace(/s$/, "");
        if (this.opts.numeric === "auto" && u === "day" && Math.abs(value) <= 1) return value === 0 ? "bugun" : value > 0 ? "ertaga" : "kecha";
        const word = WORD[u] ?? u;
        const n = Math.abs(value).toLocaleString("en-US").replace(/,/g, " ");
        return value < 0 || Object.is(value, -0) ? `${n} ${word} oldin` : `${n} ${word}dan keyin`;
      }
      formatToParts(value: number, unit: Intl.RelativeTimeFormatUnit) {
        return [{ type: "literal" as const, value: this.format(value, unit) }];
      }
      resolvedOptions() {
        return { locale: "uz", style: this.opts.style ?? "long", numeric: this.opts.numeric ?? "always", numberingSystem: "latn" };
      }
    }
    const PatchedRTF = function (this: unknown, locales?: string | string[], options?: Intl.RelativeTimeFormatOptions) {
      return isUz(locales) ? new UzRelative(options) : new RTF(locales, options);
    } as unknown as typeof Intl.RelativeTimeFormat;
    (PatchedRTF as unknown as { prototype: object }).prototype = RTF.prototype;
    PatchedRTF.supportedLocalesOf = RTF.supportedLocalesOf.bind(RTF);
    (Intl as unknown as Record<string, unknown>).RelativeTimeFormat = PatchedRTF;
  }

  // Date#toLocaleDateString("uz") and friends go straight to the engine, so route them too.
  const proto = Date.prototype;
  const patch = (name: "toLocaleDateString" | "toLocaleString" | "toLocaleTimeString", defaults: Intl.DateTimeFormatOptions) => {
    const original = base.date[name];
    proto[name] = function (this: Date, locales?: string | string[], options?: Intl.DateTimeFormatOptions) {
      if (!isUz(locales)) return original.call(this, locales, options);
      const has = options && ["year", "month", "day", "weekday", "hour", "minute", "second", "dateStyle", "timeStyle"].some((k) => k in options);
      return new Intl.DateTimeFormat("uz", has ? options : { ...defaults, ...options }).format(this);
    } as (typeof proto)[typeof name];
  };
  patch("toLocaleDateString", { day: "numeric", month: "numeric", year: "numeric" });
  patch("toLocaleString", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  patch("toLocaleTimeString", { hour: "2-digit", minute: "2-digit" });
}

installUzbekIntl();
