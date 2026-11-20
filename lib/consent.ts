/* Cookie consent (Nov 19). One first-party cookie, `cs-consent`, holds the choice:
 *   essential cookies are always on; "personalization" and "analytics" are opt-in.
 * Personalization signals (recently viewed universities) are only written and read when allowed. */
export const CONSENT_COOKIE = "cs-consent";
export const CONSENT_EVENT = "cs-consent-change";
export const CONSENT_OPEN_EVENT = "cs-consent-open";
const RECENT_KEY = "cs-recent";
export const RECENT_MAX = 20;

export type Consent = { v: 1; personalization: boolean; analytics: boolean };

export function readConsent(): Consent | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(CONSENT_COOKIE + "="));
  if (!hit) return null;
  try {
    const raw = JSON.parse(decodeURIComponent(hit.slice(CONSENT_COOKIE.length + 1))) as { p?: unknown; a?: unknown };
    return { v: 1, personalization: raw.p === 1, analytics: raw.a === 1 };
  } catch {
    return null;
  }
}

export function writeConsent(c: Pick<Consent, "personalization" | "analytics">) {
  const value = encodeURIComponent(JSON.stringify({ v: 1, p: c.personalization ? 1 : 0, a: c.analytics ? 1 : 0 }));
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${value}; Max-Age=${60 * 60 * 24 * 365}; Path=/; SameSite=Lax${secure}`;
  // Turning personalization off also forgets what it collected.
  if (!c.personalization) clearRecent();
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

export const personalizationAllowed = () => readConsent()?.personalization === true;

export function openCookieSettings() {
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}

/** Slugs of recently viewed universities, newest first. Empty unless personalization is allowed. */
export function readRecent(): string[] {
  if (!personalizationAllowed()) return [];
  try {
    const data: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(data) ? data.filter((s): s is string => typeof s === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function recordRecent(slug: string) {
  if (!slug || !personalizationAllowed()) return;
  try {
    const next = [slug, ...readRecent().filter((s) => s !== slug)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CONSENT_EVENT));
  } catch {}
}

export function clearRecent() {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {}
}
