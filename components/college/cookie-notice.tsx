"use client";
/* A one-time note on cookies. CollegeStat sets only essential cookies (language, sidebar state,
 * sign-in) and no analytics or ad trackers, so there is nothing to opt out of: one "OK" button. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Cookie } from "lucide-react";
import { useT } from "./i18n";
import "./cookie-notice.css";

const KEY = "cs-cookie-note";

export function CookieNotice() {
  const t = useT();
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {}
  }, []);
  if (!show) return null;
  return (
    <div className="ck" role="region" aria-label={t("ck.label")}>
      <Cookie aria-hidden="true" />
      <p>
        {t("ck.text")}{" "}
        <Link href="/privacy">{t("ck.more")}</Link>
      </p>
      <button
        type="button"
        onClick={() => {
          try {
            localStorage.setItem(KEY, "1");
          } catch {}
          setShow(false);
        }}
      >
        {t("ck.ok")}
      </button>
    </div>
  );
}
