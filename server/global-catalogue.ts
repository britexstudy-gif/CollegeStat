import type { DirectoryRecord as DirectoryRow } from "@/lib/dataset-records";
import { officialLogo } from "@/lib/official-logos";
import applicationDates from "@/data/published/application-dates-current.json";
import applicationFees from "@/data/published/application-fees-current.json";
import currentRequirements from "@/data/published/requirements-current.json";
import segmentApplicationDates from "@/data/published/application-dates-segment-nov14.json";
import segmentApplicationFees from "@/data/published/application-fees-segment-nov14.json";
import segmentRequirements from "@/data/published/requirements-segment-nov14.json";
import { dedupeBy, dedupeRequirements } from "@/lib/requirements-merge";
import publishedRanks from "@/data/published/ranking-records.json";
import type { RankHighlight, Publisher } from "@/lib/ranking-highlights";
import { scholarshipsForUniversity } from "./scholarship-catalogue";
import { regionForCountry } from "@/lib/regions";
import admissionsCurrentJSON from "@/data/published/admissions-current.json";
import applicationBriefsJSON from "@/data/published/application-briefs.json";
import officialWebJSON from "@/data/published/official-web-profiles.json";
import officialProgramsJSON from "@/data/published/official-programs.json";
import imageCacheJSON from "@/data/published/institution-image-cache.json";
import {
  reportedPrograms,
  researchLibrary,
  institutionResearchMetrics,
} from "./profile-library";
import publisherStudentsJSON from "@/data/published/publisher-students.json";
import directory from "@/data/published/global-directory.json";
import officialSocialsJSON from "@/data/published/official-socials.json";
import enrichmentJSON from "@/data/published/profile-enrichment.json";
import { referenceCatalogue } from "./catalogue";
import {
  normalizeUniversity,
  type ImportedRecord,
  type University,
  type Deadline,
  type Requirement,
} from "@/lib/domain";

const ranksByUniversity = new Map<string, RankHighlight[]>();
for (const row of publishedRanks) {
  if (!row.university_id) continue;
  const records = ranksByUniversity.get(row.university_id) || [];
  records.push({ ...row, domain: "", provider: row.provider as Publisher });
  ranksByUniversity.set(row.university_id, records);
}
const imageCache = imageCacheJSON as Record<
  string,
  { url: string; remote_url: string; source_url: string }
>;
const currentAdmissions = admissionsCurrentJSON as Record<
  string,
  NonNullable<University["admission_summary"]>
>;
const applicationBriefs = applicationBriefsJSON as Record<
  string,
  NonNullable<University["application_brief"]>
>;
const officialWeb = officialWebJSON as Record<
  string,
  NonNullable<University["official_web"]> & {
    icon_url: string | null;
    socials: { label: string; url: string; source_url: string }[];
  }
>;
const sourceURL = "https://github.com/Hipo/university-domains-list";
const ipedsURL =
  "https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx?rtid=7&year=2023";
const metrics = [
  "tuition_in_state",
  "tuition_out_of_state",
  "fees_out_of_state",
  "room_board_on_campus",
  "enrollment_12_month",
  "nonresident_enrollment_12_month",
  "acceptance_rate",
  "applicants",
  "admitted",
  "act_25",
  "act_75",
  "sat_reading_25",
  "sat_reading_75",
  "sat_math_25",
  "sat_math_75",
] as const;
const existing = new Map(referenceCatalogue.map((u) => [u.id, u]));
type Enrichment = {
  source_url: string;
  retrieved_at: string;
  email?: string;
  socials: { label: string; url: string; source_url: string }[];
  media: {
    kind: "campus" | "logo";
    url: string;
    source_url: string;
    creator: string;
    license: string;
    license_url: string;
    width: number;
    height: number;
    alt: string;
  }[];
};
const publisherStudents = publisherStudentsJSON as Record<
  string,
  NonNullable<University["publisher_students"]>
>;
const officialSocials = officialSocialsJSON as Record<
  string,
  {
    socials: { label: string; url: string }[];
    source_url: string;
    retrieved_at: string;
  }
