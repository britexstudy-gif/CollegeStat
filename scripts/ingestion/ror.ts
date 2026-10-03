import { z } from "zod";
// ROR v2.1: retain identity/location only. Education does not imply a degree,
// admissions policy, accreditation, or a campus-level coordinate.
const recordSchema = z.object({
  id: z.string().regex(/^https:\/\/ror\.org\/0[a-z0-9]{8}$/),
  status: z.enum(["active", "inactive", "withdrawn"]),
  types: z.array(z.string()),
  names: z.array(
    z.object({
      value: z.string().min(1).max(500),
      types: z.array(z.string()),
      lang: z.string().nullable(),
    }),
  ),
  links: z.array(z.object({ type: z.string(), value: z.string().url() })),
  locations: z.array(
    z.object({
      geonames_details: z.object({
        name: z.string(),
        country_code: z.string().regex(/^[A-Z]{2}$/),
        continent_name: z.string().optional(),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      }),
    }),
  ),
  admin: z.object({
    last_modified: z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      schema_version: z.string(),
    }),
  }),
});
export function normalizeROR(input: unknown, country?: string) {
  const r = recordSchema.parse(input);
  if (r.status !== "active" || !r.types.includes("education")) return null;
  // Ambiguous multi-location records stay out of this first import adapter.
  if (r.locations.length !== 1) return null;
  const loc = r.locations[0].geonames_details;
  if (country && loc.country_code !== country) return null;
  const name = r.names.find((n) => n.types.includes("ror_display"))?.value;
  if (!name) throw new Error("ror_display_name_missing");
  const website =
    r.links.find((l) => l.type === "website" && l.value.startsWith("https://"))
      ?.value || null;
  return {
    external_id: r.id,
    source_url: r.id,
    name,
    country_code: loc.country_code,
    proposed: {
      name,
      short_name:
        r.names.find((n) => n.types.includes("acronym"))?.value || null,
      country_code: loc.country_code,
      city: loc.name,
      region: loc.continent_name || null,
      website,
      // GeoNames city centroid must not be presented as a university's location.
      latitude: null,
      longitude: null,
      aliases: [...new Set(r.names.map((n) => n.value))],
    },
    source_modified_at: r.admin.last_modified.date,
    source_metadata: {
      schema_version: r.admin.last_modified.schema_version,
      location_precision: "city",
      geonames: loc,
      license: "CC0-1.0",
    },
  };
}
