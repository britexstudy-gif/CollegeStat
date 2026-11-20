"use client";
const key = "collegestat-recent-universities";
function readRecentUniversities(): string[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(data)
      ? [
          ...new Set(
            data.filter(
              (id): id is string =>
                typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id),
            ),
          ),
        ].slice(0, 8)
      : [];
  } catch {
    return [];
  }
}
export function rememberUniversity(id: string) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify(
        [id, ...readRecentUniversities().filter((v) => v !== id)].slice(0, 8),
      ),
    );
  } catch {}
}
