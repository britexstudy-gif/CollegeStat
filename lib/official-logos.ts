import records from "@/data/published/official-logos.json";

export function officialLogo(website: string | null | undefined) {
  try {
    const host = new URL(website || "").hostname;
    return records.find(
      (r) => host === r.domain || host.endsWith("." + r.domain),
    );
  } catch {
    return undefined;
  }
}
