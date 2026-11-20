import referenceJSON from "@/supabase/reference-catalogue.json";
import directoryJSON from "@/data/published/global-directory.json";
import rankingJSON from "@/data/published/ranking-records.json";
import imageJSON from "@/data/published/institution-image-cache.json";
import enrichmentJSON from "@/data/published/profile-enrichment.json";
import officialWebJSON from "@/data/published/official-web-profiles.json";
import publisherStudentsJSON from "@/data/published/publisher-students.json";
import admissionsJSON from "@/data/published/admissions-current.json";
import feesJSON from "@/data/published/application-fees-current.json";
import {
  currentScholarships,
  scholarshipsForUniversity,
} from "./scholarship-catalogue";
import { discoveryPreview } from "./discovery-preview";
import { officialLogo } from "@/lib/official-logos";
import { regionForCountry } from "@/lib/regions";
import {
  normalizeUniversity,
  type University,
  type ImportedRecord,
} from "@/lib/domain";
import type {
  DirectoryRecord,
  PublishedRankingRecord,
} from "@/lib/dataset-records";

// Root-layout discovery needs twelve cards, not 14k expanded programme/research
// profiles. These are projections of the same installed receipts; full details
// remain owned by global-catalogue and the existing profile/compare loaders.
const references = (referenceJSON as unknown as University[]).map(
  normalizeUniversity,
);
const rows = directoryJSON as unknown as DirectoryRecord[];
const referenceIDs = new Set(references.map((u) => u.id));
const extraHosts = new Set([
  "harvard.edu",
  "cam.ac.uk",
  "imperial.ac.uk",
  "caltech.edu",
  "ethz.ch",
  "nus.edu.sg",
]);
const hostname = (website: string | null | undefined) => {
  if (!website) return "";
  try {
    return new URL(website).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};
const byID = new Map(
  rows.filter((r) => referenceIDs.has(r.id)).map((r) => [r.id, r]),
);
const extras = rows
  .filter((r) => !referenceIDs.has(r.id) && extraHosts.has(hostname(r.website)))
  .slice(0, 6);
const selected = [
  ...references.map((ref) => ({
    ref,
    row: byID.get(ref.id) || {
      id: ref.id,
      slug: ref.slug,
      name: ref.name,
      country_code: ref.country_code,
      country: ref.country_code,
      website: ref.website || "",
      domains: [],
    },
  })),
  ...extras.map((row) => ({ row, ref: undefined })),
];
const selectedIDs = new Set(selected.map(({ row }) => row.id));
const ranks = new Map<string, University["rankings"]>();
for (const rank of rankingJSON as unknown as PublishedRankingRecord[]) {
  if (!rank.university_id || !selectedIDs.has(rank.university_id)) continue;
  const group = ranks.get(rank.university_id) || [];
  group.push({ ...rank, domain: "" });
  ranks.set(rank.university_id, group);
}
const images = imageJSON as Record<string, { url: string }>;
const enrichment = enrichmentJSON as unknown as Record<
  string,
  {
    retrieved_at: string;
    media: (Omit<
      University["media"][number],
      | "id"
      | "university_id"
      | "professor_id"
      | "source_id"
      | "verification_status"
      | "verified_at"
      | "data_sources"
    > & { source_url: string })[];
  }
>;
const web = officialWebJSON as Record<string, { icon_url: string | null }>;
const students = publisherStudentsJSON as Record<
  string,
  University["publisher_students"]
>;
const currentAdmissions = admissionsJSON as Record<
  string,
  NonNullable<University["admission_summary"]>
>;
const ipedsURL =
  "https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx?rtid=7&year=2023";
const ipedsSource = {
  id: "871c4db1-f387-4f88-9253-df06153e0b91",
  name: "IPEDS NCES · 2023",
  organization: "US Department of Education",
  url: ipedsURL,
  source_type: "government",
  license_notes: "US government public data",
  retrieved_at: "2026-09-26",
};
const sourced = {
  year: 2023,
  source_id: ipedsSource.id,
  data_sources: ipedsSource,
  verification_status: "verified" as const,
  verified_at: "2026-09-26",
  notes:
    "Reported IPEDS 2023 observation. Student populations and residency categories are retained.",
};
const cardMetrics = [
  "tuition_in_state",
  "tuition_out_of_state",
  "fees_out_of_state",
  "enrollment_12_month",
  "acceptance_rate",
] as const;

function card(row: DirectoryRecord, ref?: University): University {
  const website = ref?.website || row.website;
  const host = hostname(website);
  const snapshot = currentAdmissions[host];
  const extra = enrichment[row.id];
  const extraMedia = (extra?.media || []).map((m, i) => ({
    ...m,
    id: `${row.id}:commons:${i}`,
    university_id: row.id,
    professor_id: null,
    year: null,
    source_id: "commons",
    verified_at: extra.retrieved_at,
    verification_status: "verified" as const,
    reuse_permitted: true,
    notes:
      "Institutional media identified via linked Wikidata/Commons. Image capture date is not the retrieval date.",
    data_sources: {
      id: "commons",
      name: "Wikimedia Commons",
      organization: "Wikimedia",
      url: m.source_url,
      source_type: "media",
      license_notes: m.license,
      retrieved_at: extra.retrieved_at,
    },
  }));
  const imported: ImportedRecord[] = cardMetrics.flatMap((metric) =>
    row[metric] == null
      ? []
      : [
          {
            id: `${row.id}:${metric}`,
            university_id: row.id,
            source: "ipeds",
            source_name: "IPEDS NCES",
            source_record_id: row.unitid!,
            source_url: ipedsURL,
            release: "2023 annual survey",
            reporting_year: 2023,
            period: metric.includes("enrollment")
              ? "July 2022–June 2023"
              : metric.includes("tuition") || metric.includes("fees")
                ? "2023–2024 academic year"
                : "Fall 2023",
            cohort: metric.includes("enrollment")
              ? "All levels · 12-month unduplicated headcount"
              : metric.includes("tuition") || metric.includes("fees")
                ? "Full-time undergraduate · residency as labeled"
                : "First-time degree/certificate-seeking undergraduates",
            retrieved_at: "2026-09-26",
            last_verified_at: "2026-09-26",
            license_note: "US government public data",
            metric,
            value: row[metric]!,
            unit:
              metric.includes("tuition") || metric.includes("fees")
                ? "USD"
                : metric === "acceptance_rate"
                  ? "%"
                  : "students",
            notes: metric.includes("out_of_state")
              ? "Out-of-state rate; not a verified international student price."
              : null,
            verification_status: "verified",
            publication_status: "published",
          },
        ],
  );
  const current: ImportedRecord[] = (row.current_observations || []).map(
    (r) => ({
      id: `${row.id}:${r.table}:${r.metric}`,
      source: "ipeds",
      source_name: "IPEDS NCES",
      source_record_id: row.unitid!,
      source_url: `https://nces.ed.gov/ipeds/complete-data-files/${r.table}.zip`,
      release: r.table,
      reporting_year: r.year,
      period: r.period,
      cohort: r.cohort,
      retrieved_at:
        r.table === "COST1_2024"
          ? "2026-09-28"
          : row.identity_retrieved_at || null,
      last_verified_at:
        r.table === "COST1_2024"
          ? "2026-09-28"
          : row.identity_retrieved_at || null,
      license_note: "US government public data",
      metric: r.metric,
      value: r.value,
      unit: r.unit,
      notes:
        "Reported observations only. Admission rates are admitted / applicants × 100; score percentiles are not minimum requirements.",
      verification_status: "verified",
      publication_status: "published",
    }),
  );
  const costs = (
    [
      "tuition_in_state",
      "tuition_out_of_state",
      "fees_out_of_state",
      "room_board_on_campus",
    ] as const
  ).flatMap((key) =>
    row[key] == null
      ? []
      : [
          {
            ...sourced,
            id: `${row.id}:${key}`,
            university_id: row.id,
            category: key.startsWith("tuition")
              ? "tuition"
              : key.startsWith("fees")
                ? "mandatory_fees"
                : "room_board",
            amount: row[key]!,
            currency: "USD",
            period: "year",
            student_category:
              key === "tuition_in_state"
                ? "in_state"
                : key === "room_board_on_campus"
                  ? "on_campus"
                  : "out_of_state",
            program_id: null,
          },
        ],
  );
  const admissions =
    row.acceptance_rate == null
      ? []
      : [
          {
            ...sourced,
            id: `${row.id}:admission-2023`,
            university_id: row.id,
            program_id: null,
            acceptance_rate: row.acceptance_rate,
            sat_min: null,
            sat_max: null,
            act_min: row.act_25 ?? null,
            act_max: row.act_75 ?? null,
            ielts_min: null,
            toefl_min: null,
            requirements: null,
            language: null,
            deadline: null,
            application_fee: null,
            notes:
              "Fall 2023 admission rate = admitted / applicants × 100. ACT ranges are 25th–75th percentiles of enrolled submitters. SAT sections are retained separately in Open data; no synthetic composite is calculated.",
          },
        ];
  const primaryAdmissions = snapshot
    ? [
        {
          id: row.id + ":admissions:" + snapshot.year,
          university_id: row.id,
          program_id: null,
          acceptance_rate:
            Number.isFinite(snapshot.applicants) &&
            snapshot.applicants > 0 &&
            Number.isFinite(snapshot.admitted)
              ? (100 * snapshot.admitted) / snapshot.applicants
              : null,
          sat_min: null,
          sat_max: null,
          ielts_min: null,
          toefl_min: null,
          requirements: null,
          language: null,
          deadline: null,
          application_fee: null,
          year: snapshot.year,
          source_id: "official-admissions-" + host,
          verification_status: "verified" as const,
          verified_at: snapshot.checked_at,
          notes:
            snapshot.cohort +
            ". Admission rate calculated as admitted / applicants × 100.",
          source_url: snapshot.source_url,
          data_sources: {
            id: "official-admissions-" + host,
            name: row.name + " admissions report",
            organization: row.name,
            url: snapshot.source_url,
            source_type: "official_university",
            license_notes: null,
            retrieved_at: snapshot.checked_at,
          },
        },
      ]
    : [];
  return discoveryPreview(
    normalizeUniversity({
      id: row.id,
      slug: row.slug,
      name: row.name,
      short_name: null,
      country_code: row.country_code,
      city: row.city || null,
      region: regionForCountry(row.country_code),
      website: row.website,
      founded_year: row.founded_year || null,
      description: `${row.name}${row.city ? ` in ${row.city}` : ""}, ${row.country}.${row.founded_year ? ` Established in ${row.founded_year}.` : ""} Explore its admissions, published research and official application resources.`,
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
      published: true,
      reference_url:
        row.identity_source ||
        "https://github.com/Hipo/university-domains-list",
      reference_retrieved_at: row.identity_retrieved_at || "2026-09-26",
      ...ref,
      university_type: row.university_type || ref?.university_type || null,
      logo_url:
        officialLogo(website)?.local ||
        ref?.logo_url ||
        extraMedia.find((m) => m.kind === "logo")?.url ||
        null,
      logo_source_url:
        officialLogo(website)?.source ||
        ref?.logo_source_url ||
        extraMedia.find((m) => m.kind === "logo")?.source_url ||
        null,
      website_icon_url: web[row.id]?.icon_url || null,
      institution_image_url: images[row.id]?.url || null,
      media: [
        ...(ref?.media || []),
        ...extraMedia.filter((m) => !ref?.media.some((r) => r.kind === m.kind)),
      ],
      publisher_students: students[row.id] || null,
      admission_summary: snapshot || null,
      rankings: ranks.get(row.id) || [],
      aliases: [...new Set([...(row.aliases || []), ...row.domains])],
      costs: [
        ...(ref?.costs || []),
        ...costs,
        ...(feesJSON as University["costs"]).filter(
          (fee) => fee.university_id === row.id,
        ),
      ],
      admissions: [
        ...primaryAdmissions,
        ...(ref?.admissions || []).filter(
          (a) => !snapshot || a.year !== snapshot.year,
        ),
        ...admissions.filter(
          (r) => !ref?.admissions.some((a) => a.year === r.year),
        ),
      ],
      imported_records: [...imported, ...current],
      university_scholarships: [
        ...(ref?.university_scholarships || []),
        ...scholarshipsForUniversity(row.id).map((scholarships) => ({
          scholarships,
        })),
      ],
    }),
  );
}

export const featuredCatalogue: University[] = selected.map(({ row, ref }) =>
  card(row, ref),
);
export const referenceScholarships = [
  ...currentScholarships,
  ...references.flatMap((u) =>
    u.university_scholarships.flatMap((link) =>
      link.scholarships ? [link.scholarships] : [],
    ),
  ),
];
