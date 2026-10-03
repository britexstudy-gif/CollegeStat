import profiles from "@/data/published/publisher-profile-details.json";
import type { University } from "@/lib/domain";
export function PublisherProfile({
  university: u,
  history = false,
}: {
  university: University;
  history?: boolean;
}) {
  let host = "";
  try {
    host = new URL(u.website || "").hostname.replace(/^www\./, "");
  } catch {}
  const p = profiles.find(
    (p) => host === p.domain || host.endsWith("." + p.domain),
  );
  if (!p) return null;
  return (
    <section className="profile-section-guide">
      <span className="section-caption">{p.publisher} UNIVERSITY PROFILE</span>
      <h3>{history ? "QS world ranking history" : "QS profile details"}</h3>
      <p>{p.summary}</p>
      {history ? (
        <div className="rank-history-grid">
          {p.rank_history.map((r) => (
            <div key={r.year}>
              <span>{r.year}</span>
              <strong>{r.label}</strong>
            </div>
          ))}
        </div>
      ) : (
        <div className="publisher-fact-grid">
          {p.facts.map((f) => (
            <div key={f.label}>
              <span>{f.label}</span>
              <strong>
                {f.value.toLocaleString()}
                {f.unit}
              </strong>
            </div>
          ))}
        </div>
      )}
      <p className="caption">
        {history
          ? "Publisher bands are preserved; they are not exact ranks."
          : "QS does not state the reporting year for these profile figures. They are separate from other publishers’ student counts."}{" "}
        Checked {p.checked_at}.
      </p>
      <a
        className="text-link"
        href={p.source_url}
        target="_blank"
        rel="noreferrer"
      >
        Open QS profile, courses & details ↗
      </a>
    </section>
  );
}
