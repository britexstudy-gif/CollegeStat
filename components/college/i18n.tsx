"use client";
import "@/lib/intl-uz";
import { createContext, Fragment, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Check, Languages } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DEFAULT_LANG, LANG_COOKIE, LANGUAGES, type Lang } from "@/lib/i18n/languages";
import { translate, type MessageKey, type MessageVars } from "@/lib/i18n/messages";
import "./i18n.css";

export type Translate = (key: MessageKey, vars?: MessageVars) => string;
type I18n = { lang: Lang; setLang: (lang: Lang) => void; t: Translate };

const Context = createContext<I18n>({
  lang: DEFAULT_LANG,
  setLang: () => {},
  t: (key, vars) => translate(DEFAULT_LANG, key, vars),
});

/** Interface language for the whole app. The server picks the first value
 * from the saved cookie or the browser's languages, so pages render in the
 * right language before any script runs. */
export function I18nProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = next;
    } catch {}
  }, []);
  const value = useMemo<I18n>(
    () => ({ lang, setLang, t: (key, vars) => translate(lang, key, vars) }),
    [lang, setLang],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useI18n = () => useContext(Context);
export const useT = () => useContext(Context).t;

/** Renders a message that marks emphasis with <em>…</em> or <b>…</b>, so a
 * translation can move the emphasised words to wherever they belong. */
export function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(<em>.*?<\/em>|<b>.*?<\/b>)/).map((part, i) =>
        part.startsWith("<em>") ? (
          <em key={i}>{part.slice(4, -5)}</em>
        ) : part.startsWith("<b>") ? (
          <b key={i}>{part.slice(3, -4)}</b>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/** Language menu. `compact` shows only the icon and code (navbar);
 * otherwise the current language name is shown (settings, onboarding). */
export function LanguageSwitcher({ compact = false, align = "end" }: { compact?: boolean; align?: "start" | "end" }) {
  const { lang, setLang, t } = useI18n();
  const current = LANGUAGES.find((l) => l.code === lang)!;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={"lang-switch" + (compact ? " is-compact" : "")}
          aria-label={t("lang.label") + ": " + current.name}
          title={t("lang.label")}
        >
          <Languages size={17} aria-hidden="true" />
          <span>{compact ? current.code.toUpperCase() : current.name}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="lang-menu">
        {LANGUAGES.map((l) => (
          <DropdownMenuItem key={l.code} lang={l.code} onSelect={() => setLang(l.code)}>
            <span>{l.name}</span>
            {l.code === lang && <Check size={15} aria-hidden="true" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
