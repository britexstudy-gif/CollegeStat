import type { University } from "@/lib/domain";
import { applicationLinks } from "@/lib/application-routes";
export function AcademicNextSteps({
  university: u,
}: {
  university: University;
}) {
  const url = u.official_web?.links.programs?.url || u.website;
  return (
    <section className="profile-section-guide">
      <span className="section-caption">CHOOSE YOUR PROGRAM</span>
      <h2>Turn a subject into a degree plan.</h2>
      <p>
        Check these details for the specific programme and entry year at{" "}
        {u.short_name || u.name}.
      </p>
      <div className="section-step-grid">
        {[
          [
            "Curriculum",
            "Read the required modules, specialisations, placement opportunities, and assessment methods.",
          ],
          [
            "Entry route",
            "Check your qualification, degree level, teaching language, and any portfolio or entrance assessment.",
          ],
          [
            "Time & cost",
            "Confirm duration, attendance mode, tuition category, and the campus where the course is taught.",
          ],
        ].map(([title, body], i) => (
          <article key={title}>
            <span>0{i + 1}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
      {url && (
        <a className="text-link" href={url} target="_blank" rel="noreferrer">
          {u.official_web?.links.programs
            ? "Open the program directory"
            : "Explore programs on the official website"}{" "}
          ↗
        </a>
      )}
    </section>
  );
}
export function ProfileSourceLinks({
  university: u,
}: {
  university: University;
}) {
  const links = applicationLinks(u);
  return (
    <section className="profile-section-guide">
      <h3>Official links for this profile</h3>
      <p>
        {u.official_web
          ? `University website checked ${u.official_web.checked_at}. A link confirms where to research; it does not verify every requirement on that page.`
          : "Use the university’s own pages to confirm the details for your course and intake."}
      </p>
      <div className="application-link-grid">
        {links.map((l) => (
          <a href={l.url} key={l.name} target="_blank" rel="noreferrer">
            {l.name} ↗
          </a>
        ))}
      </div>
    </section>
  );
}

export function CampusNextSteps({ university: u }: { university: University }) {
  return (
    <section className="profile-section-guide">
      <span className="section-caption">LIFE AROUND YOUR DEGREE</span>
      <h2>Picture an ordinary week here.</h2>
      <p>
        Use these questions when comparing the campus in{" "}
        {u.city || "your chosen location"}. Answers may differ between campuses
        and programmes.
      </p>
      <div className="section-step-grid">
        {[
          [
            "Getting there",
            "Confirm your teaching campus, typical commute, accessible transport, and the nearest student services.",
          ],
          [
            "Where to live",
            "Check university accommodation eligibility, application dates, deposits, and the total cost of local housing.",
          ],
          [
            "Life & support",
            "Look for clubs, wellbeing services, disability support, careers advice, and an international student contact.",
          ],
        ].map(([title, body], i) => (
          <article key={title}>
            <span>0{i + 1}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
      {u.website && (
        <a
          className="text-link"
          href={u.website}
          target="_blank"
          rel="noreferrer"
        >
          Find campus visits & student services on the official website ↗
        </a>
      )}
    </section>
  );
}
