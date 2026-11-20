"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import { WorkspaceLink as Link } from "@/components/college/workspace-link";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ClipboardList,
  Globe2,
  Search,
  Bookmark,
  ArrowRight,
} from "lucide-react";
import {
  learningResources,
  rehearsalTasks,
  type ApplicationRehearsal,
} from "@/lib/learning-resources";
import {
  admissionPlannerHref,
  admissionPlannerSection,
  decodeRehearsalSession,
  prepareRehearsalOwner,
  type AdmissionPlannerSection,
} from "@/lib/resource-library-state";
import { refreshLearningResources } from "@/services/learning-resources";
import { useCollege } from "./provider";
import {
  PlanningAccountChangedError,
  savePlanningTasks,
} from "@/services/planning";
import { toast } from "sonner";

export type { AdmissionPlannerSection } from "@/lib/resource-library-state";
const plannerTabs = [
  { id: "destinations", label: "Qualifications by destination", icon: Globe2 },
  { id: "application", label: "Application rehearsal", icon: ClipboardList },
  { id: "practice", label: "Optional study resources", icon: BookOpen },
] as const;
export function AdmissionPlanner({
  initialSection = "destinations",
  universitySlug = "",
}: {
  initialSection?: AdmissionPlannerSection;
  universitySlug?: string;
}) {
  const account = useCollege();
  const [, setOwnerRevision] = useState(0);
  useEffect(
    () => account.accountScope.subscribe(() => setOwnerRevision((n) => n + 1)),
    [account.accountScope],
  );
  const owner = account.accountScope.capture();
  return (
    <OwnedAdmissionPlanner
      key={`${owner.owner || "anonymous"}:${owner.generation}`}
      initialSection={initialSection}
      universitySlug={universitySlug}
    />
  );
}
function OwnedAdmissionPlanner({
  initialSection,
  universitySlug,
}: {
  initialSection: AdmissionPlannerSection;
  universitySlug: string;
}) {
  const account = useCollege();
  const params = useSearchParams();
  const requestedSection = params.get("section");
  const tabId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const mounted = useRef(true);
  const operationBusy = useRef(false);
  const [ownedAccount] = useState(() => account.accountScope.capture());
  const [section, setSection] = useState(initialSection);
  const [interactive, setInteractive] = useState(false);
  const [resources, setResources] = useState(learningResources);
  const [refreshing, setRefreshing] = useState(true);
  const [resourceError, setResourceError] = useState("");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [resourceSource, setResourceSource] = useState<"installed" | "hosted">(
    "installed",
  );
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("All");
  const [destination, setDestination] = useState("us-undergraduate");
  const [saving, setSaving] = useState(false);
  const [rehearsalReady, setRehearsalReady] = useState(false);
  const [rehearsalStorageError, setRehearsalStorageError] = useState("");
  const [draft, setDraft] = useState<ApplicationRehearsal>({
    destination: "us-undergraduate",
    university: "",
    program: "",
    qualification: "",
    intake: "",
    completed: [],
  });
  const [completedSource, setCompletedSource] = useState(() =>
    JSON.stringify(
      learningResources.find((r) => r.slug === "us-undergraduate")?.steps || [],
    ),
  );
  const guides = resources.filter((r) => r.kind === "destination");
  const guide = guides.find((r) => r.slug === destination) || guides[0];
  const guideSteps = JSON.stringify(guide?.steps || []);
  const currentDraft = completedSource === guideSteps ? draft : { ...draft, completed: [] };
  const rehearsalPayload = JSON.stringify({ draft: currentDraft, source_steps: guide?.steps || [] });
  // Updating the URL, including browser Back/Forward, changes the view only.
  // The account-scoped tab session below preserves a rehearsal across remounts.
  useEffect(() => {
    setSection(admissionPlannerSection(requestedSection || initialSection));
  }, [requestedSection, initialSection]);
  useEffect(() => {
    const restore = () =>
      setSection(
        admissionPlannerSection(
          new URLSearchParams(window.location.search).get("section"),
        ),
      );
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    mounted.current = true;
    setInteractive(true);
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const prepareOwner = (owner: string | null) => {
      try {
        prepareRehearsalOwner(sessionStorage, owner);
      } catch {
        /* Device storage is optional. */
      }
    };
    const unsubscribe = account.accountScope.subscribe((token) => {
      prepareOwner(token.owner);
      if (!account.accountScope.isCurrent(ownedAccount))
        setRehearsalReady(false);
    });
    return unsubscribe;
  }, [account.accountScope, ownedAccount]);
  useEffect(() => {
    if (
      !account.authReady ||
      rehearsalReady ||
      !account.accountScope.isCurrent(ownedAccount)
    )
      return;
    try {
      const key = prepareRehearsalOwner(sessionStorage, ownedAccount.owner);
      const restored = decodeRehearsalSession(
        sessionStorage.getItem(key),
        resources,
      );
      if (restored) {
        setDraft(restored);
        setDestination(restored.destination);
        setCompletedSource(
          JSON.stringify(
            resources.find((r) => r.slug === restored.destination)?.steps || [],
          ),
        );
      }
    } catch {
      setRehearsalStorageError(
        "Tab-session storage is unavailable. Keep this page open to retain your rehearsal.",
      );
    }
    setRehearsalReady(true);
  }, [
    account.authReady,
    account.accountScope,
    ownedAccount,
    rehearsalReady,
    resources,
  ]);
  useEffect(() => {
    if (!rehearsalReady || !account.accountScope.isCurrent(ownedAccount))
      return;
    try {
      const key = prepareRehearsalOwner(sessionStorage, ownedAccount.owner);
      sessionStorage.setItem(key, rehearsalPayload);
    } catch {
      setRehearsalStorageError(
        "Tab-session storage is unavailable. Keep this page open to retain your rehearsal.",
      );
    }
  }, [
    rehearsalPayload,
    rehearsalReady,
    account.accountScope,
    ownedAccount,
  ]);
  useEffect(() => {
    if (!rehearsalReady) return;
    if (completedSource !== guideSteps) {
      setDraft((old) => ({ ...old, completed: [] }));
      setCompletedSource(guideSteps);
    }
  }, [completedSource, guideSteps, rehearsalReady]);
  useEffect(() => {
    const controller = new AbortController();
    setRefreshing(true);
    setResourceError("");
    refreshLearningResources(controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) {
          setResources(rows);
          setResourceSource("hosted");
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResourceError(
            error instanceof Error
              ? error.message
              : "The resource catalogue could not refresh. Please retry.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setRefreshing(false);
      });
    return () => controller.abort();
  }, [refreshNonce]);
  const selectSection = (next: AdmissionPlannerSection) => {
    setSection(next);
    // This is a local view, so use the framework-supported History API rather
    // than issuing an RSC request that can remount a private rehearsal form.
    const href = admissionPlannerHref(window.location.href, next);
    if (
      href !==
      window.location.pathname + window.location.search + window.location.hash
    )
      window.history.pushState(null, "", href);
  };
  const onTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = (index + 1) % plannerTabs.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (index - 1 + plannerTabs.length) % plannerTabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = plannerTabs.length - 1;
    if (next !== null) {
      event.preventDefault();
      tabRefs.current[next]?.focus();
      selectSection(plannerTabs[next].id);
    }
  };
  const save = async (tasks: { title: string; done: boolean }[]) => {
    if (!account.accountScope.isCurrent(ownedAccount)) return;
    if (!account.user) {
      account.openAuth();
      return;
    }
    if (account.user.id !== ownedAccount.owner) return;
    if (operationBusy.current || !rehearsalReady) return;
    const owner = ownedAccount;
    const current = () =>
      mounted.current && account.accountScope.isCurrent(owner);
    operationBusy.current = true;
    setSaving(true);
    try {
      const count = await savePlanningTasks(account.accountScope, tasks);
      if (current())
        toast.success(
          count
            ? `${count} steps added to your plan`
            : "These steps are already in your plan",
        );
    } catch (error) {
      if (!(error instanceof PlanningAccountChangedError) && current())
        toast.error(
          error instanceof Error ? error.message : "Could not save your plan.",
        );
    } finally {
      if (current()) {
        operationBusy.current = false;
        setSaving(false);
      }
    }
  };
  const selectDestination = (slug: string) => {
    setDestination(slug);
    setDraft((old) => ({ ...old, destination: slug, completed: [] }));
    setCompletedSource(
      JSON.stringify(guides.find((r) => r.slug === slug)?.steps || []),
    );
  };
  const practice = resources.filter(
    (r) =>
      r.kind === "practice" &&
      (subject === "All" || subject === r.subject) &&
      `${r.title} ${r.provider} ${r.summary}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <section className="admission-planner" aria-label="Admissions tools">
      <nav
        className="planner-tabs"
        role="tablist"
        aria-label="Admissions tools sections"
      >
        {plannerTabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            disabled={!interactive}
            role="tab"
            id={`${tabId}-${tab.id}-tab`}
            aria-controls={`${tabId}-${tab.id}-panel`}
            aria-selected={section === tab.id}
            tabIndex={section === tab.id ? 0 : -1}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            onClick={() => selectSection(tab.id)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="planner-refresh-status" role="status" aria-live="polite">
        <p>
          {refreshing
            ? resourceSource === "installed"
              ? "Showing the installed checked catalogue while checking for an update…"
              : "Showing the last checked catalogue while checking for an update…"
            : resourceError
              ? `${resourceError} ${resourceSource === "installed" ? "The installed checked catalogue remains available." : "The last checked catalogue remains available."}`
              : "Showing installed and published catalogue entries. Each source keeps its own checked date."}
        </p>
        {resourceError && (
          <button type="button" onClick={() => setRefreshNonce((n) => n + 1)}>
            Retry refresh
          </button>
        )}
      </div>
      {plannerTabs
        .filter((tab) => tab.id !== section)
        .map((tab) => (
          <div
            key={tab.id}
            id={`${tabId}-${tab.id}-panel`}
            role="tabpanel"
            aria-labelledby={`${tabId}-${tab.id}-tab`}
            hidden
          />
        ))}
      <div
        id={`${tabId}-${section}-panel`}
        role="tabpanel"
        aria-labelledby={`${tabId}-${section}-tab`}
        tabIndex={0}
      >
        {section === "practice" && (
          <>
            <div className="planner-section-heading">
              <div>
                <h2>Study with the official tools.</h2>
                <p>
                  Find lessons, question banks and test practice. Keep what you
                  want to study in your plan.
                </p>
              </div>
              <Link href="/dashboard?section=Practice">
                My practice <ArrowUpRight size={16} />
              </Link>
            </div>
            <div className="planner-filter">
              <label>
                <Search size={17} />
                <input
                  aria-label="Find official study resources"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search resources or providers"
                />
              </label>
              <select
                aria-label="Assessment"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              >
                {["All", "SAT", "IELTS", "TOEFL"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </div>
            <div className="learning-resource-grid">
              {practice.map((r) => (
                <article key={r.id}>
                  <div className="learning-resource-meta">
                    <span>{r.subject}</span>
                    <small>{r.provider}</small>
                  </div>
                  <h3>{r.title}</h3>
                  <p>{r.summary}</p>
                  <small>{r.access}</small>
                  <footer>
                    <a href={r.url} target="_blank" rel="noreferrer">
                      Open resource <ArrowUpRight size={16} />
                    </a>
                    <button
                      aria-label={`Add ${r.title} to my plan`}
                      disabled={saving}
                      onClick={() =>
                        save([
                          {
                            title: `Study: ${r.title} — ${r.url}`,
                            done: false,
                          },
                        ])
                      }
                    >
                      <Bookmark size={16} />
                      Save to plan
                    </button>
                  </footer>
                </article>
              ))}
            </div>
            {!practice.length && (
              <p role="status">
                No resources match. Try another assessment or search.
              </p>
            )}
            <p className="planner-source-note">
              Resources open on their official websites. Provider accounts may
              be needed. CollegeStat does not import their questions or provider
              scores.
            </p>
          </>
        )}
        {section !== "practice" && guide && (
          <div className="destination-workbench">
            <aside>
              <label htmlFor="planning-destination">
                Where do you want to study?
              </label>
              <select
                id="planning-destination"
                disabled={saving || !rehearsalReady}
                value={destination}
                onChange={(e) => selectDestination(e.target.value)}
              >
                {guides.map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.title}
                  </option>
                ))}
              </select>
              <p>
                Choose a country or a named university route. Requirements
                depend on your qualification, course and intake.
              </p>
              <Link href={`/universities?country=${guide.country_code || ""}`}>
                Explore universities <ArrowUpRight size={15} />
              </Link>
              {universitySlug && (
                <Link
                  href={`/university/${encodeURIComponent(universitySlug)}`}
                >
                  Return to selected university <ArrowUpRight size={15} />
                </Link>
              )}
            </aside>
            <div className="destination-content">
              <div className="planner-section-heading">
                <div>
                  <span className="planner-eyebrow">{guide.provider}</span>
                  <h2>
                    {section === "application"
                      ? "Rehearse your application."
                      : guide.title}
                  </h2>
                  <p>{guide.summary}</p>
                </div>
              </div>
              {section === "application" && (
                <>
                  <p className="rehearsal-note">
                    A preparation checklist you control. It does not submit an
                    application or predict acceptance. Your rehearsal stays in
                    this browser tab. Saving adds only these steps to your
                    private plan; switching accounts clears the rehearsal.
                  </p>
                  {rehearsalStorageError && (
                    <p className="planner-source-note" role="status">
                      {rehearsalStorageError}
                    </p>
                  )}
                  <div className="rehearsal-fields">
                    {[
                      [
                        "university",
                        "University",
                        "The institution you are considering",
                      ],
                      ["program", "Program", "Your intended course"],
                      [
                        "qualification",
                        "Your qualification",
                        "For example: national school diploma or IB",
                      ],
                      ["intake", "Intake", "For example: autumn 2027"],
                    ].map(([key, label, placeholder]) => (
                      <label key={key}>
                        {label}
                        <input
                          maxLength={
                            key === "qualification"
                              ? 120
                              : key === "intake"
                                ? 24
                                : 60
                          }
                          value={
                            draft[
                              key as keyof Omit<
                                ApplicationRehearsal,
                                "completed"
                              >
                            ]
                          }
                          placeholder={placeholder}
                          disabled={saving || !rehearsalReady}
                          onChange={(e) =>
                            setDraft((old) => ({
                              ...old,
                              [key]: e.target.value,
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                </>
              )}
              <div className="rehearsal-checklist">
                {guide.steps.map((step, index) => (
                  <label key={step}>
                    <input
                      type="checkbox"
                      disabled={saving || !rehearsalReady}
                      checked={currentDraft.completed.includes(String(index))}
                      onChange={(e) =>
                        setDraft((old) => ({
                          ...old,
                          completed: e.target.checked
                            ? [...old.completed, String(index)]
                            : old.completed.filter((x) => x !== String(index)),
                        }))
                      }
                    />
                    <span>
                      <strong>{step}</strong>
                      <small>
                        {currentDraft.completed.includes(String(index))
                          ? "You marked this as checked"
                          : "Check this against the official course page"}
                      </small>
                    </span>
                    {currentDraft.completed.includes(String(index)) && (
                      <Check size={17} />
                    )}
                  </label>
                ))}
              </div>
              <div className="rehearsal-actions">
                <button
                  className="button button-primary"
                  disabled={saving || !rehearsalReady}
                  onClick={() => save(rehearsalTasks(currentDraft, guide))}
                >
                  {saving
                    ? "Saving…"
                    : account.user
                      ? "Save steps to my plan"
                      : "Sign in to save my plan"}
                  <ArrowRight size={16} />
                </button>
                <a
                  className="text-link"
                  href={guide.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Check official guidance <ArrowUpRight size={16} />
                </a>
              </div>
              <details className="planner-evidence">
                <summary>Source and applicability</summary>
                <p>{guide.population}</p>
                <p>
                  Checked{" "}
                  {new Date(guide.retrieved_at).toISOString().slice(0, 10)}
                  {guide.publication_year
                    ? ` · Source publication year ${guide.publication_year}`
                    : " · Publication year not specified"}
                  . This guidance does not establish eligibility or a minimum
                  score for every university.
                </p>
                <a href={guide.url} target="_blank" rel="noreferrer">
                  {guide.provider} <ArrowUpRight size={14} />
                </a>
              </details>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
