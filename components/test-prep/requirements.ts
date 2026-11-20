"use client";
import { useMemo } from "react";
import { requirementFits } from "@/lib/prep-plan";
import { countryName } from "@/lib/domain";
import { useCollege } from "@/components/college/provider";

export type SchoolRequirement = { id: string; name: string; slug: string; country: string; minimum: number; varies: boolean; source?: string };

/** The student's saved universities that publish a minimum for this exam. */
export function useShortlistRequirements(slug: string): SchoolRequirement[] {
  const college = useCollege();
  const universities = college?.universities;
  const saved = college?.saved;
  return useMemo(() => {
    if (!universities || !saved?.length) return [];
    const ids = new Set(saved);
    return universities.flatMap((u): SchoolRequirement[] => {
      if (!ids.has(u.id)) return [];
      const rows = u.requirements.filter((r) => requirementFits(slug, r));
      if (!rows.length) return [];
      const minima = rows.map((r) => r.minimum as number);
      const low = Math.min(...minima);
      const row = rows.find((r) => r.minimum === low)!;
      return [
        { id: u.id, name: u.name, slug: u.slug, country: countryName(u.country_code), minimum: low, varies: Math.max(...minima) !== low, source: row.source_url || undefined },
      ];
    });
  }, [universities, saved, slug]);
}
