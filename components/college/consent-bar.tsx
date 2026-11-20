"use client";
/* Cookie consent bar (Nov 19). Replaces the one-button cookie note: essential cookies are always
 * on, "Personalization" and "Analytics" are optional. The choice lives in the `cs-consent` cookie.
 * "Cookie settings" links (footer, account menu) re-open it through openCookieSettings(). */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Cookie } from "lucide-react";
import { useT } from "./i18n";
import { CONSENT_OPEN_EVENT, readConsent, writeConsent } from "@/lib/consent";
import "./cookie-notice.css";

export function ConsentBar() {
  const t = useT();
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  const [per, setPer] = useState(false);
  const [ana, setAna] = useState(false);

  useEffect(() => {
    const c = readConsent();
    if (!c) setShow(true);
    const reopen = () => {
      const now = readConsent();
      setPer(!!now?.personalization);
      setAna(!!now?.analytics);
      setOpen(true);
      setShow(true);
    };
    window.addEventListener(CONSENT_OPEN_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, reopen);
  }, []);

  if (!show) return null;
  const save = (personalization: boolean, analytics: boolean) => {
    writeConsent({ personalization, analytics });
    setShow(false);
    setOpen(false);
  };
  const rows = [
    { id: "ess", label: t("ck2.ess"), desc: t("ck2.ess.d"), on: true, locked: true, set: () => {} },
    { id: "per", label: t("ck2.per"), desc: t("ck2.per.d"), on: per, locked: false, set: setPer },
    { id: "ana", label: t("ck2.ana"), desc: t("ck2.ana.d"), on: ana, locked: false, set: setAna },
  ];
  return (
    <div className="ck ck2" role="dialog" aria-modal="false" aria-label={t("ck2.label")}>
      <div className="ck2-head">
        <Cookie aria-hidden="true" />
        <strong>{t("ck2.title")}</strong>
      </div>
      <p>
        {t("ck2.text")} <Link href="/privacy">{t("ck.more")}</Link>
      </p>
      {open && (
        <ul className="ck2-rows">
          {rows.map((r) => (
            <li key={r.id}>
              <label>
                <input
                  type="checkbox"
                  checked={r.on}
                  disabled={r.locked}
                  onChange={(e) => (r.set as (v: boolean) => void)(e.target.checked)}
                />
                <span>
                  <b>{r.label}</b>
                  <small>{r.desc}</small>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="ck2-actions">
        {open ? (
          <button type="button" className="is-primary" onClick={() => save(per, ana)}>
            {t("ck2.save")}
          </button>
        ) : (
          <>
            <button type="button" className="is-primary" onClick={() => save(true, true)}>
              {t("ck2.all")}
            </button>
            <button type="button" onClick={() => save(false, false)}>
              {t("ck2.min")}
            </button>
            <button type="button" className="is-link" onClick={() => setOpen(true)}>
              {t("ck2.custom")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
