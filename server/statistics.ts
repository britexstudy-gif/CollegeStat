import directory from "@/data/published/global-directory.json";
import rankingRows from "@/data/published/ranking-all.json";
import { countryName } from "@/lib/domain";
type Observation = { metric: string; value: number; year: number };
const median = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length
    ? (v[Math.floor((v.length - 1) / 2)] + v[Math.floor(v.length / 2)]) / 2
    : null;
};
export function regionalStatistics() {
  const countries = new Map<
    string,
    {
      code: string;
      name: string;
      institutions: number;
      qs: number;
      the: number;
      arwu: number;
      qsTop100: number;
    }
  >();
  const get = (code: string) => {
    if (!countries.has(code))
      countries.set(code, {
        code,
        name: countryName(code),
        institutions: 0,
        qs: 0,
        the: 0,
        arwu: 0,
        qsTop100: 0,
      });
    return countries.get(code)!;
  };
  for (const u of directory) get(u.country_code).institutions++;
  for (const r of rankingRows) {
    if (!r.country_code) continue;
    const c = get(r.country_code);
    if (c.name === r.country_code) c.name = r.country;
    if (r.provider === "qs" && r.year === 2027) {
      c.qs++;
      if (r.rank <= 100) c.qsTop100++;
    }
    if (r.provider === "arwu" && r.year === 2026) c.arwu++;
    if (r.provider === "the" && r.year === 2026) c.the++;
  }
  const states = new Map<
    string,
    {
      state: string;
      institutions: number;
      rates: number[];
      students: number;
      enrollmentCoverage: number;
    }
  >();
  for (const u of directory) {
    if (u.country_code !== "US" || !u.state) continue;
    const state = states.get(u.state) || {
      state: u.state,
      institutions: 0,
      rates: [] as number[],
      students: 0,
      enrollmentCoverage: 0,
    };
    state.institutions++;
    const observations: Observation[] =
      "current_observations" in u ? u.current_observations || [] : [];
    const a = observations.find(
      (o) => o.metric === "acceptance_rate" && o.year === 2024,
    );
    if (a && a.value >= 0 && a.value <= 100) state.rates.push(a.value);
    const e = observations.find(
      (o) => o.metric === "enrollment_12_month" && o.year === 2025,
    );
    if (e) {
      state.students += e.value;
      state.enrollmentCoverage++;
    }
    states.set(u.state, state);
  }
  return {
    countries: [...countries.values()].sort((a, b) => b.qs - a.qs),
    states: [...states.values()]
      .map((s) => ({
        ...s,
        medianAdmission: median(s.rates),
        admissionCoverage: s.rates.length,
        rates: undefined,
      }))
      .sort((a, b) => b.students - a.students),
    catalogueTotal: directory.length,
    retrievedAt: "2026-09-28",
    admissionsYear: 2024,
    enrollmentYear: 2025,
  };
}
export type RegionalStatistics = ReturnType<typeof regionalStatistics>;
