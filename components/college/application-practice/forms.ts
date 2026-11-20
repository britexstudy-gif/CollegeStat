/** Practice application forms: structure, limits and validation. No React, so
 * tests can import it. Each platform mirrors the real form, in its order, with
 * its section names and limits (checked 2026-11-19):
 * - Common App first-year application, 2026–27: https://www.commonapp.org/apply/first-year-students,
 *   https://www.commonapp.org/apply/essay-prompts (7 prompts, 250–650 words) and
 *   "What's new 2025–26" (https://www.commonapp.org/files/Whats-New-25-26.pdf): additional
 *   information cut to 300 words, the "Challenges and circumstances" question (250 words),
 *   the new "Responsibilities and circumstances" checklist in Activities. 10 activities
 *   with 50/100/150-character fields; 5 honors with 100 characters.
 * - UCAS undergraduate (2027 entry, UCAS Hub):
 *   https://www.ucas.com/applying/applying-to-university/filling-in-your-ucas-application
 *   (section order, five choices, £34.50 fee) and
 *   https://www.ucas.com/applying/applying-to-university/writing-personal-statement/how-write-personal-statement
 *   (three questions, 4,000 characters in total including spaces, at least 350 each).
 * - uni-assist (My assist): https://www.uni-assist.de/en/how-to-apply/apply-online and
 *   https://www.uni-assist.de/en/faqs/apply-online/ (applicant data, educational history,
 *   one application per programme, every application is also a VPD request, documents
 *   uploaded once as PDF).
 * - UC application: https://admission.universityofcalifornia.edu/how-to-apply/applying-as-a-freshman/personal-insight-questions.html
 *   (8 personal insight questions, answer 4, 350 words each); activities and awards:
 *   up to 20 entries, 60-character name, 350-character description (UC counselor materials).
 * - Studielink, Campus France, Universitaly and direct portals use the steps their help
 *   pages describe: personal details, previous education, programme request, documents.
 * Nothing here is sent anywhere; this is a practice copy. */
import { countText, essayType } from "@/lib/essay-types";
import type { MessageKey } from "@/lib/i18n/messages";
import type { CommonAppFlags, PlatformID, SimKind } from "@/lib/application-platforms";

export type Unit = "words" | "chars";
export type FieldType = "text" | "email" | "date" | "number" | "select" | "radio" | "multi" | "textarea" | "essay" | "check" | "file";
export type Option = { value: string; label?: MessageKey; text?: string };
export type FieldDef = {
  id: string;
  label: MessageKey;
  type: FieldType;
  required?: boolean;
  /** Length limit: characters for text fields, `unit` for essays. */
  max?: number;
  min?: number;
  unit?: Unit;
  options?: Option[];
  hint?: MessageKey;
  wide?: boolean;
  /** Show a live character counter, as the portal does. */
  counter?: boolean;
  /** Sub-heading printed above this field (the portal's question group). */
  heading?: MessageKey;
  /** Writing desk essay type this essay can be imported from. */
  writing?: string;
  /** Which answer of a sectioned writing desk essay this field maps to. */
  part?: number;
  /** For number fields. */
  range?: [number, number];
  /** Heading for a block of fields (a university's name). */
  group?: string;
};
export type RepeatDef = { count: number; min: number; item: MessageKey; fields: FieldDef[]; complete: string[] };
export type SectionDef = {
  id: string;
  title: MessageKey;
  intro?: MessageKey;
  /** Rough minutes to fill the whole section, for the time estimate. */
  minutes: number;
  fields?: FieldDef[];
  repeat?: RepeatDef;
  /** Section with a total across its essays (UCAS personal statement). */
  total?: { max: number; unit: Unit; lines?: number };
  /** Answer exactly this many of the essays (UC personal insight questions). */
  choose?: number;
  /** Navigation group: a heading key, or a plain name (a college). */
  group?: MessageKey;
  groupName?: string;
  /** Common App: which tab the section lives under. */
  tab?: "common" | "colleges";
  review?: boolean;
};
export type Values = Record<string, string | boolean>;
export type SimUniversity = { id: string; name: string; country_code: string };
export type FormContext = {
  kind: SimKind;
  platform: PlatformID;
  universities: SimUniversity[];
  commonApp?: Record<string, CommonAppFlags>;
  vpd?: boolean;
};

const k = (s: string) => ("app.sim." + s) as MessageKey;
const m = (s: string) => ("imk." + s) as MessageKey;
const opts = (prefix: string, values: string[]): Option[] => values.map((value) => ({ value, label: k(prefix + "." + value) }));
const iopts = (prefix: string, values: string[]): Option[] => values.map((value) => ({ value, label: m(prefix + "." + value) }));
const text = (values: string[]): Option[] => values.map((value) => ({ value, text: value }));
/** A field labelled from the shared app.sim keys. */
const f = (id: string, type: FieldType, extra: Partial<FieldDef> = {}): FieldDef => ({ id, type, label: k("f." + id), ...extra });
/** A field labelled from the imk keys. */
const g = (id: string, type: FieldType, extra: Partial<FieldDef> = {}): FieldDef => ({ id, type, label: m("f." + id), ...extra });
const req = { required: true };

