/** Which essays each saved university needs, from its detected application
 * platform. Shared essays (the Common App personal essay, the UCAS statement)
 * are one document; university-specific ones are separate documents keyed
 * "<essay type>@<university id>". Supplement prompts change every year, so the
 * student pastes the exact wording from the university into the document. */
import { detectPlatform, type PlatformData, type PlatformUniversity } from "./application-platforms";

export type UniversityEssay = {
  /** Writing desk document id. */
  doc: string;
  type: string;
  shared: boolean;
  /** true required, false not listed by the platform, null unknown. */
  required: boolean | null;
};
export type UniversityEssays = { university: PlatformUniversity; platform: string; essays: UniversityEssay[] };

export const docType = (doc: string) => doc.split("@")[0];
export const docUniversity = (doc: string) => doc.split("@")[1] || "";

export function universityEssays(u: PlatformUniversity, data?: PlatformData): UniversityEssays {
  const match = detectPlatform(u, data);
  const own = (type: string, required: boolean | null): UniversityEssay => ({ doc: `${type}@${u.id}`, type, shared: false, required });
  const shared = (type: string): UniversityEssay => ({ doc: type, type, shared: true, required: true });
  const kind = match.platform.kind;
  let essays: UniversityEssay[];
  if (kind === "common-app") {
    const flags = data?.common_app[u.id];
    essays = [shared("common_app"), shared("activities"), own("why_us", flags ? flags.essay : null)];
  } else if (kind === "ucas") essays = [shared("ucas")];
  else if (kind === "europe") essays = [own("motivation", true)];
  else if (u.country_code === "US") essays = [own("short_answer", null), own("why_us", null)];
  else essays = [own("statement", true)];
  return { university: u, platform: match.platform.id === "direct" ? match.portal || "" : match.platform.name, essays };
}
