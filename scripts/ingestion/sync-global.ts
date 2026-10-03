/** Explicit deployment step: dry-run by default; --apply writes to configured Supabase. */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { globalCatalogue } from "../../server/global-catalogue";
import { referenceCatalogue } from "../../server/catalogue";
const referenceIds = new Set(referenceCatalogue.map((u) => u.id));
const additions = globalCatalogue.filter((u) => !referenceIds.has(u.id));
const uuid = (key: string) => {
  const h = createHash("sha256")
    .update("collegestat:" + key)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const universities = additions.map((u) => ({
  id: u.id,
  slug: u.slug,
  name: u.name,
  short_name: u.short_name,
  country_code: u.country_code,
  city: u.city,
  region: u.region,
  website: u.website,
  university_type: u.university_type,
  description: u.description,
  latitude: u.latitude,
  longitude: u.longitude,
  published: true,
  reference_url: u.reference_url,
  reference_retrieved_at: u.reference_retrieved_at,
  admissions_url: u.admissions_url?.startsWith("https://")
    ? u.admissions_url
    : null,
  imported_records: u.imported_records || [],
  application_url: u.application_url,
  financial_aid_url: u.financial_aid_url,
  net_price_url: u.net_price_url,
  address: u.address,
  phone: u.phone,
  founded_year: u.founded_year,
  identity_release: u.identity_release,
  identifiers: u.identifiers || {},
  aliases: u.aliases || [],
}));
const costs = additions.flatMap((u) =>
  u.costs.map((c) => {
    const row = { ...c };
    delete row.data_sources;
    return { ...row, id: uuid(c.id) };
  }),
);
const admissions = additions.flatMap((u) =>
  u.admissions.map((a) => {
    const row = { ...a };
    delete row.data_sources;
    return { ...row, id: uuid(a.id) };
  }),
);
console.log(
  JSON.stringify({
    mode: process.argv.includes("--apply") ? "apply" : "dry-run",
    universities: universities.length,
    costs: costs.length,
    admissions: admissions.length,
    existingReferenceProfiles: "preserved",
  }),
);
if (process.argv.includes("--apply")) {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.startsWith("https://") || !key)
    throw new Error(
      "Set server-side SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const source = costs.length
    ? additions.find((u) => u.costs.length)!.costs[0].data_sources
    : null;
  if (source) {
    const { error } = await db.from("data_sources").upsert(source);
    if (error) throw new Error("Could not install IPEDS source: " + error.code);
  }
  const jobs: [string, Record<string, unknown>[]][] = [
    ["universities", universities],
    ["costs", costs],
    ["admissions", admissions],
  ];
  for (const [table, records] of jobs) {
    for (let i = 0; i < records.length; i += 100) {
      const { error } = await db
        .from(table)
        .upsert(records.slice(i, i + 100), {
          onConflict: "id",
          ignoreDuplicates: true,
        });
      if (error)
        throw new Error(
          `${table} batch ${i / 100 + 1} failed (${error.code}). Apply migrations first.`,
        );
    }
    console.log(
      `Installed ${records.length} ${table} records; existing IDs preserved.`,
    );
  }
}
