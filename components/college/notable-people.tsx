import data from "@/data/published/notable-people.json";
import type { University } from "@/lib/domain";
export function NotablePeople({ university: u }: { university: University }) {
  let host = "";
  try { host = new URL(u.website || "").hostname.replace(/^www\./, ""); } catch {}
  const rows = data.filter(r => host === r.domain || host.endsWith("." + r.domain));
  return <section className="profile-library"><span className="section-caption">People & possibilities</span><h2>Founders, inventors & influential minds.</h2>
    <p>Explore the people connected to this university. Study, graduation, and faculty appointments are shown as different relationships.</p>
    {rows.length ? <div className="people-grid">{rows.map(p => <article key={p.name}><span className="section-caption">{p.category}</span><h3>{p.name}</h3><strong>{p.relationship}</strong><p>{p.description}</p><a className="text-link" href={p.source_url} target="_blank" rel="noreferrer">University source ↗</a><p className="caption">Checked {p.checked_at}</p></article>)}</div> : <p>No biographical records have been verified for this profile yet. {u.website && <a className="text-link" href={u.official_web?.links.alumni?.url || u.website} target="_blank" rel="noreferrer">Explore the university’s alumni and faculty directories ↗</a>}</p>}
  </section>;
}
