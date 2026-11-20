/** Account and external reading pages render without public discovery cards.
 * This is a loading hint, never an authentication or authorization decision.
 */
export function defersPublicCatalogue(pathname: string): boolean {
  return (
    /^\/(?:auth|staff|admin|dashboard|articles)(?:\/|$)/.test(pathname) ||
    ["/dashboard", "/profile", "/saved"].includes(pathname)
  );
}
