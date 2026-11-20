/** Reconcile reviewed Commons candidates, cache licensed derivatives, preserve receipts. */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createHash } from "node:crypto";
const root = path.resolve(import.meta.dirname, "../..");
const selected = new Set([
  "definite-waterloo-campus",
  "definite-berkeley-sather",
  "definite-upenn-campus",
  "definite-mcgill-downtown",
  "definite-tokyo-yasuda",
  "definite-nus-utown",
]);
const candidates = JSON.parse(
  await fs.readFile(
    path.join(root, "data/review/campus-media-candidates-oct10.json"),
    "utf8",
  ),
).definite_candidates.filter((r) => selected.has(r.candidate_key));
const expected = 6;
if (candidates.length !== expected)
  throw new Error(
    "Review selection differs from six independently reviewed file pages: " +
      candidates.map((r) => r.candidate_key).join(","),
  );
const directory = JSON.parse(
  await fs.readFile(
    path.join(root, "data/published/global-directory.json"),
    "utf8",
  ),
);
const universities = Array.isArray(directory)
  ? directory
  : directory.universities;
const reviewed = [];
for (const candidate of candidates) {
  const identity = universities.find((r) => r.id === candidate.university_id);
  if (!identity || identity.country_code !== candidate.country_code)
    throw new Error("Institution identity mismatch.");
  const title = decodeURIComponent(
    new URL(candidate.file_or_source_url).pathname.replace("/wiki/", ""),
  );
  const api = new URL("https://commons.wikimedia.org/w/api.php");
  for (const [k, v] of Object.entries({
    action: "query",
    format: "json",
    prop: "imageinfo",
    iiprop: "url|size|timestamp|extmetadata",
    iiurlwidth: "1600",
    titles: title,
  }))
    api.searchParams.set(k, v);
  const response = await fetch(api, {
    headers: { "User-Agent": "CollegeStat/1.0 licensed campus review" },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error("Commons evidence unavailable: " + response.status);
  const receipt = await response.json();
  const info = Object.values(receipt.query?.pages || {})[0]?.imageinfo?.[0];
  if (!info?.thumburl || !info?.extmetadata?.LicenseUrl?.value)
    throw new Error("Missing file licence or derivative URL.");
  const licenseURL = info.extmetadata.LicenseUrl.value
    .replace(/^http:/, "https:")
    .replace(/\/deed\.[a-z-]+$/i, "")
    .replace(/\/$/, "");
  if (licenseURL !== candidate.license_url.replace(/\/$/, ""))
    throw new Error("Reviewed licence changed: " + title);
  const url = new URL(info.thumburl);
  if (!["upload.wikimedia.org", "thumb.wikimedia.org"].includes(url.hostname))
    throw new Error("Unreviewed asset origin.");
  const now = new Date().toISOString();
  const record = {
    ...candidate,
    id: "display-campus-" + candidate.university_id,
    verification_status: "verified",
    verified_at: now,
    retrieved_at: now,
    url: "/images/campus-reviewed/" + candidate.candidate_key + ".webp",
    remote_url: info.thumburl,
    original_url: info.url,
    source_url: candidate.file_or_source_url,
    source_record_id: title,
    scope:
      "Documentary campus photograph; capture date is historical, not a claim about current facilities.",
    alt: title
      .replace(/^File:/, "")
      .replace(/_/g, " ")
      .replace(/\.(jpg|jpeg|png)$/i, ""),
    original_width: info.width,
    original_height: info.height,
    publication_date: info.timestamp,
    evidence: {
      imageinfo_endpoint: api.toString(),
      artist_html: info.extmetadata.Artist?.value,
      license_name: info.extmetadata.LicenseShortName?.value,
      capture_date: candidate.capture_date,
      changes:
        "Resized and compressed to WebP; display may crop. Licence preserved.",
    },
  };
  const asset = await fetch(url, {
    headers: { "User-Agent": "CollegeStat/1.0 attributed media cache" },
    signal: AbortSignal.timeout(30000),
  });
  if (!asset.ok) throw new Error("Image unavailable: " + asset.status);
  const chunks = [];
  let bytes = 0;
  const reader = asset.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 5_000_000) {
      await reader.cancel();
      throw new Error("Image exceeds bounded download size.");
    }
    chunks.push(value);
  }
  const input = Buffer.concat(chunks);
  const target = path.join(root, "public", record.url);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const output = await sharp(input, { limitInputPixels: 30_000_000 })
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  await fs.writeFile(target, output.data);
  Object.assign(record, {
    width: output.info.width,
    height: output.info.height,
    sha256: createHash("sha256").update(output.data).digest("hex"),
    download_state: "cached",
  });
  reviewed.push(record);
  console.log(
    candidate.university_name +
      ": " +
      record.width +
      " × " +
      record.height +
      " (" +
      Math.round(output.data.length / 1024) +
      " KB)",
  );
  await fs.mkdir(path.join(root, "outputs/campus-media-oct10"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(
      root,
      "outputs/campus-media-oct10",
      candidate.candidate_key + ".json",
    ),
    JSON.stringify(receipt, null, 2) + "\n",
  );
}
await fs.writeFile(
  path.join(root, "data/published/reviewed-campus-media-oct10.json"),
  JSON.stringify(
    {
      purpose:
        "Exact institution display assets; no duplicate university or hosted media rows. Six independently reviewed Commons file pages.",
      records: reviewed,
    },
    null,
    2,
  ) + "\n",
);
await fs.writeFile(
  path.join(root, "public/images/campus-reviewed/ATTRIBUTION.md"),
  "# Licensed campus photographs\n\n" +
    reviewed
      .map(
        (r) =>
          `- ${r.university_name}: [${r.source_record_id}](${r.source_url}) — ${r.creator}, [${r.license}](${r.license_url}). Capture date: ${r.capture_date || "unknown"}. Resized/compressed, may be cropped. Derivative licence preserved.\n`,
      )
      .join(""),
);