const YES_NO = opts("o.yn", ["yes", "no"]);
const ENGLISH = opts("o.english", ["none", "ielts", "toefl", "duolingo", "other"]);
const CURRICULUM = opts("o.curriculum", ["national", "ib", "alevel", "ap", "other"]);
const GRADES = text(["9", "10", "11", "12"]);
const COUNTRY = (id: string, extra: Partial<FieldDef> = {}) => f(id, "text", { max: 80, ...extra });

const COMMON_APP_ESSAY = essayType("common_app");
const UCAS_ESSAY = essayType("ucas");
const MOTIVATION = essayType("motivation");
const STATEMENT = essayType("statement");

/** Shared ids keep the profile prefill working on every platform. */
const name = (): FieldDef[] => [f("first_name", "text", { ...req, max: 100 }), g("middle_name", "text", { max: 100 }), f("last_name", "text", { ...req, max: 100 })];

/* ---------- Common App ---------- */

function commonApp(ctx: FormContext): SectionDef[] {
  const common = (id: string, group: string, title: MessageKey, minutes: number, rest: Partial<SectionDef>): SectionDef => ({ id, title, minutes, group: m("g." + group), tab: "common", ...rest });
  const colleges = ctx.universities.flatMap((u): SectionDef[] => {
    const flags = ctx.commonApp?.[u.id];
    const own = { groupName: u.name, tab: "colleges" as const };
    const out: SectionDef[] = [
      {
        id: `c-${u.id}-questions`,
        title: m("s.ca_questions"),
        minutes: 15,
        ...own,
        fields: [
          f("col_plan", "radio", { id: "plan", ...req, wide: true, heading: m("h.ca_general"), options: opts("o.plan", ["ed", "ea", "rea", "rd"]) }),
          g("term", "select", { ...req, options: iopts("o.term", ["fall2027", "spring2028"]) }),
          f("col_major", "text", { id: "major", max: 100, heading: m("h.ca_academics") }),
          g("aid", "radio", { ...req, options: YES_NO }),
          g("contacted", "radio", { options: YES_NO }),
          ...(flags?.fee ? [f("col_fee", "check", { id: "fee", ...req, heading: m("h.ca_fee") })] : []),
        ],
      },
      {
        id: `c-${u.id}-recommenders`,
        title: m("s.ca_recommenders"),
        intro: k("i.recommenders"),
        minutes: 10,
        ...own,
        fields: [
          g("ferpa", "radio", { ...req, heading: m("h.ca_ferpa"), hint: m("f.ferpa_hint"), options: iopts("o.ferpa", ["waive", "keep"]) }),
          f("rec_counselor", "check", { ...req, heading: m("h.ca_invite") }),
          f("rec_teacher1", "check", { required: !!flags?.recs }),
          f("rec_teacher2", "check"),
          f("rec_other", "check"),
        ],
      },
    ];
    if (flags?.essay !== false)
      out.splice(1, 0, {
        id: `c-${u.id}-writing`,
        title: m("s.ca_writing"),
        minutes: 60,
        ...own,
        fields: [
          f("col_supplement", "essay", {
            id: "supplement",
            required: !!flags?.essay,
            wide: true,
            unit: "words",
            max: 650,
            writing: `why_us@${u.id}`,
            hint: flags ? k("f.col_supplement_hint") : k("f.col_supplement_unknown"),
          }),
        ],
      });
    return out;
  });
  return [
    common("personal", "profile", m("s.ca_personal"), 4, { fields: [...name(), g("preferred_name", "text", { max: 100 }), f("dob", "date", req)] }),
    common("address", "profile", m("s.ca_address"), 3, { fields: [f("address", "text", { ...req, max: 200, wide: true }), g("city", "text", { ...req, max: 80 }), f("residence", "text", { ...req, max: 80 })] }),
    common("contact", "profile", m("s.ca_contact"), 2, { fields: [f("email", "email", req), f("phone", "text", { ...req, max: 30 }), g("phone_type", "radio", { ...req, options: iopts("o.phone", ["mobile", "home"]) })] }),
    common("geography", "profile", m("s.ca_geography"), 3, {
      fields: [COUNTRY("birth_country", { label: m("f.birth_country"), ...req }), g("citizenship_status", "select", { ...req, options: iopts("o.citizen", ["us", "dual", "pr", "resident", "non"]) }), f("nationality", "text", { ...req, max: 80 }), g("visa", "select", { options: iopts("o.visa", ["f1", "j1", "other", "none"]) })],
    }),
    common("language", "profile", m("s.ca_language"), 2, { fields: [f("first_language", "text", { ...req, max: 60 }), f("other_languages", "text", { max: 120 })] }),
    common("fee_waiver", "profile", m("s.ca_fee_waiver"), 1, { fields: [g("fee_waiver", "radio", { ...req, hint: m("f.fee_waiver_hint"), options: YES_NO })] }),
    common("household", "family", m("s.ca_household"), 2, { fields: [f("household", "select", { ...req, options: opts("o.household", ["both", "one", "guardian", "other"]) }), g("marital", "select", { options: iopts("o.marital", ["married", "divorced", "separated", "widowed", "never"]) })] }),
    common("parent1", "family", m("s.ca_parent1"), 4, { fields: [f("p1_name", "text", { ...req, max: 100 }), f("p1_occupation", "text", { max: 100 }), f("p1_education", "select", { options: opts("o.edu", ["school", "some", "bachelor", "graduate", "none"]) })] }),
    common("parent2", "family", m("s.ca_parent2"), 3, { fields: [f("p2_name", "text", { max: 100 }), f("p2_occupation", "text", { max: 100 }), g("p2_education", "select", { options: opts("o.edu", ["school", "some", "bachelor", "graduate", "none"]) })] }),
    common("siblings", "family", m("s.ca_siblings"), 1, { fields: [f("siblings", "number", { ...req, range: [0, 20] })] }),
    common("school", "education", m("s.ca_school"), 6, {
      fields: [f("school", "text", { ...req, max: 150, wide: true }), f("school_country", "text", { ...req, max: 80 }), g("entry_date", "date", req), f("grad_date", "date", req), f("curriculum", "select", { ...req, options: CURRICULUM }), f("counselor_name", "text", { max: 100, heading: m("h.ca_counselor") }), f("counselor_email", "email")],
    }),
    common("grades", "education", m("s.ca_grades"), 4, {
      fields: [g("class_size", "number", { range: [1, 2000] }), g("rank_type", "select", { ...req, options: iopts("o.rank", ["exact", "decile", "quintile", "quartile", "none"]) }), f("gpa", "text", { max: 20 }), f("gpa_scale", "text", { max: 20 }), g("gpa_weighting", "radio", { options: iopts("o.weight", ["weighted", "unweighted"]) })],
    }),
    common("courses", "education", m("s.ca_courses"), 10, {
      intro: m("i.ca_courses"),
      repeat: { count: 15, min: 1, item: k("r.course"), complete: ["course", "course_level"], fields: [f("course", "text", { max: 100, wide: true }), f("course_level", "select", { options: opts("o.clevel", ["standard", "advanced", "ap", "ib_hl", "ib_sl", "alevel", "other"]) }), g("schedule", "select", { options: iopts("o.schedule", ["full", "first", "second"]) })] },
    }),
    common("honors", "education", k("s.honors"), 10, {
      intro: m("i.ca_honors"),
      repeat: { count: 5, min: 0, item: k("r.honor"), complete: ["title", "level"], fields: [f("title", "text", { max: 100, wide: true, counter: true }), f("grades", "multi", { label: m("f.grade_level"), options: GRADES }), f("level", "multi", { options: opts("o.level", ["school", "regional", "national", "international"]) })] },
    }),
    common("future", "education", m("s.ca_future"), 2, { fields: [g("career", "text", { ...req, max: 100 }), g("degree", "select", { ...req, options: iopts("o.degree", ["bachelor", "master", "doctorate", "undecided"]) })] }),
    common("testing", "testing", m("s.ca_testing"), 6, {
      fields: [
        f("report_scores", "radio", { ...req, options: YES_NO }),
        f("sat_total", "number", { range: [400, 1600], heading: m("h.sat") }),
        g("sat_date", "date"),
        f("act", "number", { range: [1, 36], heading: m("h.act") }),
        f("english_test", "select", { ...req, options: ENGLISH, heading: m("h.english") }),
        f("english_score", "text", { max: 20 }),
        f("test_date", "date"),
      ],
    }),
    common("activities", "activities", m("s.ca_activities"), 45, {
      intro: k("i.activities"),
      repeat: {
        count: 10,
        min: 1,
        item: k("r.activity"),
        complete: ["type", "position", "description"],
        fields: [
          f("type", "select", { label: m("f.activity_type"), options: opts("o.act", ["academic", "art", "athletics", "career", "community", "family", "journalism", "language", "music", "research", "stem", "work", "other"]), wide: true }),
          f("position", "text", { max: 50, wide: true, counter: true }),
          f("org", "text", { max: 100, wide: true, counter: true }),
          f("description", "textarea", { max: 150, wide: true }),
          f("grades", "multi", { label: m("f.grade_level"), options: GRADES, wide: true }),
          g("timing", "multi", { options: iopts("o.timing", ["school", "break", "year"]), wide: true }),
          f("hours", "number", { range: [0, 168] }),
          f("weeks", "number", { range: [0, 52] }),
          g("college_too", "radio", { options: YES_NO, wide: true }),
        ],
      },
    }),
    common("responsibilities", "activities", m("s.ca_responsibilities"), 3, {
      intro: m("i.ca_responsibilities"),
      fields: [
        g("household_duties", "multi", { ...req, wide: true, options: iopts("o.duty", ["siblings", "adult", "chores", "translate", "work", "none"]) }),
        g("circumstances", "multi", { ...req, wide: true, options: iopts("o.circ", ["moved", "health", "school_change", "unstable", "none"]) }),
      ],
    }),
    common("essay", "writing", k("s.essay"), 180, {
      intro: k("i.essay"),
      fields: [
        f("prompt", "radio", { ...req, wide: true, options: (COMMON_APP_ESSAY.prompts || []).map((p, i) => ({ value: String(i), text: p })) }),
        f("essay", "essay", { ...req, wide: true, unit: "words", min: 250, max: 650, writing: "common_app" }),
      ],
    }),
    common("challenges", "writing", m("s.ca_challenges"), 15, {
      fields: [g("challenges_q", "radio", { ...req, wide: true, options: YES_NO }), g("challenges", "essay", { wide: true, unit: "words", max: 250 })],
    }),
    common("additional", "writing", k("s.additional"), 15, {
      fields: [g("additional_q", "radio", { ...req, wide: true, options: YES_NO }), f("additional", "essay", { wide: true, unit: "words", max: 300 })],
    }),
    ...colleges,
    { id: "review", title: k("s.review"), minutes: 10, review: true, tab: "colleges", group: m("g.submit") },
  ];
}

