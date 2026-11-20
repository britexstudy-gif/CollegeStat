/** Language URLs for search engines. Every public page exists in each interface
 * language at `?lang=xx` (English, the default, has no parameter). proxy.ts
 * renders that language; this rewrite, applied by the Worker to HTML responses,
 * adds <link rel="alternate" hreflang> for all languages next to the page's
 * canonical link, makes a language URL its own canonical, and sets <html lang>. */
import { DEFAULT_LANG, isLang, LANG_CODES } from "@/lib/i18n/languages";

const REGION: Record<string, string> = { en: "en", ru: "ru", uz: "uz", es: "es", de: "de", zh: "zh-Hans" };

function withLang(href: string, lang: string) {
  const u = new URL(href);
  if (lang === DEFAULT_LANG) u.searchParams.delete("lang");
  else u.searchParams.set("lang", lang);
  return u.href;
}

type Rewriter = {
  on(selector: string, handlers: { element(el: RewriterElement): void }): Rewriter;
  transform(response: Response): Response;
};
type RewriterElement = {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  after(content: string, options: { html: boolean }): void;
};

export function localizeSeo(request: Request, response: Response): Response {
  const Ctor = (globalThis as { HTMLRewriter?: new () => Rewriter }).HTMLRewriter;
  if (!Ctor || response.status !== 200 || !(response.headers.get("content-type") || "").includes("text/html")) return response;
  const raw = new URL(request.url).searchParams.get("lang");
  const lang = isLang(raw) ? raw : null;
  return new Ctor()
    .on("html", {
      element(el) {
        if (lang) el.setAttribute("lang", lang);
      },
    })
    .on('link[rel="canonical"]', {
      element(el) {
        const href = el.getAttribute("href");
        if (!href) return;
        let base: string;
        try {
          base = withLang(href, DEFAULT_LANG);
        } catch {
          return;
        }
        if (lang) el.setAttribute("href", withLang(base, lang));
        const links = LANG_CODES.map((code) => `<link rel="alternate" hreflang="${REGION[code] || code}" href="${withLang(base, code)}">`);
        links.push(`<link rel="alternate" hreflang="x-default" href="${base}">`);
        el.after(links.join(""), { html: true });
      },
    })
    .transform(response);
}
