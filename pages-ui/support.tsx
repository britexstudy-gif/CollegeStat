"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock, CreditCard, Database, GraduationCap, Mail, Search, ShieldCheck, TriangleAlert, UserRound, X } from "lucide-react";
import { useT } from "@/components/college/i18n";
import { SupportForm } from "@/components/college/support-form";
import "@/components/college/info-pages.css";
import "@/components/college/support-centre.css";

export const SUPPORT_EMAIL = "answer@collegestat.xyz";

/** Help-centre topics and the questions under each (keys sup.faqN.q / sup.faqN.a). */
const TOPICS = [
  { id: "account", icon: UserRound, faq: [9, 10, 7] },
  { id: "data", icon: Database, faq: [2, 3, 5, 6] },
  { id: "applications", icon: GraduationCap, faq: [8, 4, 11, 12, 13] },
  { id: "billing", icon: CreditCard, faq: [1, 14, 15, 16] },
  { id: "privacy", icon: ShieldCheck, faq: [17, 18, 19] },
] as const;
type TopicId = (typeof TOPICS)[number]["id"];
const CHECK = ["s1", "s2", "s3", "s4"] as const;

type Q = { n: number; topic: TopicId; q: string; a: string };

/** Help centre: search the questions, browse by topic, then write to us or report a data error. */
export default function Support() {
  const t = useT();
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<TopicId | "all">("all");
  const [formKind, setFormKind] = useState<"question" | "correction">("question");

  const all = useMemo<Q[]>(
    () =>
      TOPICS.flatMap((tp) =>
        tp.faq.map((n) => ({ n, topic: tp.id, q: t(("sup.faq" + n + ".q") as "sup.faq1.q"), a: t(("sup.faq" + n + ".a") as "sup.faq1.a") })),
      ),
    [t],
  );
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const searching = words.length > 0;
  const shown = all.filter((x) => (topic === "all" || x.topic === topic) && words.every((w) => (x.q + " " + x.a).toLowerCase().includes(w)));
  const topicLabel = (id: TopicId) => t(("sup.topic." + id) as "sup.topic.account");

  const openForm = (kind: "question" | "correction") => {
    setFormKind(kind);
    document.getElementById("contact")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="ip hc">
      <header className="hc-hero">
        <p className="hc-kicker">{t("sup.title")}</p>
        <h1>{t("sup.hc.title")}</h1>
        <p>{t("sup.hc.lead")}</p>
        <label className="hc-search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={query}
            maxLength={120}
            autoComplete="off"
            placeholder={t("sup.hc.search")}
            aria-label={t("sup.hc.search")}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label={t("sup.hc.clear")}>
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </label>
      </header>

      <nav className="hc-topics" aria-label={t("sup.hc.topics")}>
        {TOPICS.map((tp) => {
          const Icon = tp.icon;
          const on = topic === tp.id;
          return (
            <button key={tp.id} type="button" aria-pressed={on} onClick={() => setTopic(on ? "all" : tp.id)}>
              <Icon size={20} aria-hidden="true" />
              <strong>{topicLabel(tp.id)}</strong>
              <small>{t("sup.hc.count", { n: tp.faq.length })}</small>
            </button>
          );
        })}
      </nav>

      <section className="hc-faq" aria-labelledby="hc-faq">
        <div className="hc-faq-head">
          <h2 id="hc-faq">{topic === "all" ? t("sup.faq.title") : topicLabel(topic)}</h2>
          <p role="status" aria-live="polite">
            {searching || topic !== "all" ? t("sup.hc.found", { n: shown.length }) : null}
            {(searching || topic !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setTopic("all");
                }}
              >
                {t("sup.hc.showAll")}
              </button>
            )}
          </p>
        </div>
        {shown.length > 0 ? (
          TOPICS.filter((tp) => shown.some((x) => x.topic === tp.id)).map((tp) => (
            <div key={tp.id} className="hc-group">
              {topic === "all" && <h3>{topicLabel(tp.id)}</h3>}
              <div className="ip-faq">
                {shown
                  .filter((x) => x.topic === tp.id)
                  .map((x) => (
                    <details key={x.n} open={searching && shown.length <= 3}>
                      <summary>{x.q}</summary>
                      <p>{x.a}</p>
                    </details>
                  ))}
              </div>
            </div>
          ))
        ) : (
          <div className="hc-none">
            <p>{t("sup.hc.none")}</p>
            <button type="button" onClick={() => openForm("question")}>
              {t("sup.hc.ask")} <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
        )}
      </section>

      <section className="hc-check" aria-labelledby="hc-check">
        <h2 id="hc-check">{t("sup.check.title")}</h2>
        <ol>
          {CHECK.map((k, i) => (
            <li key={k}>
              <span aria-hidden="true">{i + 1}</span>
              <div>
                <h3>{t(("sup.check." + k + ".t") as "sup.check.s1.t")}</h3>
                <p>{t(("sup.check." + k + ".d") as "sup.check.s1.d")}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="ip-more">
          <Link href="/methodology">{t("sup.check.method")}</Link>
          <Link href="/sources">{t("sup.check.sources")}</Link>
        </div>
      </section>

      <section id="contact" className="hc-contact" aria-labelledby="hc-contact">
        <aside className="hc-card">
          <h2 id="hc-contact">{t("sup.contact.title")}</h2>
          <p>{t("sup.contact.d")}</p>
          <a className="hc-mail" href={"mailto:" + SUPPORT_EMAIL}>
            <Mail size={17} aria-hidden="true" /> {SUPPORT_EMAIL}
          </a>
          <p className="hc-time">
            <Clock size={15} aria-hidden="true" /> {t("sup.hc.time")}
          </p>
          <div className="hc-switch" role="group" aria-label={t("sup.hc.formType")}>
            <button type="button" aria-pressed={formKind === "question"} onClick={() => setFormKind("question")}>
              <Mail size={15} aria-hidden="true" /> {t("sup.q1.t")}
            </button>
            <button type="button" aria-pressed={formKind === "correction"} onClick={() => setFormKind("correction")}>
              <TriangleAlert size={15} aria-hidden="true" /> {t("sup.q2.t")}
            </button>
          </div>
          <p className="hc-hint">{t(formKind === "correction" ? "sup.q2.d" : "sup.q1.d")}</p>
        </aside>
        <SupportForm key={formKind} kind={formKind} />
      </section>
    </div>
  );
}
