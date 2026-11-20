import { countryName, type University } from "@/lib/domain";
import { similarUniversities } from "@/server/similar-universities";

/** Server-rendered crawlable links: same-country schools with nearby rank, and
 * the country listing. Plain anchors, so crawlers follow them without scripts. */
export async function SimilarUniversities({ university }: { university: University }) {
  const similar = await similarUniversities(university);
  const country = countryName(university.country_code);
  const heading = { fontSize: "var(--cs-text-md)", fontWeight: 600, margin: "0 0 12px" } as const;
  return (
    <nav
      aria-label="Similar universities"
      style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 16px 48px", borderTop: "1px solid var(--cs-line)", color: "var(--cs-ink)" }}
    >
      {similar.length > 0 && (
        <>
          <h2 style={heading}>Similar universities in {country}</h2>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "8px 24px", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {similar.map((s) => (
              <li key={s.slug}>
                <a href={"/university/" + s.slug} style={{ color: "var(--cs-ink)", textDecoration: "none" }}>
                  <span style={{ fontWeight: 500 }}>{s.name}</span>
                  {s.city ? <span style={{ color: "var(--cs-muted)", fontSize: "var(--cs-text-sm)" }}>{", " + s.city}</span> : null}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      <p style={{ margin: similar.length ? "16px 0 0" : 0, fontSize: "var(--cs-text-sm)" }}>
        <a href={"/universities?country=" + university.country_code} style={{ color: "var(--cs-accent-text)" }}>
          All universities in {country}
        </a>
      </p>
    </nav>
  );
}
