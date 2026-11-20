"use client";
import Link from "next/link";
import { useT } from "@/components/college/i18n";
import "@/components/college/info-pages.css";
import { universityMarks } from "@/lib/university-assets";
import { DatasetRegister } from "@/components/college/dataset-register";
import { useCollege } from "@/components/college/provider";
import { SourceDrawer } from "@/components/college/metrics";
const copy: Record<string, { title: string; sections: [string, string][] }> = {
  privacy: {
    title: "Your research stays yours.",
    sections: [
      [
        "Private by default",
        "Your saved universities, notes, lists, preferences, comparisons, and browsing history are protected by access rules so only you can see them. Administrators manage catalogue content, not a public feed of your private research.",
      ],
      [
        "What is stored",
        "When you sign in, Supabase manages your account and authentication session. CollegeStat stores only the profile and research information you choose to provide. Recent command searches and theme preferences are kept on your device.",
      ],
      [
        "Your controls",
        "Your profile provides personal-data export, preference clearing, history clearing, and account deletion. Deleting your account cascades to associated private records. Auth provider and infrastructure retention policies apply separately.",
      ],
      [
        "Maps and AI",
        "Loading a map contacts our map tile provider. AI requests run on the server and receive your question plus selected public university facts, not your private notes or profile. AI requests are sent with provider storage turned off. The provider’s applicable data policy still applies.",
      ],
      [
        "Analytics",
        "No third-party behavioral analytics or advertising trackers are installed. Signed-in university views are stored as private research history to support your dashboard.",
      ],
    ],
  },
  terms: {
    title: "Use the evidence. Confirm the details.",
    sections: [
      [
        "Research support",
        "CollegeStat is an independent research workspace. It does not represent universities or guarantee admission, funding, employment, or other outcomes.",
      ],
      [
        "Check the original publication",
        "Institutional policies, deadlines, and costs change. Confirm material decisions through the linked official sources. Source years and caveats are part of every comparison.",
      ],
      [
        "Your account",
        "Keep your login secure and submit accurate source information. Do not upload harmful files or use the service to access another person’s research.",
      ],
      [
        "Service availability",
        "Account, catalogue and AI features depend on third-party services and may occasionally be unavailable. This page is a product usage notice, not a substitute for formal legal terms.",
      ],
    ],
  },
};
const STEPS = { about: ["s1", "s2", "s3"], methodology: ["s1", "s2", "s3", "s4", "s5", "s6"] } as const;

export default function Info({ page }: { page: string }) {
  const s = useCollege();
  const t = useT();
  if (page === "about" || page === "methodology") {
    const ns = page === "about" ? "about" : "meth";
    return (
      <article className="ip ip-prose">
        <header className="ip-head">
          <h1>{t((ns + ".title") as "about.title")}</h1>
          <p>{t((ns + ".lead") as "about.lead")}</p>
        </header>
        {STEPS[page].map((k) => (
          <section key={k}>
            <h2>{t((ns + "." + k + ".t") as "about.s1.t")}</h2>
            <p>{t((ns + "." + k + ".d") as "about.s1.d")}</p>
          </section>
        ))}
        <div className="ip-more">
          <Link href="/support">{t("sup.title")}</Link>
          <Link href={page === "about" ? "/methodology" : "/sources"}>{t(page === "about" ? "sup.check.method" : "sup.check.sources")}</Link>
        </div>
      </article>
    );
  }
  if (page === "sources") {
    const records = s.universities.flatMap((u) => [...u.data_points, ...u.admissions, ...u.costs, ...u.ranking_entries]);
    const unique = [...new Map(records.filter((r) => r.data_sources).map((r) => [r.source_id, r])).values()];
    return (
      <article className="ip ip-prose">
        <header className="ip-head">
          <h1>{t("src.title")}</h1>
          <p>{t("src.lead")}</p>
        </header>
        <section>
          <ul className="ip-sources">
            {unique.map((r) => (
              <li key={r.source_id}>
                <SourceDrawer record={r} label={r.data_sources!.name}>
                  <strong>{r.data_sources!.name} ↗</strong>
                  <p className="caption">{r.data_sources!.organization}</p>
                </SourceDrawer>
              </li>
            ))}
          </ul>
        </section>
        <DatasetRegister />
        <section>
          <h2>{t("src.marks")}</h2>
          <p>{t("src.marks.d")}</p>
          {universityMarks.map((m) => (
            <p key={m.slug}>
              <a href={m.source} target="_blank" rel="noreferrer">
                {m.slug.toUpperCase()} ↗
              </a>
              <span> · {m.credit}</span>
            </p>
          ))}
        </section>
        <section>
          <h2>{t("src.refs")}</h2>
          {s.universities.map(
            (u) =>
              u.reference_url && (
                <p key={u.id}>
                  <a href={u.reference_url} target="_blank" rel="noreferrer">
                    {u.name} ↗
                  </a>
                </p>
              ),
          )}
        </section>
      </article>
    );
  }
  const c = copy[page];
  if (!c) return null;
  return (
    <article className="ip ip-prose">
      <header className="ip-head">
        <h1>{c.title}</h1>
      </header>
      {c.sections.map(([h, p]) => (
        <section key={h}>
          <h2>{h}</h2>
          <p>{p}</p>
        </section>
      ))}
    </article>
  );
}
