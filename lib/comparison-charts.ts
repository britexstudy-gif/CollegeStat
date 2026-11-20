import type { Cost, Sourced, University } from "./domain";
import { valueOf, type MetricKey } from "./research";
import {
  rankLabel,
  universityRanks,
  type Publisher,
} from "./ranking-highlights";

const shortDisplayName = (u: Pick<University, "name" | "short_name">) =>
  u.short_name || u.name;

type RuntimeCounts = { applicants?: unknown; admitted?: unknown };

const finiteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const sourceOf = (record?: Sourced | null) => ({
  sourceUrl: record?.source_url || record?.data_sources?.url || undefined,
  sourceName: record?.data_sources?.name || undefined,
  checkedAt:
    record?.verified_at ||
    record?.evidence?.retrieved_at ||
    record?.data_sources?.retrieved_at ||
    undefined,
});

/** Preserve imported cohort and period metadata that the compact metric DTO omits. */
function comparisonValue(u: University, metric: MetricKey) {
  const selected = valueOf(u, metric);
  const imported = u.imported_records?.find(
    (row) => row.id === selected.record?.id,
  );
  if (!imported || !selected.record) return selected;
  return {
    ...selected,
    record: {
      ...selected.record,
      source_url: imported.source_url,
      evidence: {
        ...selected.record.evidence,
        population: imported.cohort || undefined,
        reporting_period: imported.period || undefined,
        retrieved_at: imported.retrieved_at || undefined,
      },
    },
  };
}

const verifiedValue = (value: number | null, record?: Sourced) =>
  record?.verification_status === "verified" && finiteNumber(value) != null
    ? value
    : null;

type SourceDetails = {
  sourceUrl?: string;
  sourceName?: string;
  checkedAt?: string;
};

const prettify = (value: string) => value.replaceAll("_", " ");

const usableCosts = (costs: Cost[]) =>
  costs.filter(
    (c) =>
      c.verification_status === "verified" &&
      c.source_id &&
      c.verified_at &&
      finiteNumber(c.amount) != null &&
      c.amount >= 0,
  );

/* ------------------------------------------------------------------ */
/* Tuition: only matching currency / population / period / year compare */
/* ------------------------------------------------------------------ */

export type TuitionRow = SourceDetails & {
  universityId: string;
  name: string;
  shortName: string;
  amount: number | null;
  currency: string;
  year: number | null;
  population?: string;
  period?: string;
  sourceUrl?: string;
  sourceName?: string;
  note?: string;
};

export type TuitionGroup = {
  id: string;
  kind: "cost-tuition" | "ipeds-out-of-state";
  label: string;
  detail: string;
  currency: string;
  year: number | null;
  reportedCount: number;
  comparable: boolean;
  rows: TuitionRow[];
};

