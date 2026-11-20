import records from "@/data/published/official-logos.json";

export function officialLogo(website: string | null | undefined) {
  try {
    const url = new URL(website || "");
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return undefined;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    // Federated colleges and branch campuses need their own mark evidence.
    // A parent university's domain suffix is not an identity match.
    return records.find((r) => {
      const domain = r.domain.toLowerCase().replace(/^www\./, '');
      const sourceHost = new URL(r.source).hostname.toLowerCase().replace(/^www\./, '');
      return host === domain || (host === sourceHost && sourceHost.endsWith('.' + domain));
    });
  } catch {
    return undefined;
  }
}
