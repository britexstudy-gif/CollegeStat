/** Public URL of the official site icon downloaded for a university.
 * `ext` is the format code stored in data/published/auto-logos.json
 * (s = svg, i = ico, anything else = png). */
export function autoLogoURL(id: string, ext: string | undefined): string | null {
  return ext ? `/logos/auto/${id}.${ext === "s" ? "svg" : ext === "i" ? "ico" : "png"}` : null;
}