/** Never convert: each group is one exact currency/population/period/year. */
export function tuitionGroups(universities: University[]): TuitionGroup[] {
  const groups = new Map<string, TuitionGroup>();
  const keyOf = (parts: (string | number | null)[]) => JSON.stringify(parts);

  for (const u of universities) {
    const tuitionCosts = usableCosts(u.costs || []).filter(
      (c): c is Cost =>
        c.category === "tuition" &&
        !c.program_id &&
        finiteNumber(c.amount) != null,
    );
    for (const c of tuitionCosts) {
      const key = keyOf([
        c.currency,
        c.student_category,
        c.period,
        c.year,
        c.evidence?.population || null,
        c.evidence?.scope || null,
      ]);
      let group = groups.get("cost|" + key);
      if (!group) {
        group = {
          id: "cost|" + key,
          kind: "cost-tuition",
          label: [
            `Tuition · ${prettify(c.student_category)} · ${c.currency} · per ${c.period} · ${c.year ?? "year not stated"}`,
            c.evidence?.population,
            c.evidence?.scope,
          ]
            .filter(Boolean)
            .join(" · "),
          detail:
            "Institution-wide published tuition only. Programme-specific figures are excluded and currencies are never converted.",
          currency: c.currency,
          year: c.year,
          reportedCount: 0,
          comparable: c.year != null && !!c.student_category && !!c.period,
          rows: [],
        };
        groups.set("cost|" + key, group);
      }
      const { sourceUrl, sourceName, checkedAt } = sourceOf(c);
      const previous = group.rows.find((row) => row.universityId === u.id);
      if (previous) {
        if (previous.amount !== c.amount) {
          previous.amount = null;
          previous.note =
            "Conflicting published figures for this scope; check the sources before comparing.";
        }
        continue;
      }
      group.rows.push({
        universityId: u.id,
        name: u.name,
        shortName: shortDisplayName(u),
        amount: c.amount,
        currency: c.currency,
        year: c.year,
        sourceUrl,
        sourceName,
        checkedAt,
        note: c.notes || undefined,
      });
    }
  }

  // IPEDS out-of-state tuition is a second coherent scope (US schools only):
  // full-time undergraduates, one academic year, USD. Kept as its own group.
  const ipedsRows: TuitionRow[] = [];
  for (const u of universities) {
    const v = comparisonValue(u, "tuition_out_of_state");
    if (
      v.value == null ||
      v.value < 0 ||
      verifiedValue(v.value, v.record) == null
    ) {
      ipedsRows.push({
        universityId: u.id,
        name: u.name,
        shortName: shortDisplayName(u),
        amount: null,
        currency: "USD",
        year: v.record?.year ?? null,
      });
      continue;
    }
    const record = v.record;
    const imported = u.imported_records?.find((row) => row.id === record?.id);
    if (
      u.country_code !== "US" ||
      !(
        /ipeds|nces/i.test(record?.data_sources?.name || "") ||
        imported?.source === "ipeds"
      )
    )
      continue;
    const currency = v.currency || "USD";
    const { sourceUrl, sourceName, checkedAt } = sourceOf(record);
    ipedsRows.push({
      universityId: u.id,
      name: u.name,
      shortName: shortDisplayName(u),
      amount: v.value,
      currency,
      year: record?.year ?? null,
      population: record?.evidence?.population || "Full-time undergraduate",
      period: record?.evidence?.reporting_period || "Academic year",
      sourceUrl,
      sourceName,
      checkedAt,
      note: record?.notes || undefined,
    });
  }
  // Split IPEDS rows by (currency, year) so mismatched years never merge.
  const ipedsByScope = new Map<string, TuitionRow[]>();
  for (const row of ipedsRows) {
    if (row.amount == null) continue;
    const key = keyOf([
      row.currency,
      row.year,
      row.population || null,
      row.period || null,
    ]);
    ipedsByScope.set(key, [...(ipedsByScope.get(key) || []), row]);
  }
  for (const [key, reported] of ipedsByScope) {
    const [currency, year, population, period] = JSON.parse(key) as [
      string,
      number | null,
      string,
      string,
    ];
    const rows = universities.map((u) => {
      const hit = reported.find((r) => r.universityId === u.id);
      return (
        hit || {
          universityId: u.id,
          name: u.name,
          shortName: shortDisplayName(u),
          amount: null,
          currency,
          year: null,
        }
      );
    });
    groups.set("ipeds|" + key, {
      id: "ipeds|" + key,
      kind: "ipeds-out-of-state",
      label: `Out-of-state tuition · IPEDS · ${currency} · ${year ?? "year not stated"} · ${population} · ${period}`,
      detail:
        "IPEDS full-time undergraduate out-of-state rate for the stated academic year. Not a verified international-student price.",
      currency,
      year,
      reportedCount: reported.length,
      comparable: year != null,
      rows,
    });
  }

  // Fill missing-university rows for cost groups and count coverage.
  for (const group of groups.values()) {
    if (group.kind !== "cost-tuition") continue;
    const present = new Set(group.rows.map((r) => r.universityId));
    for (const u of universities) {
      if (!present.has(u.id)) {
        group.rows.push({
          universityId: u.id,
          name: u.name,
          shortName: shortDisplayName(u),
          amount: null,
          currency: group.currency,
          year: null,
        });
      }
    }
    group.rows.sort(
      (a, b) =>
        universities.findIndex((u) => u.id === a.universityId) -
        universities.findIndex((u) => u.id === b.universityId),
    );
  }
  for (const group of groups.values()) {
    group.reportedCount = group.rows.filter((r) => r.amount != null).length;
  }
  return [...groups.values()].sort(
    (a, b) =>
      Number(b.comparable) - Number(a.comparable) ||
      b.reportedCount - a.reportedCount ||
      (b.year || 0) - (a.year || 0) ||
      a.label.localeCompare(b.label),
  );
}

