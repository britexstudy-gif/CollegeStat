import { ArrowUpRight, Database } from "lucide-react";
import { datasets } from "@/lib/datasets";
export function DatasetRegister() {
  return (
    <section className="dataset-register">
      <div className="eyebrow">OPEN DATA FOUNDATIONS</div>
      <h2>Traceable data. A growing picture.</h2>
      <p>
        These datasets support the import pipeline. Coverage shown in the
        explorer reflects published records, not the size of an external
        dataset.
      </p>
      {datasets.map((d) => (
        <article key={d.id}>
          <Database size={20} />
          <div>
            <div className="dataset-heading">
              <h3>{d.name}</h3>
              <span>{d.scope}</span>
            </div>
            <p>{d.fields}</p>
            <p className="caption">
              {d.access} · {d.integration}
            </p>
            <p className="caption">{d.caveat}</p>
            <div className="control-row">
              <a
                href={d.url}
                target="_blank"
                rel="noreferrer"
                className="text-link"
              >
                Documentation <ArrowUpRight size={12} />
              </a>
              <a
                href={d.download}
                target="_blank"
                rel="noreferrer"
                className="text-link"
              >
                Get the dataset <ArrowUpRight size={12} />
              </a>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
