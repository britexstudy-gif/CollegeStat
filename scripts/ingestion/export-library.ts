/** Portable local data bundle. Does not connect to or modify a database. */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { globalCatalogue } from "../../server/global-catalogue";
const out = path.resolve("data/exports/library-2026-09-28");
mkdirSync(out, { recursive: true });
const files: { file: string; records: number; sha256: string }[] = [];
function save(name: string, rows: unknown[]) {
  const body = rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
  writeFileSync(path.join(out, name), body);
  files.push({
    file: name,
    records: rows.length,
    sha256: createHash("sha256").update(body).digest("hex"),
  });
}
save("universities.ndjson", globalCatalogue);
save(
  "rankings.ndjson",
  JSON.parse(readFileSync("data/published/ranking-all.json", "utf8")),
);
save(
  "programs.ndjson",
  globalCatalogue.flatMap((u) =>
    (u.reported_programs || []).map((p) => ({
      university_id: u.id,
      ...p,
      source_url: "https://nces.ed.gov/ipeds/complete-data-files/C2025_A.zip",
      period: "July 2024–June 2025",
    })),
  ),
);
save(
  "papers.ndjson",
  globalCatalogue.flatMap((u) =>
    (u.research_identity?.papers || []).map((p) => ({
      university_id: u.id,
      ...p,
      institution_source: u.research_identity!.openalex_id,
      retrieved_at: u.research_identity!.retrieved_at,
    })),
  ),
);
save(
  "guidance.ndjson",
  JSON.parse(readFileSync("data/published/current-guidance.json", "utf8")),
);
save(
  "media.ndjson",
  globalCatalogue.flatMap((u) =>
    u.media.map((m) => ({ ...m, university_id: u.id })),
  ),
);
save(
  "institution-thumbnails.ndjson",
  Object.entries(
    JSON.parse(
      readFileSync("data/published/institution-image-cache.json", "utf8"),
    ),
  ).map(([id, record]) => ({ university_id: id, ...(record as object) })),
);
writeFileSync(
  path.join(out, "manifest.json"),
  JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      format: "UTF-8 NDJSON; one JSON object per line",
      identity_key: "university_id / universities.id",
      files,
      notes: [
        "Programs are historical completion evidence, not current admissions openings.",
        "Rankings contain unmatched publisher rows with null university_id. Do not join by approximate names.",
        "OpenAlex paper coverage is partial; rate-limited requests were stopped. Zero local papers is not zero research output.",
        "National/regional ARWU positions are publisher-provided. QS/THE country positions are derived within their global tables, retaining rank bands.",
        "Images retain their source and licensing metadata. Public local assets are under public/images/.",
        "Current guidance is checked as of 2026-09-28. Future dates are announced entry-cycle deadlines, not future news.",
      ],
    },
    null,
    2,
  ) + "\n",
);
writeFileSync(
  path.join(out, "README.md"),
  "# CollegeStat portable library\n\nImport universities by the stable `id` key. The full nested evidence can be stored as JSONB, or use the separate program, paper, ranking and media tables keyed by `university_id`. Keep source URLs, reporting periods, verification and attribution fields. Retain unmatched rankings until identities are reviewed. Copy `public/images/` into object storage and rewrite local image URLs only after upload. No database writes were performed.\n\nChecksums and row counts are in manifest.json. Raw source downloads remain in data/raw; published normalized snapshots are in data/published.\n",
);
console.log(JSON.stringify({ directory: out, files }, null, 2));