/* ---------- UCAS ---------- */

/** UCAS asks for every section to be marked complete before it can be sent. */
const done = (): FieldDef => g("complete", "check", { ...req, wide: true, heading: m("h.ucas_complete") });

function ucas(ctx: FormContext): SectionDef[] {
  const choices: Option[] = ctx.universities.map((u) => ({ value: u.id, text: u.name }));
  const ucasSection = (id: string, title: MessageKey, minutes: number, rest: Partial<SectionDef>): SectionDef => ({ id, title, minutes, ...rest, fields: rest.fields ? [...rest.fields, done()] : [done()] });
  return [
    ucasSection("personal", m("s.uc_personal"), 5, {
      fields: [g("title", "select", { ...req, options: text(["Mr", "Ms", "Mx", "Miss", "Mrs"]) }), ...name(), g("preferred_name", "text", { max: 100 }), f("dob", "date", req), g("gender", "select", { ...req, options: iopts("o.gender", ["male", "female", "other", "none"]) })],
    }),
    ucasSection("contact", m("s.uc_contact"), 5, {
      fields: [f("email", "email", req), f("phone", "text", { ...req, max: 30 }), f("address", "text", { ...req, max: 200, wide: true }), f("residence", "text", { ...req, max: 80 }), g("three_years", "radio", { ...req, wide: true, options: YES_NO })],
    }),
    ucasSection("nationality", m("s.uc_nationality"), 4, {
      fields: [COUNTRY("birth_country", { label: m("f.birth_country"), ...req }), f("nationality", "text", { ...req, max: 80 }), g("dual_nationality", "text", { max: 80 }), g("visa_needed", "radio", { ...req, wide: true, options: YES_NO }), g("passport", "text", { max: 20 })],
    }),
    ucasSection("supporting", m("s.uc_supporting"), 2, { fields: [g("eu_lived", "radio", { ...req, wide: true, options: YES_NO }), g("care", "radio", { wide: true, options: YES_NO })] }),
    ucasSection("finance", m("s.uc_finance"), 3, {
      fields: [g("funding", "select", { ...req, options: iopts("o.funding", ["private", "scholarship", "government", "unsure"]) }), f("fee_status", "select", { ...req, options: opts("o.fee", ["overseas", "home", "unsure"]) })],
    }),
    ucasSection("education", m("s.uc_education"), 25, {
      intro: m("i.uc_education"),
      fields: [
        f("school", "text", { ...req, max: 150, wide: true }),
        f("school_country", "text", { ...req, max: 80 }),
        f("school_from", "date", req),
        f("school_to", "date", req),
        f("qualification", "select", { ...req, options: CURRICULUM }),
        f("subjects", "textarea", { ...req, max: 1000, wide: true }),
        f("english_test", "select", { ...req, options: ENGLISH, heading: m("h.english") }),
        f("english_score", "text", { max: 20 }),
      ],
    }),
    ucasSection("employment", k("s.employment"), 10, {
      intro: m("i.uc_employment"),
      repeat: {
        count: 5,
        min: 0,
        item: k("r.job"),
        complete: ["employer", "role"],
        fields: [f("employer", "text", { max: 100 }), f("role", "text", { max: 100 }), f("job_from", "date"), f("job_to", "date"), f("job_hours", "select", { options: opts("o.hours", ["part", "full"]) })],
      },
    }),
    ucasSection("extra", m("s.uc_extra"), 5, {
      intro: m("i.uc_extra"),
      repeat: {
        count: 5,
        min: 0,
        item: m("r.extra"),
        complete: ["extra_type", "extra_name"],
        fields: [g("extra_type", "select", { options: iopts("o.extra", ["summer", "taster", "course", "other"]) }), g("extra_name", "text", { max: 100 }), g("extra_from", "date"), g("extra_to", "date")],
      },
    }),
    ucasSection("statement", k("s.statement"), 180, {
      intro: k("i.statement"),
      total: { max: 4000, unit: "chars", lines: 47 },
      fields: (UCAS_ESSAY.sections || []).map((_, i) => f("q" + (i + 1), "essay", { ...req, wide: true, unit: "chars", min: 350, max: 4000, writing: "ucas", part: i })),
    }),
    ucasSection("reference", m("s.uc_reference"), 10, {
      intro: k("i.reference"),
      fields: [f("ref_name", "text", { ...req, max: 100 }), f("ref_email", "email", req), f("ref_role", "select", { ...req, options: opts("o.role", ["teacher", "counselor", "head", "other"]) }), g("ref_org", "text", { max: 150 }), f("ref_requested", "check", req)],
    }),
    ucasSection("choices", m("s.uc_choices"), 20, {
      intro: k("i.choices"),
      repeat: {
        count: 5,
        min: 1,
        item: k("r.choice"),
        complete: ["uni", "course"],
        fields: [
          f("uni", "select", { options: [...choices, { value: "other", label: k("o.other_uni") }], wide: true }),
          f("course", "text", { max: 120, wide: true }),
          f("course_code", "text", { max: 12 }),
          f("start", "select", { options: opts("o.start", ["sep2027", "oct2027", "jan2028"]) }),
          f("entry_point", "select", { options: opts("o.entry", ["1", "2"]) }),
          f("live_home", "radio", { options: YES_NO }),
        ],
      },
    }),
    { id: "review", title: m("s.uc_pay"), minutes: 10, review: true },
  ];
}

