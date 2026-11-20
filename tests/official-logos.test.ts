import assert from "node:assert/strict";
import test from "node:test";
import { officialLogo } from "../lib/official-logos";

test("installed marks belong to the exact institution, not federated colleges", () => {
  const toronto = officialLogo("https://www.utoronto.ca/");
  assert.ok(toronto?.local.startsWith("/logos/"));
  assert.equal(officialLogo("https://utoronto.ca/"), toronto);
  assert.equal(officialLogo("https://trinity.utoronto.ca/"), undefined);
  assert.equal(officialLogo("https://utoronto.ca.example.com/"), undefined);
});

test("invalid and credential-bearing institution URLs cannot assign marks", () => {
  assert.equal(officialLogo("https://evil.example@utoronto.ca/"), undefined);
  assert.equal(officialLogo("ftp://utoronto.ca/"), undefined);
  assert.equal(officialLogo(null), undefined);
});