/* -------------------------------------------------------- */
/* Admission: unknown is unknown, scope travels with the bar */
/* -------------------------------------------------------- */

export type AdmissionRow = SourceDetails & {
  universityId: string;
  name: string;
  shortName: string;
  rate: number | null;
  year: number | null;
  scope: string;
  applicants: number | null;
  admitted: number | null;
  sourceUrl?: string;
  sourceName?: string;
  note?: string;
};

export type AdmissionComparison = {
  rows: AdmissionRow[];
  reportedCount: number;
  yearsDiffer: boolean;
};

function admissionScope(record?: Sourced | null): string {
  const evidence = record?.evidence;
  const context = [
    typeof evidence?.population === "string" && evidence.population.trim()
      ? evidence.population.trim()
      : undefined,
    typeof evidence?.reporting_period === "string" &&
    evidence.reporting_period.trim()
      ? evidence.reporting_period.trim()
      : undefined,
    typeof evidence?.scope === "string" && evidence.scope.trim()
      ? evidence.scope.trim()
      : undefined,
  ].filter(Boolean);
  return [
    record?.year ? String(record.year) : "year not stated",
    ...context,
  ].join(" · ");
}

export function admissionComparison(
  universities: University[],
): AdmissionComparison {
  const rows = universities.map((u) => {
    const v = comparisonValue(u, "admission");
    const record = v.record;
    const counts = (record || {}) as RuntimeCounts;
    const { sourceUrl, sourceName, checkedAt } = sourceOf(record);
    const rate = verifiedValue(v.value, record);
    return {
      universityId: u.id,
      name: u.name,
      shortName: shortDisplayName(u),
      rate: rate != null && rate >= 0 && rate <= 100 ? rate : null,
      year: record?.year ?? null,
      scope: admissionScope(record),
      applicants: finiteNumber(counts.applicants),
      admitted: finiteNumber(counts.admitted),
      sourceUrl,
      sourceName,
      checkedAt,
      note: record?.notes || undefined,
    };
  });
  const years = new Set(
    rows.flatMap((r) => (r.rate != null && r.year != null ? [r.year] : [])),
  );
  return {
    rows,
    reportedCount: rows.filter((r) => r.rate != null).length,
    yearsDiffer: years.size > 1,
  };
}

/* --------------------------------------------- */
/* Enrollment: latest reported figures, by year  */
/* --------------------------------------------- */

export type EnrollmentRow = SourceDetails & {
  universityId: string;
  name: string;
  shortName: string;
  value: number | null;
  year: number | null;
  scope: string;
  sourceUrl?: string;
  sourceName?: string;
};

export function enrollmentComparison(universities: University[]): {
  rows: EnrollmentRow[];
  reportedCount: number;
  yearsDiffer: boolean;
} {
  const rows = universities.map((u) => {
    const v = comparisonValue(u, "enrollment");
    const { sourceUrl, sourceName, checkedAt } = sourceOf(v.record);
    const value = verifiedValue(v.value, v.record);
    return {
      universityId: u.id,
      name: u.name,
      shortName: shortDisplayName(u),
      value: value != null && value >= 0 ? value : null,
      year: v.record?.year ?? null,
      scope: admissionScope(v.record),
      sourceUrl,
      sourceName,
      checkedAt,
    };
  });
  const years = new Set(
    rows.flatMap((r) => (r.value != null && r.year != null ? [r.year] : [])),
  );
  return {
    rows,
    reportedCount: rows.filter((r) => r.value != null).length,
    yearsDiffer: years.size > 1,
  };
}

export type ScopedMetricRow = SourceDetails & {
  universityId: string;
  name: string;
  shortName: string;
  value: number | null;
  scope: string;
  note?: string;
};
export type ScopedMetricGroup = {
  id: string;
  label: string;
  year: number | null;
  comparable: boolean;
  reportedCount: number;
  rows: ScopedMetricRow[];
};

