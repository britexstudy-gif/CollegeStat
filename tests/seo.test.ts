import { test } from "node:test";
import assert from "node:assert/strict";
import { absoluteURL, clip, indexable, pageMetadata, siteURL } from "../lib/seo";
import robots from "../app/robots";

function withSiteURL(value: string | undefined, run: () => void) {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;
  if (value === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = value;
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previous;
  }
}

test("previews without a production origin are kept out of search", () => {
  withSiteURL(undefined, () => {
    assert.equal(indexable(), false);
    assert.deepEqual(robots().rules, { userAgent: "*", disallow: "/" });
  });
});

test("production origin drives canonical URLs and the sitemap link", () => {
  withSiteURL("https://collegestat.example/", () => {
    assert.equal(siteURL(), "https://collegestat.example");
    assert.equal(absoluteURL("/university/mit"), "https://collegestat.example/university/mit");
    assert.equal(robots().sitemap, "https://collegestat.example/sitemap.xml");
  });
});

test("page metadata keeps canonical, social cards and description length in sync", () => {
  const meta = pageMetadata({ title: "Rankings", path: "/rankings", description: "word ".repeat(80) });
  assert.equal(meta.alternates?.canonical, "/rankings");
  assert.ok(String(meta.description).length <= 161);
  assert.equal(meta.openGraph?.url, "/rankings");
  assert.deepEqual(meta.openGraph?.images, [{ url: "/og-default.jpg", width: 1200, height: 630, alt: "CollegeStat — university research with evidence" }]);
  assert.equal(clip("short"), "short");
});
