/** Name as shown to students. Some catalogue names carry the institution's
 * acronym joined to the real name ("ETHZ - ETH Zurich", "University of Southern
 * Denmark - SDU"). The data stays as it is; this helper cleans it for display. */
const acronym = /^(?=(?:.*[\p{Lu}\d]){2})[\p{L}\d.&]{2,8}$/u;

export function displayName(name: string): string {
  const parts = name.split(/\s+[-–—]\s+/);
  if (parts.length !== 2) return name;
  const [head, tail] = parts;
  if (acronym.test(head) && tail.trim().split(/\s+/).length >= 2) return tail.trim();
  if (acronym.test(tail) && head.trim().split(/\s+/).length >= 2) return head.trim();
  return name;
}