function metricObservations(u: University, metric: "admission" | "enrollment") {
  const local =
    metric === "admission"
      ? (u.admissions || [])
          .filter((row) => !row.program_id)
          .map((row) => ({
            value: row.acceptance_rate,
            record: row as Sourced,
          }))
      : (u.data_points || [])
          .filter((row) => row.metric === "enrollment")
          .map((row) => ({ value: row.value, record: row as Sourced }));
  const imported = (u.imported_records || [])
    .filter(
      (row) =>
        row.metric ===
          (metric === "admission"
            ? "acceptance_rate"
            : "enrollment_12_month") &&
        row.verification_status === "verified" &&
        row.publication_status === "published" &&
        typeof row.value === "number",
    )
    .map((row) => ({
      value: Number(row.value),
      record: {
        id: row.id,
        year: row.reporting_year,
        source_id: row.source,
        source_url: row.source_url,
        verification_status: "verified" as const,
        verified_at: row.last_verified_at,
        notes: row.notes,
        evidence: {
          population: row.cohort || undefined,
          reporting_period: row.period || undefined,
          retrieved_at: row.retrieved_at || undefined,
        },
        data_sources: {
          id: row.source,
          name: row.source_name,
          url: row.source_url,
          organization: null,
          source_type: "government",
          license_notes: row.license_note,
          retrieved_at: row.retrieved_at,
        },
      } satisfies Sourced,
    }));
  const selected = comparisonValue(u, metric);
  const all: { value: number | null; record: Sourced }[] = [
    ...local,
    ...imported,
  ];
  if (
    selected.record &&
    !all.some((row) => row.record.id === selected.record?.id)
  )
    all.push({ value: selected.value, record: selected.record });
  return all;
}

/** A shared scale requires an explicit population, period and reporting year. */
export function scopedMetricGroups(
  universities: University[],
  metric: "admission" | "enrollment",
): ScopedMetricGroup[] {
  const grouped = new Map<string, ScopedMetricGroup>();
  for (const u of universities) {
    for (const selected of metricObservations(u, metric)) {
      const value = verifiedValue(selected.value, selected.record);
      if (value == null || value < 0 || (metric === "admission" && value > 100))
        continue;
      const record = selected.record!;
      const population = record.evidence?.population?.trim();
      const period = record.evidence?.reporting_period?.trim();
      const scope = record.evidence?.scope?.trim();
      const program = "program_id" in record ? record.program_id : null;
      const comparable =
        record.year != null && !!population && !!period && !program;
      // An unspecified population is not silently treated as equivalent at another institution.
      const id = JSON.stringify([
        record.year,
        population || null,
        period || null,
        scope || null,
        program || null,
        comparable ? null : u.id,
      ]);
      let group = grouped.get(id);
      if (!group) {
        group = {
          id,
          label: admissionScope(record),
          year: record.year,
          comparable,
          reportedCount: 0,
          rows: [],
        };
        grouped.set(id, group);
      }
      const counts = record as RuntimeCounts;
      const applicants = finiteNumber(counts.applicants);
      const admitted = finiteNumber(counts.admitted);
      const prior = group.rows.find((row) => row.universityId === u.id);
      if (prior) {
        if (prior.value !== value) {
          prior.value = null;
          prior.note =
            "Conflicting verified observations for this scope. Review the detailed evidence before comparing.";
        }
        continue;
      }
      group.rows.push({
        universityId: u.id,
        name: u.name,
        shortName: shortDisplayName(u),
        value,
        scope: admissionScope(record),
        ...sourceOf(record),
        note:
          metric === "admission" && applicants != null && admitted != null
            ? `${admitted.toLocaleString("en-US")} admitted / ${applicants.toLocaleString("en-US")} applicants`
            : record.notes || undefined,
      });
    }
  }
  for (const group of grouped.values()) {
    group.reportedCount = group.rows.filter((row) => row.value != null).length;
    group.rows = universities.map(
      (u) =>
        group.rows.find((row) => row.universityId === u.id) || {
          universityId: u.id,
          name: u.name,
          shortName: shortDisplayName(u),
          value: null,
          scope: "Not reported for this scope",
        },
    );
  }
  return [...grouped.values()].sort(
    (a, b) =>
      Number(b.comparable) - Number(a.comparable) ||
      b.reportedCount - a.reportedCount ||
      (b.year || 0) - (a.year || 0) ||
      a.label.localeCompare(b.label),
  );
}