/* ---------- European portals (uni-assist, Studielink, Campus France, Universitaly …) ---------- */

const PROGRAMME_TITLE: Partial<Record<PlatformID, string>> = {
  "uni-assist": "eu_apply",
  studielink: "eu_enrol",
  universitaly: "eu_preenrol",
  "campus-france": "eu_choices",
  parcoursup: "eu_choices",
};

function europe(ctx: FormContext): SectionDef[] {
  const p = ctx.platform;
  const assist = p === "uni-assist";
  const programmes: FieldDef[] = ctx.universities.flatMap((u) => [
    f("programme", "text", { id: `prog.${u.id}.programme`, ...req, max: 150, group: u.name, wide: true }),
    g("degree", "select", { id: `prog.${u.id}.degree`, ...req, group: u.name, options: iopts("o.degree", ["bachelor"]) }),
    f("semester", "select", { id: `prog.${u.id}.semester`, ...req, group: u.name, options: opts("o.semester", ["winter2027", "summer2028"]) }),
    f("teaching_language", "select", { id: `prog.${u.id}.language`, ...req, group: u.name, options: opts("o.lang", ["en", "de", "nl", "it", "fr", "other"]) }),
    ...(assist ? [f("route", "radio", { id: `prog.${u.id}.route`, ...req, group: u.name, wide: true, options: opts("o.route", ["full", "vpd"]) })] : []),
  ]);
  const upload = (id: string, required = true, label?: MessageKey) => f(id, "file", { required, wide: true, ...(label ? { label } : {}) });
  const sections: SectionDef[] = [
    {
      id: "personal",
      title: m(assist ? "s.eu_applicant" : "s.eu_personal"),
      minutes: 10,
      fields: [
        ...name(),
        f("dob", "date", req),
        g("birth_place", "text", { ...req, max: 80 }),
        COUNTRY("birth_country", { label: m("f.birth_country"), ...req }),
        f("nationality", "text", { ...req, max: 80 }),
        g("gender", "select", { ...req, options: iopts("o.gender", ["male", "female", "other", "none"]) }),
        f("email", "email", { ...req, heading: m("h.contact") }),
        f("phone", "text", { ...req, max: 30 }),
        f("address", "text", { ...req, max: 200, wide: true }),
        f("residence", "text", { ...req, max: 80 }),
      ],
    },
    {
      id: "education",
      title: m("s.eu_education"),
      intro: m(assist ? "i.eu_education_assist" : "i.eu_education"),
      minutes: 15,
      fields: [
        f("curriculum", "select", { ...req, label: m("f.certificate_type"), options: CURRICULUM, heading: m("h.school") }),
        f("school", "text", { ...req, max: 150 }),
        f("school_country", "text", { ...req, max: 80 }),
        f("grad_date", "date", { ...req, label: m("f.cert_date") }),
        f("gpa", "text", { ...req, max: 20, label: m("f.overall_grade") }),
        f("gpa_scale", "text", { ...req, max: 20, label: m("f.best_grade") }),
        g("uni_before", "radio", { ...req, wide: true, heading: m("h.university"), options: YES_NO }),
        g("uni_name", "text", { max: 150 }),
        g("uni_semesters", "number", { range: [0, 20] }),
      ],
    },
    {
      id: "language",
      title: m("s.eu_language"),
      minutes: 5,
      fields: [
        g("german", "select", { ...req, options: iopts("o.cefr", ["none", "a1", "a2", "b1", "b2", "c1", "c2"]) }),
        f("language_test", "select", { ...req, options: opts("o.langtest", ["ielts", "toefl", "testdaf", "goethe", "dsh", "other"]) }),
        f("language_score", "text", { max: 20 }),
        g("language_date", "date"),
      ],
    },
    { id: "programmes", title: m("s." + (PROGRAMME_TITLE[p] || "eu_apply")), intro: m(assist ? (ctx.vpd ? "i.eu_vpd" : "i.eu_apply_assist") : "i.eu_programmes"), minutes: 10 * Math.max(1, ctx.universities.length), fields: programmes },
    {
      id: "documents",
      title: m("s.eu_documents"),
      intro: m(assist ? "i.eu_docs_assist" : "i.eu_docs"),
      minutes: 30,
      fields: [upload("doc_certificate"), upload("doc_transcript"), upload("doc_translation"), upload("doc_language"), upload("doc_passport"), upload("doc_cv", false), ...(assist ? [upload("doc_motivation", false, m("f.doc_motivation"))] : [])],
    },
  ];
  if (!assist)
    sections.push({
      id: "motivation",
      title: m(p === "campus-france" ? "s.eu_project" : "s.eu_motivation"),
      intro: k("i.motivation"),
      minutes: 120,
      fields: [f("letter", "essay", { ...req, wide: true, unit: MOTIVATION.limit.unit, min: MOTIVATION.limit.min, max: MOTIVATION.limit.max, writing: "motivation" })],
    });
  sections.push({ id: "review", title: m(assist ? "s.eu_submit_assist" : "s.eu_submit"), minutes: 10, review: true });
  return sections;
}

