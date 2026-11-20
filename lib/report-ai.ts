import { z } from "zod";
import { LANG_CODES } from "@/lib/i18n/languages";
import { personalizeInput } from "@/lib/personalize-ai";

/** "Hisobot": the whole report as one AI-written document. The browser sends the student's real
 * data (profile, saved list with catalogue facts, open tasks); the model returns sections of
 * plain blocks; the browser keeps a copy and can export it (print to PDF, markdown).
 * Server code: app/api/student-ai/report/route.ts. */

export const REPORT_SECTIONS = ["summary", "profile", "countries", "universities", "tests", "budget", "deadlines", "plan", "risks"] as const;
export type ReportSectionId = (typeof REPORT_SECTIONS)[number];

const short = (n: number) => z.string().max(n);
export const reportInput = z
  .object({
    language: z.enum(LANG_CODES).default("en"),
    today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    profile: personalizeInput.shape.profile,
    universities: z
      .array(
        z
          .object({
            slug: short(160),
            name: short(160),
            country: short(2),
            status: short(30).optional(),
            deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
            readiness: short(12).optional(),
            world_rank: z.number().int().min(1).max(5000).optional(),
            admit_rate_pct: z.number().min(0).max(100).optional(),
            tuition_usd_year: z.number().min(0).max(300000).optional(),
            sat_middle_50: short(16).optional(),
            english_min: short(24).optional(),
            our_estimate: z.enum(["reach", "target", "safety", "unknown"]),
            over_budget: z.boolean().optional(),
          })
          .strict(),
      )
      .max(30),
    tasks: z.array(z.object({ title: short(120), due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).strict()).max(12),
  })
  .strict();
export type ReportInput = z.infer<typeof reportInput>;

export type ReportTable = { head: string[]; rows: string[][] };
export type ReportSection = { id: ReportSectionId; heading: string; paragraphs: string[]; bullets: string[]; callout: string; table: ReportTable | null };
export type ReportDoc = { version: 1; created_at: string; language: string; based_on: number; sections: ReportSection[] };

export const reportJSONSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", enum: [...REPORT_SECTIONS] },
          heading: { type: "string" },
          paragraphs: { type: "array", items: { type: "string" } },
          bullets: { type: "array", items: { type: "string" } },
          callout: { type: "string" },
          table: {
            type: "object",
            additionalProperties: false,
            properties: { head: { type: "array", items: { type: "string" } }, rows: { type: "array", items: { type: "array", items: { type: "string" } } } },
            required: ["head", "rows"],
          },
        },
        required: ["id", "heading", "paragraphs", "bullets", "callout"],
      },
    },
  },
  required: ["sections"],
} as const;

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Trims a JSON-mode reply to the fixed section list, in order; anything else is dropped. */
export function fitReport(raw: unknown, meta: { created_at: string; language: string; based_on: number }): ReportDoc {
  const byId = new Map<string, Record<string, unknown>>();
  for (const s of arr(obj(raw).sections).map(obj)) {
    const id = clip(s.id, 20);
    if (!byId.has(id)) byId.set(id, s);
  }
  const sections = REPORT_SECTIONS.flatMap((id): ReportSection[] => {
    const s = byId.get(id);
    if (!s) return [];
    const paragraphs = arr(s.paragraphs).map((x) => clip(x, 700)).filter(Boolean).slice(0, 4);
    const bullets = arr(s.bullets).map((x) => clip(x, 300)).filter(Boolean).slice(0, 8);
    const callout = clip(s.callout, 400);
    const t = obj(s.table);
    const head = arr(t.head).map((x) => clip(x, 60)).slice(0, 5);
    const rows = arr(t.rows)
      .map((r) => arr(r).map((x) => clip(x, 160)).slice(0, head.length))
      .filter((r) => r.length === head.length && r.some(Boolean))
      .slice(0, 12);
    const table = head.length >= 2 && rows.length ? { head, rows } : null;
    const heading = clip(s.heading, 90);
    return heading && (paragraphs.length || bullets.length || callout || table) ? [{ id, heading, paragraphs, bullets, callout, table }] : [];
  });
  return { version: 1, created_at: meta.created_at, language: meta.language, based_on: meta.based_on, sections };
}

export function readReportDoc(v: unknown): ReportDoc | null {
  const r = obj(v);
  return r.version === 1 && typeof r.created_at === "string" && Array.isArray(r.sections) && r.sections.length > 0 ? (v as ReportDoc) : null;
}

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

/** The document as Markdown (the "Download .md" file). */
export function reportMarkdown(doc: ReportDoc, title: string, meta: string): string {
  const out = [`# ${title}`, "", `_${meta}_`, ""];
  for (const s of doc.sections) {
    out.push(`## ${s.heading}`, "");
    if (s.callout) out.push(`> ${s.callout.replace(/\n+/g, " ")}`, "");
    for (const p of s.paragraphs) out.push(p, "");
    if (s.bullets.length) out.push(...s.bullets.map((b) => `- ${b}`), "");
    if (s.table) {
      out.push(`| ${s.table.head.map(esc).join(" | ")} |`, `| ${s.table.head.map(() => "---").join(" | ")} |`);
      for (const r of s.table.rows) out.push(`| ${r.map(esc).join(" | ")} |`);
      out.push("");
    }
  }
  return out.join("\n").trimEnd() + "\n";
}
