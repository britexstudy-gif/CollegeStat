export function EvidenceBars({
  rows,
  max,
  unit = "",
  label,
}: {
  rows: {
    label: string;
    value: number | null;
    detail?: string;
    url?: string;
  }[];
  max?: number;
  unit?: string;
  label: string;
}) {
  const limit = max || Math.max(1, ...rows.map((r) => r.value || 0));
  return (
    <figure className="evidence-bars" aria-label={label}>
      <figcaption>{label}</figcaption>
      {rows.map((r, i) => (
        <div className="evidence-bar-row" key={r.label + i}>
          <div>
            {r.url ? <a href={r.url}>{r.label}</a> : <span>{r.label}</span>}
            <strong>
              {r.value == null
                ? "Not reported"
                : r.value.toLocaleString(undefined, {
                    maximumFractionDigits: 1,
                  }) + unit}
            </strong>
          </div>
          <div className="evidence-bar-track" aria-hidden="true">
            {r.value != null && (
              <i
                style={{
                  width:
                    Math.max(0, Math.min(100, (r.value / limit) * 100)) + "%",
                }}
              />
            )}
          </div>
          {r.detail && <small>{r.detail}</small>}
        </div>
      ))}
    </figure>
  );
}
