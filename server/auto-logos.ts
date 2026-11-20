import autoLogos from "@/data/published/auto-logos.json";
import { autoLogoURL } from "@/lib/auto-logo";

const map = autoLogos as Record<string, string>;

/** Resolve the official site icon on the server so the 300 KB id-to-format map
 * never has to ship to the browser. Records with no icon get an explicit null. */
export function withAutoLogo<T extends { id: string }>(u: T): T & { auto_logo: string | null } {
  return { ...u, auto_logo: autoLogoURL(u.id, map[u.id]) };
}
export const withAutoLogos = <T extends { id: string }>(rows: readonly T[]) => rows.map(withAutoLogo);

/** Attach to every university in a catalogue API payload (array, single row or
 * an object holding a `universities` array); anything else passes through. */
export function attachAutoLogos(data: unknown): unknown {
  const isRow = (v: unknown): v is { id: string; slug: string } =>
    !!v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string" && typeof (v as { slug?: unknown }).slug === "string";
  if (Array.isArray(data)) return data.map((v) => (isRow(v) ? withAutoLogo(v) : v));
  if (isRow(data)) return withAutoLogo(data);
  if (data && typeof data === "object" && Array.isArray((data as { universities?: unknown }).universities))
    return { ...data, universities: attachAutoLogos((data as { universities: unknown[] }).universities) };
  return data;
}
