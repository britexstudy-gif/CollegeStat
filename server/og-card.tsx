import { ImageResponse } from "next/og";

/** 1200x630 share card (next/og -> @vercel/og: satori + resvg wasm, bundled by
 * vinext for Workers). Only system-safe content: text, shapes and an optional
 * PNG/JPEG logo inlined as a data URI. Flags are omitted on purpose: emoji
 * glyphs need a font fetched from a CDN at render time. */
export type OgCard = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  facts: { label: string; value: string }[];
  logo?: string | null;
  initial: string;
};

const BLUE = "#0061fc";

/** Fetch a logo as a data URI. Satori reads PNG and JPEG only; anything else,
 * slow or large is skipped (the card then shows an initial). */
export async function inlineLogo(url: string | null | undefined): Promise<string | null> {
  if (!url || !/^https:\/\//.test(url)) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2500) });
    const type = (r.headers.get("content-type") || "").split(";")[0];
    if (!r.ok || !/^image\/(png|jpeg)$/.test(type)) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.length > 400_000) return null;
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:${type};base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export function ogCardResponse(card: OgCard, cacheControl: string) {
  const size = card.title.length > 60 ? 54 : card.title.length > 38 ? 64 : 76;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", background: "#ffffff", color: "#141414", fontFamily: "Geist, sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 30, fontWeight: 700 }}>
            <div style={{ width: 18, height: 18, borderRadius: 9, background: BLUE, marginRight: 12 }} />
            CollegeStat
          </div>
          <div style={{ fontSize: 26, color: "#63666d" }}>{clip(card.eyebrow, 40)}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center" }}>
          {card.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.logo} width={120} height={120} style={{ objectFit: "contain", marginRight: 40 }} alt="" />
          ) : (
            <div style={{ width: 120, height: 120, borderRadius: 24, background: "#eef4ff", color: BLUE, fontSize: 64, fontWeight: 700, alignItems: "center", justifyContent: "center", display: "flex", marginRight: 40, flexShrink: 0 }}>
              {card.initial}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ fontSize: size, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1 }}>{clip(card.title, 90)}</div>
            {card.subtitle ? <div style={{ fontSize: 32, color: "#63666d", marginTop: 14 }}>{clip(card.subtitle, 70)}</div> : null}
          </div>
        </div>
        <div style={{ display: "flex", borderTop: "2px solid #e6e6e3", paddingTop: 28 }}>
          {card.facts.slice(0, 3).map((f) => (
            <div key={f.label} style={{ display: "flex", flexDirection: "column", marginRight: 64 }}>
              <div style={{ fontSize: 40, fontWeight: 700 }}>{clip(f.value, 22)}</div>
              <div style={{ fontSize: 24, color: "#63666d", marginTop: 4 }}>{f.label}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": cacheControl } },
  );
}
