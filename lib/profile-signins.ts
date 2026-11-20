/* A small per-device sign-in log, kept in this browser only (localStorage, keyed by user id).
 * Supabase tells the client when the current session started (user.last_sign_in_at), so each new
 * value is written down once. It never leaves the device and cannot see other devices. */
export type SignIn = {
  /** user.last_sign_in_at: unique per sign-in. */
  id: string;
  at: string;
  provider: string;
  browser: string;
  os: string;
  kind: "mobile" | "tablet" | "desktop";
  /** IANA time zone of the device, used as an approximate location. */
  tz: string;
};

const MAX = 20;
const key = (uid: string) => "cs.signins." + uid;

export function describeDevice(ua: string): Pick<SignIn, "browser" | "os" | "kind"> {
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\/|CriOS\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : "";
  const kind = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? "tablet" : /iPhone|Android|Mobile/.test(ua) ? "mobile" : "desktop";
  return { browser, os, kind };
}

export function readSignIns(uid: string): SignIn[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key(uid)) || "[]");
    return Array.isArray(raw) ? raw.filter((x): x is SignIn => !!x && typeof x.id === "string" && typeof x.at === "string") : [];
  } catch {
    return [];
  }
}

export function clearSignIns(uid: string) {
  try {
    localStorage.removeItem(key(uid));
  } catch {
    /* storage unavailable */
  }
}

/** Writes the current session once and returns the newest-first list. */
export function recordSignIn(uid: string, lastSignInAt: string | null | undefined, provider: string): SignIn[] {
  const list = readSignIns(uid);
  if (!lastSignInAt || list.some((x) => x.id === lastSignInAt)) return list;
  let tz = "";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    /* no Intl time zone */
  }
  const next = [{ id: lastSignInAt, at: lastSignInAt, provider, ...describeDevice(navigator.userAgent), tz }, ...list]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, MAX);
  try {
    localStorage.setItem(key(uid), JSON.stringify(next));
  } catch {
    /* storage unavailable: still show it this time */
  }
  return next;
}
