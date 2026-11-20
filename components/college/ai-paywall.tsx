"use client";
/* The paywall that opens when today's AI credits run out (the assistant's "quota" error).
 * Same look as the onboarding paywall; payments are not connected, so a paid choice joins
 * early access, and "Maybe tomorrow" closes it. */
import { X } from "lucide-react";
import { useI18n } from "./i18n";
import { PricingTable } from "./pricing";
import { useEarlyAccess } from "./plans-page";
import { AIMark } from "./ai-mark";
import "./onboarding.css";

export function AiPaywall({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const access = useEarlyAccess();
  return (
    <div className="ob ob-personalize ob-paywall pw-ai" role="dialog" aria-modal="true" aria-labelledby="pw-ai-title">
      <button type="button" className="pw-ai-x" onClick={onClose} aria-label={t("pw.ai.later")}>
        <X aria-hidden="true" />
      </button>
      <main className="obw">
        <span className="pw-ai-mark" aria-hidden="true">
          <AIMark tile size={40} />
        </span>
        <p className="obw-step">{t("pw.ai.step")}</p>
        <h1 id="pw-ai-title">{t("pw.ai.title")}</h1>
        <p>{t("pw.ai.text")}</p>
        <PricingTable
          compact
          current={access.current}
          earlyAccess={access.earlyAccess}
          busy={access.busy}
          onChoose={(choice) => {
            if (choice === "free") onClose();
            else void access.join(choice).then((joined) => joined && onClose());
          }}
        />
        <button type="button" className="pw-ai-later" onClick={onClose}>
          {t("pw.ai.later")}
        </button>
      </main>
    </div>
  );
}