>;
const enrichment = enrichmentJSON as unknown as Record<string, Enrichment>;
function normalize(row: DirectoryRow): University {
  const ref = existing.get(row.id);
  const website = ref?.website || row.website;
  let host = "";
  try {
    host = new URL(website).hostname.replace(/^www\./, "");
  } catch {}
  const admissionSnapshot = currentAdmissions[host];
  const web = officialWeb[row.id];
  const primaryAdmissions = admissionSnapshot
    ? [
        {
          id: row.id + ":admissions:" + admissionSnapshot.year,
          university_id: row.id,
          program_id: null,
          acceptance_rate:
            Number.isFinite(admissionSnapshot.applicants) &&
            admissionSnapshot.applicants > 0 &&
            Number.isFinite(admissionSnapshot.admitted)
              ? (100 * admissionSnapshot.admitted) / admissionSnapshot.applicants
              : null,
          sat_min: null,
          sat_max: null,
          ielts_min: null,
          toefl_min: null,
          requirements: null,
          language: null,
          deadline: null,
          application_fee: null,
          year: admissionSnapshot.year,
          source_id: "official-admissions-" + host,
          verification_status: "verified" as const,
          verified_at: admissionSnapshot.checked_at,
          notes:
            admissionSnapshot.cohort +
            ". Admission rate calculated as admitted / applicants × 100.",
          source_url: admissionSnapshot.source_url,
          data_sources: {
            id: "official-admissions-" + host,
            name: row.name + " admissions report",
            organization: row.name,
            url: admissionSnapshot.source_url,
            source_type: "official_university",
            license_notes: null,
            retrieved_at: admissionSnapshot.checked_at,
          },
        },
      ]
    : [];
  const courses =
    (
      officialProgramsJSON as Record<
        string,
        {
          id: string;
          name: string;
          level: string;
          url: string;
          checked_at: string;
          language?: string;
          subject?: string;
          source_url?: string;
          source_id?: string;
          university_program_id?: string;
          reporting_year?: number | null;
          availability?: string;
          evidence?: Requirement["evidence"];
          notes?: string;
        }[]
      >
    )[host] || [];

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
  const imported: ImportedRecord[] = metrics.flatMap((metric) =>
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
              : metric.includes("tuition") ||
                  metric.includes("fees") ||
                  metric.includes("room_board")
                ? "2023–2024 academic year"
                : "Fall 2023",
            cohort: metric.includes("enrollment")
              ? "All levels · 12-month unduplicated headcount"
              : metric.includes("tuition") ||
                  metric.includes("fees") ||
                  metric.includes("room_board")
                ? "Full-time undergraduate · residency as labeled"
                : "First-time degree/certificate-seeking undergraduates",
            retrieved_at: "2026-09-26",
            last_verified_at: "2026-09-26",
            license_note: "US government public data",
            metric,
            value: row[metric]!,
            unit:
              metric.includes("tuition") ||
              metric.includes("fees") ||
              metric.includes("room_board")
                ? "USD"
                : metric === "acceptance_rate"
                  ? "%"
                  : metric.startsWith("act_") || metric.startsWith("sat_")
                    ? "score"
                    : "students",
            notes: metric.includes("out_of_state")
              ? "Out-of-state rate; not a verified international student price."
              : null,
            verification_status: "verified",
            publication_status: "published",
          },
        ],
  );
  const source = {
    id: "871c4db1-f387-4f88-9253-df06153e0b91",
    name: "IPEDS NCES · 2023",
    organization: "US Department of Education",
    url: ipedsURL,
    source_type: "government",
    license_notes: "US government public data",
    retrieved_at: "2026-09-26",
  };
  const newerRecords: ImportedRecord[] = (row.current_observations || []).map(
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
  const sourced = {
    year: 2023,
    source_id: source.id,
    data_sources: source,
    verification_status: "verified" as const,
    verified_at: "2026-09-26",
    notes:
      "Reported IPEDS 2023 observation. Student populations and residency categories are retained.",
  };
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
  return normalizeUniversity({
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
    reference_url: row.identity_source || sourceURL,
    reference_retrieved_at: row.identity_retrieved_at || "2026-09-26",
    admissions_url: row.admissions_url?.startsWith("http")
      ? row.admissions_url
      : web?.links.admissions?.url || null,
    ...ref,
    university_type: row.university_type || ref?.university_type || null,
    institution_image_url:
      imageCache[row.id]?.url || researchLibrary[row.id]?.logo_url || null,
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
    media: [
      ...(ref?.media || []),
      ...extraMedia.filter((m) => !ref?.media.some((r) => r.kind === m.kind)),
    ],
    contact_email: extra?.email || null,
    contact_source_url: extra?.source_url || null,
    social_links:
      officialSocials[row.id]?.socials.map((link) => ({
        ...link,
        source_url: officialSocials[row.id].source_url,
      })) ||
      web?.socials ||
      extra?.socials ||
      [],
    admission_summary: admissionSnapshot || null,
    application_brief: applicationBriefs[host] || null,
    official_web: web || null,
    website_icon_url: web?.icon_url || null,
    publisher_students: publisherStudents[row.id] || null,
    reported_programs: reportedPrograms(row.id),
    rankings: ranksByUniversity.get(row.id) || [],
    research_identity: researchLibrary[row.id] || null,
    research_metrics: institutionResearchMetrics(row.id),
    social_source_url:
      officialSocials[row.id]?.source_url || extra?.source_url || null,
    application_url: row.application_url || null,
    financial_aid_url:
      row.financial_aid_url || web?.links.scholarships?.url || null,
    net_price_url: row.net_price_url || null,
    address: row.address || null,
    phone: row.phone || null,
    identity_release: row.identity_release || null,
    university_programs: courses.length
      ? courses.map((c) => ({
          id: c.university_program_id,
          university_program_id: c.university_program_id,
          source_url: /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(c.id)
            ? c.source_url || c.url
            : c.url,
          source_id: c.source_id || "official-course-" + host,
          verified_at: c.checked_at,
          verification_status: "verified" as const,
          year: c.reporting_year === undefined ? 2026 : c.reporting_year,
          reporting_year: c.reporting_year,
          availability: c.availability,
          evidence: c.evidence,
          notes: c.notes,
          programs: {
            id: /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(c.id)
              ? c.id
              : host + ":" + c.id,
            name: c.name,
            subject: c.subject || c.name,
            degree_level: c.level,
            language: c.language || null,
          },
        }))
      : ref?.university_programs || [],
    costs: [
      ...(ref?.costs || []),
      ...costs,
      ...(applicationFees as University["costs"]).filter(
        (fee) => fee.university_id === row.id,
      ),
      ...dedupeBy(
        (applicationFees as University["costs"]).filter((fee) => fee.university_id === row.id),
        (segmentApplicationFees as University["costs"]).filter((fee) => fee.university_id === row.id),
        (fee) => String(fee.category),
      ),
    ],
    requirements: [
      ...new Map(
        [
          ...(ref?.requirements || []),
          ...(currentRequirements as Requirement[]).filter(
            (r) => r.university_id === row.id,
          ),
          // 14 Nov segment research: only test kinds the university does not already have.
          ...dedupeRequirements(
            [
              ...(ref?.requirements || []),
              ...(currentRequirements as Requirement[]).filter(
                (r) => r.university_id === row.id,
              ),
            ],
            (segmentRequirements as Requirement[]).filter(
              (r) => r.university_id === row.id,
            ),
          ),
        ].map((r) => [r.id, r]),
      ).values(),
    ],
    deadlines: [
      ...(ref?.deadlines || []),
      ...(applicationDates as Deadline[]).filter(
        (d) => d.university_id === row.id,
      ),
      ...dedupeBy(
        (applicationDates as Deadline[]).filter((d) => d.university_id === row.id),
        (segmentApplicationDates as Deadline[]).filter((d) => d.university_id === row.id),
        (d) => d.due_at.slice(0, 10),
      ),
    ],
    university_scholarships: [
      ...(ref?.university_scholarships || []),
      ...scholarshipsForUniversity(row.id).map((scholarships) => ({
        scholarships,
      })),
    ],
    admissions: [
      ...primaryAdmissions,
      ...(ref?.admissions || []).filter(
        (a) => !admissionSnapshot || a.year !== admissionSnapshot.year,
      ),
      ...admissions.filter(
        (r) => !ref?.admissions.some((a) => a.year === r.year),
      ),
    ],
    identifiers: {
      ...row.external_ids,
      ...ref?.identifiers,
      ...(row.ror ? { ror: row.ror } : {}),
      ...(row.unitid ? { ipeds: row.unitid } : {}),
    },
    aliases: [
      ...new Set([
        ...(ref?.aliases || []),
        ...(row.aliases || []),
        ...row.domains,
      ]),
    ],
    imported_records: [
      ...(ref?.imported_records || []),
      ...imported,
      ...newerRecords,
    ],
  });
}
export const globalCatalogue: University[] = (directory as DirectoryRow[]).map(
  normalize,
);
for (const u of referenceCatalogue)
  if (!globalCatalogue.some((r) => r.id === u.id))
    globalCatalogue.push(
      normalize({
        id: u.id,
        slug: u.slug,
        name: u.name,
        country_code: u.country_code,
        country: u.country_code,
        website: u.website || "",
        domains: [],
      }),
    );
export const featuredCatalogue = referenceCatalogue
  .map((u) => globalCatalogue.find((r) => r.id === u.id)!)
  .concat(
    globalCatalogue
      .filter((u) =>
        [
          "harvard.edu",
          "cam.ac.uk",
          "imperial.ac.uk",
          "caltech.edu",
          "ethz.ch",
          "nus.edu",
        ].some(
          (d) =>
            u.website &&
            new URL(u.website).hostname.replace(/^www\./, "") === d,
        ),
      )
      .slice(0, 6),
  );