/* ---------- UC application ---------- */

const UC_CAMPUSES = text(["Berkeley", "Davis", "Irvine", "Los Angeles", "Merced", "Riverside", "San Diego", "Santa Barbara", "Santa Cruz"]);

function uc(): SectionDef[] {
  return [
    {
      id: "personal",
      title: m("s.ucapp_about"),
      minutes: 15,
      fields: [...name(), f("dob", "date", req), f("email", "email", req), f("phone", "text", { ...req, max: 30 }), f("address", "text", { ...req, max: 200, wide: true }), f("nationality", "text", { ...req, max: 80 }), g("citizenship_status", "select", { ...req, options: iopts("o.citizen", ["us", "dual", "pr", "resident", "non"]) })],
    },
    {
      id: "campuses",
      title: m("s.ucapp_campuses"),
      intro: m("i.ucapp_campuses"),
      minutes: 10,
      fields: [g("campuses", "multi", { ...req, wide: true, options: UC_CAMPUSES }), g("major", "text", { ...req, max: 100 }), g("alt_major", "text", { max: 100 })],
    },
    {
      id: "education",
      title: m("s.ucapp_academic"),
      minutes: 25,
      fields: [f("school", "text", { ...req, max: 150, wide: true }), f("school_country", "text", { ...req, max: 80 }), f("grad_date", "date", req), f("curriculum", "select", { ...req, options: CURRICULUM }), f("gpa", "text", { max: 20 }), f("courses", "textarea", { ...req, max: 1000, wide: true })],
    },
    {
      id: "testing",
      title: m("s.ucapp_tests"),
      intro: m("i.ucapp_tests"),
      minutes: 5,
      fields: [f("english_test", "select", { ...req, options: ENGLISH }), f("english_score", "text", { max: 20 }), f("test_date", "date")],
    },
    {
      id: "activities",
      title: m("s.ucapp_activities"),
      intro: m("i.ucapp_activities"),
      minutes: 45,
      repeat: {
        count: 20,
        min: 1,
        item: m("r.ucapp_entry"),
        complete: ["category", "name", "description"],
        fields: [
          g("category", "select", { wide: true, options: iopts("o.uccat", ["award", "extracurricular", "volunteer", "prep", "course", "work"]) }),
          g("name", "text", { label: m("f.uc_name"), max: 60, wide: true, counter: true }),
          f("description", "textarea", { max: 350, wide: true }),
          f("grades", "multi", { label: m("f.grade_level"), options: GRADES, wide: true }),
          f("hours", "number", { range: [0, 168] }),
          f("weeks", "number", { range: [0, 52] }),
        ],
      },
    },
    {
      id: "piq",
      title: m("s.ucapp_piq"),
      intro: m("i.ucapp_piq"),
      minutes: 240,
      choose: 4,
      fields: Array.from({ length: 8 }, (_, i) => g("piq" + (i + 1), "essay", { label: m("f.piq" + (i + 1)), wide: true, unit: "words", max: 350 })),
    },
    { id: "review", title: m("s.ucapp_review"), minutes: 10, review: true },
  ];
}

