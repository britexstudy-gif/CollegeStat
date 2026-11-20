/** Reproduce the three reviewed campus display assets without publishing DB rows. */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "../..");
const manifestPath = path.join(root, "data/published/reviewed-scholarship-campus-media.json");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
for (const record of manifest.records) {
  if (!record.reuse_permitted || record.verification_status !== "verified" || !record.creator || !record.license_url)
    throw new Error("Media must have verified reuse permission and attribution.");
  const url = new URL(record.remote_url);
  if (!['thumb.wikimedia.org', 'upload.wikimedia.org'].includes(url.hostname)) throw new Error("Unreviewed media host.");
  const target = path.join(root, "public", record.url);
  const existing = await fs.readFile(target).catch(() => null);
  if (existing && createHash("sha256").update(existing).digest("hex") === record.sha256) continue;
  const response = await fetch(url, { headers: { "User-Agent": "CollegeStat/1.0 attributed media cache" }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Media request failed: ${response.status}`);
  const input = Buffer.from(await response.arrayBuffer());
  if (input.length > 5_000_000) throw new Error("Media exceeds the bounded asset size.");
  await fs.mkdir(path.dirname(target), { recursive: true });
  const info = await sharp(input, { limitInputPixels: 30_000_000 }).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 85 }).toFile(target);
  record.width = info.width;
  record.height = info.height;
  record.sha256 = createHash("sha256").update(await fs.readFile(target)).digest("hex");
  console.log(`${record.university_name}: ${info.width} × ${info.height}, ${Math.round(info.size / 1024)} KB`);
}
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
await fs.writeFile(path.join(root, "public/images/scholarships/ATTRIBUTION.md"), "# Campus photographs\n\n" + manifest.records.map(r => `- ${r.university_name}: [${r.source_record_id}](${r.source_url}) — ${r.creator}, [${r.license}](${r.license_url}). Resized, compressed and displayed with a crop. The derivative retains this licence.\n`).join(""));
