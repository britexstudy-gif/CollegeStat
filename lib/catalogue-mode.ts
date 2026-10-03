/** Account configuration never changes which public catalogue is selected. */
export function usesHostedCatalogue(
  source = process.env.NEXT_PUBLIC_CATALOGUE_SOURCE,
): boolean {
  return source === "supabase";
}