/* ---------- Direct and other shared portals (OUAC, Coalition, university portals) ---------- */

function direct(ctx: FormContext): SectionDef[] {
  const many = ctx.universities.length > 1;
  const programme: FieldDef[] = many
    ? ctx.universities.flatMap((u) => [f("programme", "text", { id: `prog.${u.id}.programme`, ...req, max: 150, group: u.name }), f("campus", "text", { id: `prog.${u.id}.campus`, max: 100, group: u.name })])
    : [f("programme", "text", { ...req, max: 150, wide: true }), f("campus", "text", { max: 100 })];
  return [
    { id: "personal", title: k("s.personal"), minutes: 10, fields: [...name(), f("dob", "date", req), f("email", "email", req), f("phone", "text", { ...req, max: 30 }), f("nationality", "text", { ...req, max: 80 }), f("residence", "text", { ...req, max: 80 }), f("address", "text", { max: 200, wide: true })] },
    {
      id: "education",
      title: m("s.dir_education"),
      minutes: 20,
      fields: [f("school", "text", { ...req, max: 150 }), f("school_country", "text", { ...req, max: 80 }), f("grad_date", "date", req), f("qualification", "select", { ...req, options: CURRICULUM }), f("grades", "text", { ...req, max: 60 }), f("english_test", "select", { ...req, options: ENGLISH, heading: m("h.english") }), f("english_score", "text", { max: 20 })],
    },
    { id: "programme", title: m("s.dir_programme"), minutes: 10, fields: [...programme, f("intake", "select", { ...req, options: opts("o.start", ["sep2027", "oct2027", "jan2028"]) })] },
    {
      id: "documents",
      title: m("s.eu_documents"),
      intro: k("i.documents_direct"),
      minutes: 30,
      fields: [f("doc_transcript", "file", { ...req, wide: true }), f("doc_certificate", "file", { wide: true }), f("doc_passport", "file", { ...req, wide: true }), f("doc_language", "file", { ...req, wide: true }), f("doc_recommendation", "file", { wide: true }), f("doc_portfolio", "file", { wide: true })],
    },
    {
      id: "statement",
      title: k("s.statement_direct"),
      intro: k("i.statement_direct"),
      minutes: 120,
      fields: [f("statement", "essay", { ...req, wide: true, unit: STATEMENT.limit.unit, min: STATEMENT.limit.min, max: STATEMENT.limit.max, writing: "statement" })],
    },
    { id: "review", title: m("s.dir_submit"), minutes: 10, review: true },
  ];
}

