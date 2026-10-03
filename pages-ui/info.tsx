"use client";
import { universityMarks } from "@/lib/university-assets";
import { DatasetRegister } from "@/components/college/dataset-register";
import { useCollege } from "@/components/college/provider";
import { SourceDrawer } from "@/components/college/metrics";
const copy: Record<string, { title: string; sections: [string, string][] }> = {
  methodology: {
    title: "Evidence before confidence.",
    sections: [
      [
        "Sources and verification",
        "We prefer primary institutional and government sources. Every numerical record carries a reporting year, source reference, retrieval timestamp, and verification state. Verification means the value was checked against its cited page; it does not guarantee that the publisher will not revise it.",
      ],
      [
        "Missing data is not zero",
        "Unknown values remain null. Numeric filters exclude records without the required value. Comparisons retain original currencies and years. Trend charts require at least two sourced observations. A missing rank never means a low rank.",
      ],
      [
        "Calculated indicators",
        "Data completeness is the percentage of ten defined research metrics with published values. CollegeStat Fit uses your country, program, budget, and aid preferences, with weights you control. Only supported dimensions enter the weighted average. It is a preference indicator, never an admission probability or official university score.",
      ],
      [
        "Currency and comparability",
        "Original source currency is preserved. Optional conversions require a stored exchange-rate source and timestamp and are labeled estimates. Amounts for different populations, programs, and years may not be directly comparable.",
      ],
      [
        "Ranking permissions",
        "Provider editions stay hidden unless reuse permission is recorded for both provider and edition. We do not synthesize a combined rank, reproduce protected editions without permission, or invent methodology weights.",
      ],
      [
        "Corrections and conflicts",
        "Imports enter a review queue. Conflicting observations are retained and flagged; they do not silently replace canonical records. Administrative changes are audited. Source drawers expose notes and uncertainty.",
      ],
    ],
  },
  privacy: {
    title: "Your research stays yours.",
    sections: [
      [
        "Private by default",
        "Your saved universities, notes, lists, preferences, comparisons, and browsing history are protected by owner-only database policies. Administrators manage catalogue content, not a public feed of your private research.",
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
        "Loading a map contacts the configured tile provider. AI requests run on the server and receive your question plus selected public university facts, not your private notes or profile. OpenAI requests use store:false. The provider’s applicable data policy still applies.",
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
        "Local development status",
        "This build is a local preview. Connected account, catalogue, and AI features depend on the configured services. This page is a product usage notice, not a substitute for launch-specific legal terms.",
      ],
    ],
  },
  about: {
    title: "Research universities with evidence.",
    sections: [
      [
        "A workspace for considered decisions",
        "CollegeStat brings university discovery, source inspection, comparison, and private research notes into one workflow. It gives you context for decisions rather than promising a perfect match.",
      ],
      [
        "Independence",
        "CollegeStat is independent of the universities and ranking organizations referenced in its catalogue. Source links are attribution, not an endorsement or partnership.",
      ],
    ],
  },
};
export default function Info({ page }: { page: string }) {
  const s = useCollege();
  if (page === "sources") {
    const records = s.universities.flatMap((u) => [
      ...u.data_points,
      ...u.admissions,
      ...u.costs,
      ...u.ranking_entries,
    ]);
    const unique = [
      ...new Map(
        records.filter((r) => r.data_sources).map((r) => [r.source_id, r]),
      ).values(),
    ];
    return (
      <article className="prose-page">
        <div className="eyebrow">SOURCE REGISTER</div>
        <h1>Follow the number back.</h1>
        <p>
          Sources cited in the currently loaded catalogue. Each university
          profile contains its complete metric-level source record.
        </p>
        {unique.map((r) => (
          <section
            className="panel"
            style={{ marginTop: 16 }}
            key={r.source_id}
          >
            <SourceDrawer record={r} label={r.data_sources!.name}>
              <h3>{r.data_sources!.name} ↗</h3>
              <p className="caption">{r.data_sources!.organization}</p>
            </SourceDrawer>
          </section>
        ))}
        <DatasetRegister />
        <h2>University marks</h2>
        <p className="caption">
          Marks identify institutions. CollegeStat is independent and does not
          imply university endorsement.
        </p>
        {universityMarks.map((m) => (
          <p key={m.slug}>
            <a
              href={m.source}
              target="_blank"
              rel="noreferrer"
              className="text-link"
            >
              {m.slug.toUpperCase()} ↗
            </a>
            <span className="caption"> · {m.credit}</span>
          </p>
        ))}
        <h2>Institution identity references</h2>
        {s.universities.map(
          (u) =>
            u.reference_url && (
              <p key={u.id}>
                <a
                  className="text-link"
                  href={u.reference_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {u.name} ↗
                </a>
              </p>
            ),
        )}
      </article>
    );
  }
  const c = copy[page];
  if (!c) return null;
  return (
    <article className="prose-page">
      <div className="eyebrow">COLLEGESTAT / {page.toUpperCase()}</div>
      <h1>{c.title}</h1>
      {c.sections.map(([h, p]) => (
        <section key={h}>
          <h2>{h}</h2>
          <p>{p}</p>
        </section>
      ))}
    </article>
  );
}
