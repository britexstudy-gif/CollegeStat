import assert from "node:assert/strict";
import test from "node:test";
import {
  workspaceHref,
  workspaceDestination,
  workspaceSectionHref,
  profileTabHref,
} from "../lib/workspace-navigation";
import { defersPublicCatalogue } from "../lib/page-bootstrap";

test("workspace discovery preserves filters, comparison IDs, repeated query keys and hash", () => {
  for (const [source, destination] of [
    [
      "/universities?country=UZ&country=US&sort=rank&page=2#results",
      "/dashboard/universities?country=UZ&country=US&sort=rank&page=2#results",
    ],
    [
      "/university/mit?tab=Admissions&from=compare#requirements",
      "/dashboard/university/mit?tab=Admissions&from=compare#requirements",
    ],
    [
      "/rankings?system=ARWU&year=2026",
      "/dashboard/rankings?system=ARWU&year=2026",
    ],
    [
      "/compare?ids=one,two&share=abc",
      "/dashboard/compare?ids=one,two&share=abc",
    ],
    [
      "/resources/funding?section=application",
      "/dashboard/library/resources/funding?section=application",
    ],
    ["/scholarship/award", "/dashboard/library/scholarship/award"],
    ["/scholarships/award", "/dashboard/library/scholarship/award"],
    ["/profile", "/dashboard/profile"],
  ]) {
    assert.equal(workspaceHref(source, "/dashboard/prepare"), destination);
    assert.equal(workspaceHref(source, true), destination);
    assert.equal(workspaceHref(source, "/"), source);
  }
});

test("workspace mapping does not change external, auth, staff or lookalike paths", () => {
  for (const path of [
    "https://official.example/universities",
    "//official.example/rankings",
    "#sources",
    "/auth/sign-in?next=%2Fdashboard",
    "/staff/college-console",
    "/rankings-extra",
    "/universities-example",
    "/resources-extra",
    "/dashboard/rankings?system=QS",
    "/terms",
    "/support",
  ]) {
    assert.equal(workspaceHref(path, true), path);
    assert.equal(workspaceHref(path, "/dashboard-fake"), path);
  }
});

test("all eleven existing section aliases retain their workspace destination", () => {
  const sections: Record<string, string> = {
    Overview: "Home",
    Practice: "Prepare",
    Writing: "Library",
    Guide: "Library",
    Universities: "Universities",
    Scholarships: "Library",
    Comparisons: "Universities",
    Searches: "Library",
    History: "Library",
    Checklist: "Home",
    Lists: "Library",
  };
  for (const [section, destination] of Object.entries(sections)) {
    assert.equal(workspaceDestination("/dashboard", section), destination);
    const href = workspaceSectionHref(section);
    assert.equal(defersPublicCatalogue(href.split("?")[0]), true);
    if (section !== "Overview")
      assert.equal(
        new URL(href, "https://example.test").searchParams.get("section"),
        section,
      );
  }
  assert.equal(
    workspaceDestination("/dashboard/university/mit", "Writing"),
    "Universities",
  );
  assert.equal(
    workspaceDestination("/dashboard/library/resources/funding", "Practice"),
    "Library",
  );
  assert.equal(
    workspaceDestination("/dashboard/profile", "Practice"),
    "Profile",
  );
  assert.equal(
    workspaceSectionHref("Practice", "reading"),
    "/dashboard/prepare?section=Practice&track=reading",
  );
  assert.equal(
    workspaceSectionHref("Checklist"),
    "/dashboard?section=Checklist",
  );
  assert.equal(
    workspaceDestination("/dashboard/prepare", "Writing"),
    "Library",
  );
  assert.equal(workspaceDestination("/dashboard/prepare", "Checklist"), "Home");
});

test("profile tabs retain surrounding query context and browser hash", () => {
  assert.equal(
    profileTabHref(
      "/dashboard/university/mit",
      "tab=Overview&from=compare&ids=a%2Cb",
      "Costs & funding",
      "#details",
    ),
    "/dashboard/university/mit?tab=Costs+%26+funding&from=compare&ids=a%2Cb#details",
  );
  assert.equal(
    profileTabHref(
      "/university/mit",
      "tab=Overview&view=research&from=compare",
      "Academics",
    ),
    "/university/mit?tab=Academics&from=compare",
  );
});
