import data from "@/data/published/current-guidance.json";
import type { University } from "@/lib/domain";
export function CurrentGuidance({
  university,
  category,
}: {
  university?: University;
  category?: string;
}) {
  let host = "";
  try {
    host = new URL(university?.website || "").hostname.replace(/^www\./, "");
  } catch {}
  const rows = data.filter(
    (r) =>
      (!category || r.category === category) &&
      (!university ||
        r.countries.some((c) => c === university.country_code) ||
        r.domains.some((d) => host === d || host.endsWith("." + d))),
  );
  if (!rows.length) return null;
  return (
    <section className="current-guidance profile-library">
      <h2>
        {category === "Funding"
          ? "Funding opportunities & official guidance"
          : "Application updates & official guidance"}
      </h2>
      <p>
        Checked 28 September 2026. Entry-year announcements and current guidance
        from the original organizations.
      </p>
      <div className="guidance-list">
        {rows.map((r) => (
          <article key={r.id}>
            <span className="section-caption">
              {r.category} · {r.cycle}
            </span>
            <h3>
              <a href={r.url} target="_blank" rel="noreferrer">
                {r.title} ↗
              </a>
            </h3>
            <p>{r.summary}</p>
            <a
              className="text-link"
              href={r.url}
              target="_blank"
              rel="noreferrer"
            >
              Read the official guidance ↗
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
