import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  withReviewedCampusMedia,
  reviewedCampusMedia,
} from "../lib/reviewed-campus-media";
import { normalizeUniversity } from "../lib/domain";
import reviewed from "../data/published/reviewed-campus-media-oct10.json";
test("six exact institution photographs retain licence, historical date and bounded cached receipts", async () => {
  assert.equal(reviewed.records.length, 6);
  assert.equal(new Set(reviewed.records.map((r) => r.university_id)).size, 6);
  for (const row of reviewed.records) {
    assert.equal(row.kind, "campus");
    assert.equal(row.verification_status, "verified");
    assert.ok(row.capture_date);
    assert.ok(row.creator);
    assert.match(
      row.source_url,
      /^https:\/\/commons.wikimedia.org\/wiki\/File:/,
    );
    assert.match(row.license_url, /^https:\/\/creativecommons.org\//);
    assert.ok(row.reuse_permitted);
    assert.equal(row.width, 1600);
    assert.ok(row.height > 0);
    const bytes = await readFile(
      new URL("../public" + row.url, import.meta.url),
    );
    assert.equal(createHash("sha256").update(bytes).digest("hex"), row.sha256);
    assert.ok(bytes.length < 2_000_000);
  }
});
test("reviewed photographs cannot bleed across institutions or duplicate source assets", () => {
  const row = reviewedCampusMedia[0];
  assert.deepEqual(withReviewedCampusMedia("unknown", []), []);
  assert.deepEqual(withReviewedCampusMedia(undefined, []), []);
  const once = withReviewedCampusMedia(row.university_id, []);
  assert.equal(once.length, 1);
  assert.deepEqual(withReviewedCampusMedia(row.university_id, once), once);
  const differentURL = { ...row, url: "/different-derivative.webp" };
  assert.deepEqual(withReviewedCampusMedia(row.university_id, [differentURL]), [
    differentURL,
  ]);
  const uni = normalizeUniversity({ id: row.university_id, media: [] });
  assert.equal(uni.media[0].source_url, row.source_url);
  assert.equal(uni.media[0].year, null);
});
