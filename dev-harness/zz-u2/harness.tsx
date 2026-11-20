"use client";
// TEMPORARY screenshot harness (u2). Delete before shipping.
import UniversityPage from "@/pages-ui/university";
import { ChanceProfileProvider } from "@/components/college/admission-chip";
import type { University } from "@/lib/domain";
import type { ProfileExtras } from "@/server/profile-extras";

const prefs = {
  intake: { english_test: "ielts", english_score: 6.5, details: { sat_score: "1450" } },
  ai_personalize: {
    version: 1, created_at: "2026-11-15T09:00:00Z", language: "en", summary: "", country_mix: [], gaps: [], actions: [],
    universities: [
      { slug: "mit", tier: "reach", reason: "Your olympiad result fits MIT’s maths focus, but the admit rate is under 5% for everyone." },
      { slug: "tum", tier: "target", reason: "Strong match for computer science; low tuition fits your budget." },
    ],
  },
};
export default function Harness({ slug, university, extras }: { slug: string; university: University; extras: ProfileExtras }) {
  return (
    <ChanceProfileProvider value={{ sat: 1450, ielts: 6.5, budget: 15000 }}>
      <UniversityPage slug={slug} initialUniversity={university} extras={extras} viewer={{ prefs }} />
    </ChanceProfileProvider>
  );
}