/* ------------------------------------------------------------------ */
/* Rankings: exact ordinal / tie / band labels, publishers kept apart. */
/* Leiden has no overall rank and is never synthesized here.           */
/* ------------------------------------------------------------------ */

export type RankRow = {
  universityId: string;
  name: string;
  shortName: string;
  rank: number | null;
  label: string;
  tied: boolean;
  band: boolean;
  bandLo: number | null;
  bandHi: number | null;
  year: number | null;
  url?: string;
};

export type RankingGroup = {
  id: string;
  provider: Publisher;
  providerName: string;
  year: number;
  label: string;
  detail: string;
  reportedCount: number;
  rows: RankRow[];
};

const PROVIDER_NAMES: Record<Publisher, string> = {
  qs: "QS",
  the: "THE",
  arwu: "ARWU",
};

/** Parse publisher band labels such as "501–600" or "801+". Ties ("=22") are not bands. */
export function parseBandLabel(
  label: string,
): { lo: number; hi: number | null } | null {
  const range = label.trim().match(/^#?(\d+)\s*[–-]\s*(\d+)$/);
  if (range && Number(range[1]) > 0 && Number(range[2]) >= Number(range[1]))
    return { lo: Number(range[1]), hi: Number(range[2]) };
  const open = label.trim().match(/^#?(\d+)\s*\+$/);
  if (open && Number(open[1]) > 0) return { lo: Number(open[1]), hi: null };
  return null;
}

export function rankingGroups(universities: University[]): RankingGroup[] {
  const groups = new Map<string, RankingGroup>();
  for (const u of universities) {
    for (const r of universityRanks(u)) {
      // universityRanks only yields qs/the/arwu world-overall positions.
      const id = `${r.provider}|${r.year}`;
      let group = groups.get(id);
      if (!group) {
        group = {
          id,
          provider: r.provider,
          providerName: PROVIDER_NAMES[r.provider],
          year: r.year,
          label: `${PROVIDER_NAMES[r.provider]} · world overall · ${r.year}`,
          detail:
            "Publisher world-overall edition. Ties keep “=”, bands keep their range; an absent rank is never guessed.",
          reportedCount: 0,
          rows: [],
        };
        groups.set(id, group);
      }
      const band = parseBandLabel(r.rank_label || "");
      group.rows.push({
        universityId: u.id,
        name: u.name,
        shortName: shortDisplayName(u),
        rank: r.band && !band ? null : (band?.lo ?? r.rank),
        label: rankLabel(r),
        tied: r.tied,
        band: r.band || band != null,
        bandLo: band?.lo ?? r.rank ?? null,
        bandHi: band?.hi ?? null,
        year: r.year,
        url: r.url,
      });
    }
  }
  for (const group of groups.values()) {
    const present = new Set(group.rows.map((r) => r.universityId));
    for (const u of universities) {
      if (!present.has(u.id)) {
        group.rows.push({
          universityId: u.id,
          name: u.name,
          shortName: shortDisplayName(u),
          rank: null,
          label: "Not reported",
          tied: false,
          band: false,
          bandLo: null,
          bandHi: null,
          year: null,
        });
      }
    }
    group.rows.sort((a, b) => {
      if (a.rank == null || b.rank == null)
        return a.rank == null && b.rank == null
          ? a.name.localeCompare(b.name)
          : a.rank == null
            ? 1
            : -1;
      return a.rank - b.rank || a.name.localeCompare(b.name);
    });
    group.reportedCount = group.rows.filter((r) => r.rank != null).length;
  }
  return [...groups.values()].sort(
    (a, b) =>
      b.reportedCount - a.reportedCount || a.label.localeCompare(b.label),
  );
}

/* ------------------------------------------------------------------ */
/* Cost breakdown donut: only a coherent same-scope component set.      */
/* ------------------------------------------------------------------ */

const COST_CATEGORY_LABELS: Record<string, string> = {
  tuition: "Tuition",
  fees: "Fees",
  mandatory_fees: "Mandatory fees",
  housing: "Housing",
  food: "Food",
  books: "Books & supplies",
  personal: "Personal",
  transport: "Transport",
  room_board: "Room & board",
  total: "Total",
};

const costCategoryLabel = (category: string) =>
  COST_CATEGORY_LABELS[category] || prettify(category);

export type CostBreakdown = {
  universityId: string;
  name: string;
  currency: string;
  year: number | null;
  studentCategory: string;
  period: string;
  scopeLabel: string;
  components: (SourceDetails & {
    category: string;
    label: string;
    amount: number;
  })[];
  total: number | null;
  knownSum: number;
  remainder: number | null;
  isPartial: boolean;
  discrepancy: boolean;
  coverageNote: string;
  sourceUrl?: string;
  sourceName?: string;
};

/**
 * A donut is valid only for one coherent scope (same currency, population,
 * period and year) with at least two reported non-total components.
 * Single figures or absent components return null: no donut is drawn.
 */
export function costBreakdown(u: University): CostBreakdown | null {
  const scoped = usableCosts(u.costs || []).filter(
    (c) => !c.program_id && c.period === "year" && c.year != null,
  );
  const buckets = new Map<string, Cost[]>();
  for (const c of scoped) {
    const key = JSON.stringify([
      c.currency,
      c.student_category,
      c.period,
      c.year,
      c.evidence?.population || null,
      c.evidence?.scope || null,
    ]);
    buckets.set(key, [...(buckets.get(key) || []), c]);
  }
  const candidates = [...buckets.values()]
    .flatMap((rows) => {
      const categories = new Map<string, Cost>();
      for (const row of rows) {
        const previous = categories.get(row.category);
        // Duplicate reports never become extra slices; conflicting values
        // leave the whole scope unavailable rather than inventing a choice.
        if (previous && previous.amount !== row.amount) return [];
        if (!previous) categories.set(row.category, row);
      }
      // A bundled room/board or fees figure can overlap separate components.
      // Do not infer an allocation or count the same expense twice.
      if (
        categories.has("room_board") &&
        (categories.has("housing") || categories.has("food"))
      )
        return [];
      if (categories.has("fees") && categories.has("mandatory_fees")) return [];
      return [[...categories.values()]];
    })
    .map((rows) => ({
      rows,
      parts: rows.filter((r) => r.category !== "total"),
      total: rows.find((r) => r.category === "total") || null,
    }))
    .filter((c) => c.parts.length >= 2);
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const yearDifference = (b.rows[0]?.year || 0) - (a.rows[0]?.year || 0);
    if (yearDifference) return yearDifference;
    if (b.parts.length !== a.parts.length)
      return b.parts.length - a.parts.length;
    if (Number(b.total != null) !== Number(a.total != null))
      return Number(b.total != null) - Number(a.total != null);
    return 0;
  });
  const best = candidates[0];
  const knownSum = best.parts.reduce((sum, r) => sum + r.amount, 0);
  if (knownSum <= 0) return null;
  const first = best.rows[0];
  const total = best.total?.amount ?? null;
  const remainder =
    total != null && total - knownSum > 0.5 ? total - knownSum : null;
  const discrepancy = total != null && knownSum - total > 0.5;
  const { sourceUrl, sourceName } = sourceOf(best.total || best.parts[0]);
  return {
    universityId: u.id,
    name: u.name,
    currency: first.currency,
    year: first.year,
    studentCategory: first.student_category,
    period: first.period,
    scopeLabel: [
      `${prettify(first.student_category)} · ${first.currency} · per ${first.period} · ${first.year ?? "year not stated"}`,
      first.evidence?.population,
      first.evidence?.scope,
    ]
      .filter(Boolean)
      .join(" · "),
    components: [...best.parts]
      .sort((a, b) => b.amount - a.amount)
      .map((r) => ({
        category: r.category,
        label: costCategoryLabel(r.category),
        amount: r.amount,
        ...sourceOf(r),
      })),
    total,
    knownSum,
    remainder,
    isPartial: total == null || remainder != null,
    discrepancy,
    coverageNote:
      total == null
        ? "Total cost was not published for this scope: listed components are known parts of an unknown total."
        : remainder != null
          ? "Listed components are known parts of the published total; the gap is unlisted costs, not an estimate."
          : discrepancy
            ? "Listed components sum above the published total; both are shown exactly as reported."
            : "Listed components account for the published total.",
    sourceUrl,
    sourceName,
  };
}
