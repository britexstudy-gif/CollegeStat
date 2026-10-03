import type { University } from "@/lib/domain";
import { EvidenceBars } from "./evidence-bars";
export function PublisherStudents({ university }: { university: University }) {
  const s = university.publisher_students;
  if (!s) return null;
  return (
    <section className="publisher-students">
      <h2>The student community</h2>
      <p className="caption">
        As reported in THE {s.edition} edition. The source does not specify a
        census year for these figures.
      </p>
      <dl className="student-snapshot-facts">
        {s.students != null && (
          <div>
            <dt>Students</dt>
            <dd>{s.students.toLocaleString()}</dd>
          </div>
        )}
        {s.student_staff_ratio != null && (
          <div>
            <dt>Students per staff member</dt>
            <dd>{s.student_staff_ratio}:1</dd>
          </div>
        )}
        {s.female_male_ratio && (
          <div>
            <dt>Female : male ratio · publisher categories</dt>
            <dd>{s.female_male_ratio}</dd>
          </div>
        )}
      </dl>
      {s.international_percent != null && (
        <EvidenceBars
          label="International student share · THE publisher snapshot"
          max={100}
          unit="%"
          rows={[
            { label: "International students", value: s.international_percent },
          ]}
        />
      )}
      <a
        className="text-link"
        href={s.source_url}
        target="_blank"
        rel="noreferrer"
      >
        THE university profile & definitions ↗
      </a>
    </section>
  );
}
