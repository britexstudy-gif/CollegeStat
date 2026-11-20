"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Lang } from "@/lib/i18n/languages";
import { useI18n } from "./i18n";

/** Server-translated pages: when the interface language changes after load, fetch the page again in that language. */
export function useRefreshOnLang(rendered: Lang | undefined) {
  const { lang } = useI18n();
  const router = useRouter();
  useEffect(() => {
    if (rendered && lang !== rendered) router.refresh();
  }, [lang, rendered, router]);
}
