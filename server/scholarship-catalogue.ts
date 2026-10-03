import rows from "@/data/published/scholarships-current.json";
import type { Scholarship } from "@/lib/domain";
export const currentScholarships = rows as Scholarship[];
export function scholarshipsForUniversity(id: string) {
  return currentScholarships.filter(award => award.university_scholarships.some(link => link.university_id === id));
}
