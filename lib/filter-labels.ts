import { countryName } from "./domain";

/** UI labels describe the selection instead of exposing URL/schema field names. */
export function filterLabel(key: string, value: unknown) {
  const text = String(value);
  switch (key) {
    case "q":
      return `Search: “${text}”`;
    case "country":
      return countryName(text);
    case "region":
      return `Region: ${text}`;
    case "city":
      return `City: ${text}`;
    case "field":
      return `Subject: ${text}`;
    case "degree":
      return `Degree: ${text}`;
    case "language":
      return `Teaching language: ${text}`;
    case "type":
      return `University type: ${text}`;
    case "cost_max":
      return `Annual tuition: up to $${Number(value).toLocaleString("en-US")}`;
    case "admission_min":
      return `Acceptance rate: at least ${text}%`;
    case "admission_max":
      return `Acceptance rate: up to ${text}%`;
    case "ielts_max":
      return `IELTS minimum: ${text} or lower`;
    case "intl_min":
      return `International students: at least ${text}%`;
    case "graduation_min":
      return `Graduation rate: at least ${text}%`;
    case "aid":
      return "Aid recipients reported";
    case "scholarships":
      return "Verified scholarships linked";
    default:
      return key.replaceAll("_", " ") + ": " + text;
  }
}