export function sectionsFor(ctx: FormContext): SectionDef[] {
  if (ctx.kind === "common-app") return commonApp(ctx);
  if (ctx.kind === "ucas") return ucas(ctx);
  if (ctx.kind === "europe") return europe(ctx);
  if (ctx.platform === "uc") return uc();
  return direct(ctx);
}

/** How the portal is laid out: Common App's tabs and section list, the UCAS
 * Hub, a step wizard (uni-assist and other European portals) or a plain list. */
export type PortalStyle = "common-app" | "hub" | "wizard" | "list";
export const portalStyle = (ctx: Pick<FormContext, "kind">): PortalStyle =>
  ctx.kind === "common-app" ? "common-app" : ctx.kind === "ucas" ? "hub" : ctx.kind === "europe" ? "wizard" : "list";

/** Application fee shown on the submit step, as the portal states it. */
export function feeFor(ctx: FormContext): { amount: string; note?: MessageKey } | null {
  if (ctx.platform === "ucas") return { amount: "£34.50", note: m("fee.ucas") };
  if (ctx.platform === "uni-assist") return { amount: "€75", note: m("fee.assist") };
  if (ctx.platform === "uc") return { amount: "$95", note: m("fee.uc") };
  if (ctx.platform === "ouac") return { amount: "CAD 156", note: m("fee.ouac") };
  if (ctx.platform === "studielink") return { amount: "€0", note: m("fee.studielink") };
  return null;
}

export const valueKey = (section: string, field: string) => section + "." + field;
export const itemKey = (section: string, index: number, field: string) => `${section}.${index}.${field}`;

export type Problem = "required" | "too_long" | "too_short" | "email" | "range" | "date" | "date_order" | "total" | "min_items" | "incomplete_item" | "choose";

/** End-date fields and the start date they must not precede. */
const DATE_PAIRS: [string, string][] = [
  ["school_from", "school_to"],
  ["job_from", "job_to"],
  ["extra_from", "extra_to"],
];
export type Issue = { section: string; field: string; label: MessageKey; problem: Problem; n?: number; unit?: Unit; item?: number };

const str = (v: Values, key: string) => {
  const x = v[key];
  return typeof x === "string" ? x : "";
};
export const filled = (field: FieldDef, value: string | boolean | undefined) =>
  field.type === "check" ? value === true : typeof value === "string" && value.trim() !== "";

function fieldIssues(section: string, field: FieldDef, key: string, values: Values, item?: number): Issue[] {
  const value = values[key];
  const base = { section, field: key, label: field.label, item };
  if (!filled(field, value)) return field.required ? [{ ...base, problem: "required" }] : [];
  if (field.type === "check" || field.type === "file" || field.type === "multi") return [];
  const s = String(value).trim();
  const out: Issue[] = [];
  if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) out.push({ ...base, problem: "email" });
  if (field.type === "number" && field.range) {
    const n = Number(s);
    if (!Number.isFinite(n) || n < field.range[0] || n > field.range[1]) out.push({ ...base, problem: "range" });
  }
  // A date of birth must be a real one: not in the future, not a toddler's.
  if (field.id === "dob") {
    const year = Number(s.slice(0, 4));
    const latest = new Date().getFullYear() - 10;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || year < 1950 || year > latest) out.push({ ...base, problem: "date" });
  }
  const unit: Unit = field.type === "essay" ? field.unit || "words" : "chars";
  const count = countText(field.type === "essay" ? String(value) : s, unit);
  if (field.max && count > field.max) out.push({ ...base, problem: "too_long", n: field.max, unit });
  if (field.min && count < field.min) out.push({ ...base, problem: "too_short", n: field.min, unit });
  return out;
}

/** Every problem the review page lists. */
export function validate(sections: SectionDef[], values: Values): Issue[] {
  const issues: Issue[] = [];
  for (const s of sections) {
    for (const field of s.fields || []) issues.push(...fieldIssues(s.id, field, valueKey(s.id, field.id), values));
    const order = (key: (id: string) => string, label: MessageKey, item?: number) => {
      for (const [from, to] of DATE_PAIRS) {
        const a = str(values, key(from)),
          b = str(values, key(to));
        if (a && b && b < a) issues.push({ section: s.id, field: key(to), label, problem: "date_order", item });
      }
    };
    const toField = (fields: FieldDef[] | undefined) => fields?.find((x) => DATE_PAIRS.some(([, to]) => to === x.id));
    if (toField(s.fields)) order((id) => valueKey(s.id, id), toField(s.fields)!.label);
    if (s.total) {
      const sum = (s.fields || []).reduce((n, field) => n + countText(str(values, valueKey(s.id, field.id)), s.total!.unit), 0);
      if (sum > s.total.max) issues.push({ section: s.id, field: valueKey(s.id, s.fields![0].id), label: s.title, problem: "total", n: s.total.max, unit: s.total.unit });
    }
    if (s.choose) {
      const answered = (s.fields || []).filter((x) => filled(x, values[valueKey(s.id, x.id)])).length;
      if (answered !== s.choose) issues.push({ section: s.id, field: valueKey(s.id, s.fields![0].id), label: s.title, problem: "choose", n: s.choose });
    }
    if (s.repeat) {
      const r = s.repeat;
      let complete = 0;
      for (let i = 0; i < r.count; i++) {
        const started = r.fields.some((field) => filled(field, values[itemKey(s.id, i, field.id)]));
        if (!started) continue;
        const missing = r.complete.find((id) => !filled(r.fields.find((x) => x.id === id)!, values[itemKey(s.id, i, id)]));
        if (!missing) complete++;
        else issues.push({ section: s.id, field: itemKey(s.id, i, missing), label: r.item, problem: "incomplete_item", item: i + 1 });
        for (const field of r.fields) issues.push(...fieldIssues(s.id, { ...field, required: false }, itemKey(s.id, i, field.id), values, i + 1));
        if (toField(r.fields)) order((id) => itemKey(s.id, i, id), toField(r.fields)!.label, i + 1);
      }
      if (complete < r.min) issues.push({ section: s.id, field: itemKey(s.id, 0, r.complete[0]), label: r.item, problem: "min_items", n: r.min });
    }
  }
  return issues;
}

