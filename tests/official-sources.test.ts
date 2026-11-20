import assert from "node:assert/strict";
import test from "node:test";
import snapshot from "../data/published/external-articles-oct15.json";
import {
  articleDate,
  articleTopic,
  articleTopics,
  externalArticles,
  featuredArticles,
  getArticle,
  matchingArticles,
} from "../lib/article-library";
import {
  articleDestination,
  getSource,
  legacySourceLinks,
} from "../lib/source-library";
import { workspaceHref } from "../lib/workspace-navigation";
import Reader from "../app/articles/[id]/page";
import DashboardReader from "../app/dashboard/library/articles/[id]/page";
import LegacyDashboardReader from "../app/dashboard/library/resources/[id]/page";

test("the reading library contains genuine publisher article metadata without CollegeStat content or images", () => {
  assert.equal(externalArticles.length, snapshot.records.length);
  assert.ok(externalArticles.length >= 14);
  assert.equal(
    new Set(externalArticles.map((row) => row.slug)).size,
    externalArticles.length,
  );
  assert.equal(
    new Set(externalArticles.map((row) => row.url)).size,
    externalArticles.length,
  );
  for (const record of externalArticles) {
    const url = new URL(record.url);
    assert.equal(url.protocol, "https:", record.slug);
    assert.ok(!/collegestat/i.test(url.hostname), record.slug);
    assert.ok(url.pathname.length > 1, record.slug);
    assert.ok(record.title && record.provider, record.slug);
    assert.ok(!/collegestat/i.test(record.provider), record.slug);
    assert.equal(record.contentImported, false, record.slug);
    assert.ok(record.checkedAt <= snapshot.checkedAt, record.slug);
    // A short CollegeStat-written description is allowed; publisher text is not.
    if ("summary" in record)
      assert.ok(String(record.summary).length <= 400, record.slug);
    for (const field of [
      "image",
      "images",
      "body",
      "content",
      "steps",
      "readTime",
      "read_time",
    ])
      assert.ok(!(field in record), `${record.slug}: ${field}`);
    assert.ok(
      articleTopics.some(({ id }) => id === record.category),
      record.slug,
    );
    if (record.publishedAt) {
      assert.match(record.publishedAt, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(record.publishedAt <= record.checkedAt, record.slug);
    }
  }
});

test("featured articles are three original articles from the active collection", () => {
  assert.equal(featuredArticles.length, 3);
  for (const record of featuredArticles) {
    assert.equal(getArticle(record.slug), record);
    assert.equal(articleDestination(record.slug), record.url);
  }
});

test("article search combines topic and author or publisher without losing genuine records", () => {
  assert.deepEqual(
    matchingArticles("applications", "  PETERSON  ").map((row) => row.slug),
    ["mit-college-essay", "mit-applying-sideways"],
  );
  const tufts = matchingArticles("choosing-university", "tufts");
  assert.ok(tufts.length >= 2);
  assert.ok(tufts.every((row) => row.category === "choosing-university"));
  assert.equal(
    matchingArticles("not-a-topic", "").length,
    externalArticles.length,
  );
  assert.equal(
    matchingArticles("all", "a term that cannot possibly occur").length,
    0,
  );
  assert.equal(articleTopic(null), "all");
});

test("missing publication dates remain missing instead of displaying the collection review date", () => {
  const undated = getArticle("tufts-essay-writing-tips")!;
  assert.equal(undated.publishedAt, null);
  assert.equal(articleDate(undated), null);
  assert.equal(articleDate(getArticle("mit-college-essay")!), "30 Jul 2012");
  assert.equal(getArticle("unknown"), undefined);
});

test("retired guide links retain only redirect metadata and resolve official publisher pages", () => {
  assert.ok(legacySourceLinks.length >= 10);
  for (const record of legacySourceLinks) {
    assert.deepEqual(Object.keys(record).sort(), [
      "provider",
      "slug",
      "title",
      "url",
    ]);
    assert.ok(record.url.startsWith("https://"));
    assert.equal(articleDestination(record.slug), record.url);
  }
  assert.equal(getSource("unknown"), undefined);
  assert.equal(articleDestination("unknown"), undefined);
});

test("retired outside articles and legacy guides redirect to the full originals", async () => {
  // Outside articles we still list get a summary page; ones we retired keep their old links working.
  for (const slug of ["harvard-first-year-advice", "uk-undergraduate"]) {
    const destination = articleDestination(slug)!;
    for (const route of [Reader, DashboardReader, LegacyDashboardReader]) {
      await assert.rejects(
        route({ params: Promise.resolve({ id: slug }) }),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal(
            (error as Error & { digest: string }).digest,
            `NEXT_REDIRECT;replace;${destination};307;`,
          );
          return true;
        },
      );
    }
  }
  await assert.rejects(
    Reader({ params: Promise.resolve({ id: "unknown" }) }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(
        (error as Error & { digest: string }).digest,
        "NEXT_HTTP_ERROR_FALLBACK;404",
      );
      return true;
    },
  );
});

test("article index and application tools keep workspace navigation", () => {
  assert.equal(workspaceHref("/articles", true), "/dashboard/library/articles");
  assert.equal(
    workspaceHref("/resources?section=application&university=example", true),
    "/dashboard/library/resources?section=application&university=example",
  );
  assert.equal(workspaceHref("/articles", false), "/articles");
});