/** Filled units per section: required fields, or repeat items up to the
 * minimum (an optional list counts its first item). */
export function sectionProgress(section: SectionDef, values: Values, issues: Issue[]): { done: number; total: number } {
  if (section.review) return { done: 0, total: 0 };
  const own = issues.filter((i) => i.section === section.id);
  if (section.choose) {
    const answered = (section.fields || []).filter((x) => filled(x, values[valueKey(section.id, x.id)]) && !own.some((i) => i.field === valueKey(section.id, x.id) && i.problem !== "choose")).length;
    return { done: Math.min(section.choose, answered), total: section.choose };
  }
  if (section.repeat) {
    const r = section.repeat;
    const target = Math.max(1, r.min);
    let complete = 0;
    for (let i = 0; i < r.count; i++)
      if (r.complete.every((id) => filled(r.fields.find((x) => x.id === id)!, values[itemKey(section.id, i, id)])) && !own.some((x) => x.item === i + 1)) complete++;
    const extra = (section.fields || []).filter((x) => x.required);
    const extraDone = extra.filter((x) => filled(x, values[valueKey(section.id, x.id)])).length;
    return { done: Math.min(target, complete) + extraDone, total: target + extra.length };
  }
  // A section with only optional questions has nothing to count.
  const counted = (section.fields || []).filter((x) => x.required);
  const done = counted.filter((x) => {
    const key = valueKey(section.id, x.id);
    return filled(x, values[key]) && !own.some((i) => i.field === key);
  }).length;
  return { done, total: counted.length };
}

/** A section is complete when every unit is filled and nothing in it is wrong. */
export const sectionDone = (section: SectionDef, values: Values, issues: Issue[]) => {
  if (section.review) return false;
  const p = sectionProgress(section, values, issues);
  return p.done >= p.total && !issues.some((i) => i.section === section.id);
};

export function overallProgress(sections: SectionDef[], values: Values, issues: Issue[]) {
  let done = 0;
  let total = 0;
  let minutes = 0;
  for (const s of sections) {
    const p = sectionProgress(s, values, issues);
    done += p.done;
    total += p.total;
    minutes += s.review ? (p.total === 0 && issues.length ? s.minutes : 0) : s.minutes * (p.total ? 1 - p.done / p.total : 0);
  }
  return { percent: total ? Math.round((done / total) * 100) : 0, minutesLeft: Math.round(minutes / 5) * 5 };
}

/** UCAS: puts newly added UK universities into empty choice slots. */
export function seedChoices(values: Values, universities: SimUniversity[]): Values {
  const next = { ...values };
  const used = new Set(Array.from({ length: 5 }, (_, i) => str(next, itemKey("choices", i, "uni"))).filter(Boolean));
  for (const u of universities) {
    if (used.has(u.id)) continue;
    const slot = Array.from({ length: 5 }, (_, i) => i).find((i) => !str(next, itemKey("choices", i, "uni")));
    if (slot === undefined) break;
    next[itemKey("choices", slot, "uni")] = u.id;
    used.add(u.id);
  }
  return next;
}

/** A field's value as shown to a reader: option labels resolved. */
export function shownValue(field: FieldDef, value: string | boolean | undefined, label: (key: MessageKey) => string): string | null {
  if (value === undefined || value === "" || value === false) return null;
  if (field.type === "check") return "✓";
  const option = (v: string) => {
    const o = field.options?.find((x) => x.value === v);
    return o ? (o.text ?? (o.label ? label(o.label) : v)) : v;
  };
  if (field.type === "select" || field.type === "radio") return option(String(value));
  if (field.type === "multi")
    return String(value)
      .split(", ")
      .filter(Boolean)
      .map(option)
      .join(", ");
  return String(value);
}

/** Plain text of one section for the AI review: labels resolved by the caller. */
export function sectionText(section: SectionDef, values: Values, label: (key: MessageKey) => string): string {
  const lines: string[] = [];
  for (const field of section.fields || []) {
    const v = shownValue(field, values[valueKey(section.id, field.id)], label);
    if (v === null || field.id === "complete") continue;
    lines.push((field.group ? field.group + " · " : "") + label(field.label) + ": " + v);
  }
  if (section.repeat)
    for (let i = 0; i < section.repeat.count; i++) {
      const parts = section.repeat.fields.map((x) => shownValue(x, values[itemKey(section.id, i, x.id)], label)).filter(Boolean);
      if (parts.length) lines.push(`${label(section.repeat.item)} ${i + 1}: ${parts.join(" · ")}`);
    }
  return lines.join("\n");
}
