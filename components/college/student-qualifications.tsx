"use client";

import { useEffect, useRef, useState } from "react";
import {
  ClipboardList,
  GraduationCap,
  LockKeyhole,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useCollege } from "./provider";
import {
  curricula,
  educationLevels,
  qualificationNotice,
  qualificationStatuses,
  testKinds,
  testStatuses,
  type Qualifications,
} from "@/lib/student-qualifications";
import { countries, countryName } from "@/lib/domain";
import { validPlanDate } from "@/lib/workspace-planner";
import {
  loadQualifications,
  removeQualificationRecord,
  saveEducationRecord,
  saveTestRecord,
} from "@/services/student-qualifications";

type Tab = "education" | "tests";
type Confirming = { kind: "education" | "tests"; id: string } | null;

const UNKNOWN = "Unknown";
const displayEnum = (value: string) => (value === "unknown" ? UNKNOWN : value);
const formatSavedAt = (value: string) => {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return value;
  return new Date(time).toLocaleDateString(undefined, { dateStyle: "medium" });
};
const countryOptions = Object.entries(countries).sort((a, b) =>
  a[1].localeCompare(b[1]),
);

/**
 * Private, self-reported qualification profile. No props: the signed-in owner
 * comes from useCollege. Nothing saves automatically; only the explicit Add
 * buttons write, and nothing is uploaded, sent to AI, or published.
 */
export function StudentQualifications() {
  const account = useCollege();
  const accountScope = account.accountScope;
  const owner = account.user?.id ?? null;

  const [tab, setTab] = useState<Tab>("education");
  const [records, setRecords] = useState<Qualifications | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);
  const [notice, setNotice] = useState("");
  const [removeError, setRemoveError] = useState("");

  const [eduQualification, setEduQualification] = useState("");
  const [eduCountry, setEduCountry] = useState("");
  const [eduCurriculum, setEduCurriculum] = useState<string>(curricula[0]);
  const [eduLevel, setEduLevel] = useState<string>(educationLevels[0]);
  const [eduStatus, setEduStatus] = useState<string>(qualificationStatuses[0]);
  const [eduYear, setEduYear] = useState("");
  const [eduGrade, setEduGrade] = useState("");
  const [eduScale, setEduScale] = useState("");
  const [eduError, setEduError] = useState("");
  const [eduSaving, setEduSaving] = useState(false);

  const [testKind, setTestKind] = useState<string>("other");
  const [testLabel, setTestLabel] = useState("");
  const [testStatus, setTestStatus] = useState<string>("planned");
  const [testTakenOn, setTestTakenOn] = useState("");
  const [testScore, setTestScore] = useState("");
  const [testScale, setTestScale] = useState("");
  const [testError, setTestError] = useState("");
  const [testSaving, setTestSaving] = useState(false);

  const [confirming, setConfirming] = useState<Confirming>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const mounted = useRef(true);
  const revision = useRef(0);
  const prevOwner = useRef<string | null | undefined>(undefined);
  const eduAttempt = useRef<{ id: string; fingerprint: string } | null>(null);
  const testAttempt = useRef<{ id: string; fingerprint: string } | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (prevOwner.current !== owner) {
      prevOwner.current = owner;
      revision.current += 1;
      setRecords(null);
      setLoadError("");
      setNotice("");
      setRemoveError("");
      setEduError("");
      setTestError("");
      setConfirming(null);
      setRemovingId(null);
      setEduSaving(false);
      setTestSaving(false);
      setEduQualification("");
      setEduCountry("");
      setEduCurriculum(curricula[0]);
      setEduLevel(educationLevels[0]);
      setEduStatus(qualificationStatuses[0]);
      setEduYear("");
      setEduGrade("");
      setEduScale("");
      setTestKind("other");
      setTestLabel("");
      setTestStatus("planned");
      setTestTakenOn("");
      setTestScore("");
      setTestScale("");
      eduAttempt.current = null;
      testAttempt.current = null;
    }
    if (!owner || !accountScope.isOwner(owner)) {
      setLoading(false);
      return;
    }
    const token = accountScope.capture();
    const myRevision = ++revision.current;
    let live = true;
    const current = () =>
      live &&
      mounted.current &&
      accountScope.isCurrent(token) &&
      revision.current === myRevision;
    setLoading(true);
    setLoadError("");
    loadQualifications(accountScope)
      .then((rows) => {
        if (current()) setRecords(rows);
      })
      .catch((error: unknown) => {
        if (current())
          setLoadError(
            error instanceof Error
              ? error.message
              : "Your qualification records could not be loaded. Your edits are kept; please retry.",
          );
      })
      .finally(() => {
        if (current()) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [owner, accountScope, reloadNonce]);

  const mutationBusy = eduSaving || testSaving || removingId !== null;
  const recordsUnavailable = loading || records === null;
  const education = records?.education ?? [];
  const tests = records?.tests ?? [];

  const onTabKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = tab === "education" ? "tests" : "education";
    setTab(next);
    document.getElementById("student-qualifications-tab-" + next)?.focus();
  };

  const addEducation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mutationBusy || recordsUnavailable) return;
    const token = accountScope.capture();
    if (token.owner !== owner || !owner) return;
    const myRevision = revision.current;
    const current = () =>
      mounted.current &&
      accountScope.isCurrent(token) &&
      revision.current === myRevision;
    if (education.length >= 100) {
      setEduError(
        "Your profile holds 100 education records. Remove an old record before adding another.",
      );
      return;
    }
    const qualification = eduQualification.trim();
    if (!qualification) {
      setEduError(
        "Enter the qualification name exactly as it appears on your record.",
      );
      return;
    }
    const yearText = eduYear.trim();
    let graduation_year: number | null = null;
    if (yearText !== "") {
      if (!/^\d{4}$/.test(yearText)) {
        setEduError("Enter a four-digit graduation year, or leave it blank.");
        return;
      }
      const year = Number(yearText);
      if (!Number.isInteger(year) || year < 1900 || year > 2100) {
        setEduError(
          "Enter a graduation year between 1900 and 2100, or leave it blank.",
        );
        return;
      }
      graduation_year = year;
    }
    const grade_label = eduGrade.trim() === "" ? null : eduGrade.trim();
    const grade_scale = eduScale.trim() === "" ? null : eduScale.trim();
    if ((grade_label === null) !== (grade_scale === null)) {
      setEduError(
        "Include the grading scale with your grade; leave both blank if unknown.",
      );
      return;
    }
    const draft = {
      qualification,
      country_code: eduCountry === "" ? null : eduCountry,
      curriculum: eduCurriculum,
      level: eduLevel,
      status: eduStatus,
      graduation_year,
      grade_label,
      grade_scale,
    };
    const fingerprint = JSON.stringify(draft);
    const id =
      eduAttempt.current?.fingerprint === fingerprint
        ? eduAttempt.current.id
        : crypto.randomUUID();
    eduAttempt.current = { id, fingerprint };
    setEduSaving(true);
    setEduError("");
    setNotice("");
    setRemoveError("");
    try {
      const saved = await saveEducationRecord(accountScope, {
        id,
        ...draft,
        curriculum: draft.curriculum as (typeof curricula)[number],
        level: draft.level as (typeof educationLevels)[number],
        status: draft.status as (typeof qualificationStatuses)[number],
      });
      if (!current()) return;
      setRecords((old) =>
        old ? { ...old, education: [...old.education, saved] } : old,
      );
      eduAttempt.current = null;
      setEduQualification("");
      setEduCountry("");
      setEduCurriculum(curricula[0]);
      setEduLevel(educationLevels[0]);
      setEduStatus(qualificationStatuses[0]);
      setEduYear("");
      setEduGrade("");
      setEduScale("");
      setNotice("Education record saved to your private profile.");
    } catch (error) {
      if (current())
        setEduError(
          error instanceof Error
            ? error.message
            : "This record could not be saved. Your edits are kept; please retry.",
        );
    } finally {
      if (current()) setEduSaving(false);
    }
  };

  const addTest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mutationBusy || recordsUnavailable) return;
    const token = accountScope.capture();
    if (token.owner !== owner || !owner) return;
    const myRevision = revision.current;
    const current = () =>
      mounted.current &&
      accountScope.isCurrent(token) &&
      revision.current === myRevision;
    if (tests.length >= 100) {
      setTestError(
        "Your profile holds 100 test records. Remove an old record before adding another.",
      );
      return;
    }
    const label = testLabel.trim();
    if (!label) {
      setTestError(
        "Enter the test label exactly as it appears on your score report.",
      );
      return;
    }
    const isTaken = testStatus === "taken";
    let taken_on: string | null = null;
    let score_label: string | null = null;
    let scale_label: string | null = null;
    if (isTaken) {
      const dateText = testTakenOn.trim();
      if (dateText !== "") {
        if (!validPlanDate(dateText)) {
          setTestError(
            "Use a real calendar date (YYYY-MM-DD) for the date taken, or leave it blank.",
          );
          return;
        }
        taken_on = dateText;
      }
      score_label = testScore.trim() === "" ? null : testScore.trim();
      scale_label = testScale.trim() === "" ? null : testScale.trim();
      if ((score_label === null) !== (scale_label === null)) {
        setTestError(
          "Include the score scale with your result; leave both blank if unknown.",
        );
        return;
      }
    }
    const draft = {
      kind: testKind,
      label,
      status: testStatus,
      taken_on,
      score_label,
      scale_label,
    };
    const fingerprint = JSON.stringify(draft);
    const id =
      testAttempt.current?.fingerprint === fingerprint
        ? testAttempt.current.id
        : crypto.randomUUID();
    testAttempt.current = { id, fingerprint };
    setTestSaving(true);
    setTestError("");
    setNotice("");
    setRemoveError("");
    try {
      const saved = await saveTestRecord(accountScope, {
        id,
        ...draft,
        kind: draft.kind as (typeof testKinds)[number],
        status: draft.status as (typeof testStatuses)[number],
      });
      if (!current()) return;
      setRecords((old) =>
        old ? { ...old, tests: [...old.tests, saved] } : old,
      );
      testAttempt.current = null;
      setTestKind("other");
      setTestLabel("");
      setTestStatus("planned");
      setTestTakenOn("");
      setTestScore("");
      setTestScale("");
      setNotice("Test record saved to your private profile.");
    } catch (error) {
      if (current())
        setTestError(
          error instanceof Error
            ? error.message
            : "This record could not be saved. Your edits are kept; please retry.",
        );
    } finally {
      if (current()) setTestSaving(false);
    }
  };

  const confirmRemove = async () => {
    if (!confirming || mutationBusy || recordsUnavailable) return;
    const { kind, id } = confirming;
    const token = accountScope.capture();
    if (token.owner !== owner || !owner) return;
    const myRevision = revision.current;
    const current = () =>
      mounted.current &&
      accountScope.isCurrent(token) &&
      revision.current === myRevision;
    setRemovingId(id);
    setNotice("");
    setRemoveError("");
    try {
      await removeQualificationRecord(accountScope, kind, id);
      if (!current()) return;
      setRecords((old) =>
        old
          ? {
              ...old,
              education:
                kind === "education"
                  ? old.education.filter((row) => row.id !== id)
                  : old.education,
              tests:
                kind === "tests"
                  ? old.tests.filter((row) => row.id !== id)
                  : old.tests,
            }
          : old,
      );
      setConfirming(null);
      setNotice("Record removed from your private profile.");
    } catch (error) {
      if (current())
        setRemoveError(
          error instanceof Error
            ? error.message
            : "This record could not be removed. Please retry.",
        );
    } finally {
      if (current()) setRemovingId(null);
    }
  };

  if (!account.authReady)
    return (
      <section
        className="student-qualifications"
        aria-labelledby="student-qualifications-title"
      >
        <p className="student-qualifications__loading" role="status">
          Checking your sign-in…
        </p>
      </section>
    );

  if (!owner)
    return (
      <section
        className="student-qualifications"
        aria-labelledby="student-qualifications-title"
      >
        <header className="student-qualifications__header">
          <span className="student-qualifications__icon" aria-hidden="true">
            <LockKeyhole size={18} />
          </span>
          <div>
            <h2 id="student-qualifications-title">Qualifications</h2>
            <p className="student-qualifications__privacy">
              {qualificationNotice}
            </p>
          </div>
        </header>
        <p className="student-qualifications__empty" role="status">
          Sign in to keep your own private qualification records. Nothing here
          is shared or published.
        </p>
        <button
          type="button"
          className="button button-primary"
          onClick={account.openAuth}
        >
          Sign in
        </button>
      </section>
    );

  return (
    <section
      className="student-qualifications"
      aria-labelledby="student-qualifications-title"
      aria-busy={loading}
    >
      <header className="student-qualifications__header">
        <span className="student-qualifications__icon" aria-hidden="true">
          <LockKeyhole size={18} />
        </span>
        <div>
          <h2 id="student-qualifications-title">Qualifications</h2>
          <p className="student-qualifications__privacy">
            {qualificationNotice}
          </p>
          <p className="student-qualifications__privacy">
            Only you can read these records. Add a qualification or test result
            to keep it beside your application research. Saving is always
            explicit.
          </p>
        </div>
      </header>

      {removeError && (
        <p className="student-qualifications__error" role="alert">
          {removeError}
        </p>
      )}
      {notice && (
        <p className="student-qualifications__notice" role="status">
          {notice}
        </p>
      )}

      {loading && (
        <p className="student-qualifications__loading" role="status">
          Loading your private records…
        </p>
      )}

      {loadError && !loading && (
        <div className="student-qualifications__error" role="alert">
          <p>{loadError}</p>
          <button
            type="button"
            className="text-link"
            disabled={mutationBusy || loading}
            onClick={() => setReloadNonce((n) => n + 1)}
          >
            <RotateCcw size={14} aria-hidden="true" /> Retry loading records
          </button>
        </div>
      )}

      {!loading && !loadError && (
        <>
          <div
            className="student-qualifications__tabs"
            role="tablist"
            aria-label="Qualification record types"
            onKeyDown={onTabKeyDown}
          >
            <button
              type="button"
              role="tab"
              id="student-qualifications-tab-education"
              aria-selected={tab === "education"}
              tabIndex={tab === "education" ? 0 : -1}
              aria-controls="student-qualifications-panel-education"
              className="student-qualifications__tab"
              onClick={() => setTab("education")}
            >
              <GraduationCap size={15} aria-hidden="true" /> Education
              <span className="student-qualifications__count">
                {education.length}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              id="student-qualifications-tab-tests"
              aria-selected={tab === "tests"}
              tabIndex={tab === "tests" ? 0 : -1}
              aria-controls="student-qualifications-panel-tests"
              className="student-qualifications__tab"
              onClick={() => setTab("tests")}
            >
              <ClipboardList size={15} aria-hidden="true" /> Tests
              <span className="student-qualifications__count">
                {tests.length}
              </span>
            </button>
          </div>

          <div
            role="tabpanel"
            id="student-qualifications-panel-education"
            aria-labelledby="student-qualifications-tab-education"
            hidden={tab !== "education"}
            className="student-qualifications__panel"
          >
            {education.length === 0 ? (
              <p className="student-qualifications__empty" role="status">
                No education records yet. Add one below exactly as it appears on
                your school record.
              </p>
            ) : (
              <ul className="student-qualifications__list">
                {education.map((row) => (
                  <li key={row.id} className="student-qualifications__record">
                    <div className="student-qualifications__record-main">
                      <strong>{row.qualification}</strong>
                      <dl className="student-qualifications__meta">
                        <div>
                          <dt>Country</dt>
                          <dd>
                            {row.country_code
                              ? `${countryName(row.country_code)} (${row.country_code})`
                              : UNKNOWN}
                          </dd>
                        </div>
                        <div>
                          <dt>Curriculum</dt>
                          <dd>{displayEnum(row.curriculum)}</dd>
                        </div>
                        <div>
                          <dt>Level</dt>
                          <dd>{displayEnum(row.level)}</dd>
                        </div>
                        <div>
                          <dt>Status</dt>
                          <dd>{displayEnum(row.status)}</dd>
                        </div>
                        <div>
                          <dt>Graduation year</dt>
                          <dd>{row.graduation_year ?? UNKNOWN}</dd>
                        </div>
                        <div>
                          <dt>Grade</dt>
                          <dd>
                            {row.grade_label !== null &&
                            row.grade_scale !== null ? (
                              <>
                                {row.grade_label}{" "}
                                <span>(scale: {row.grade_scale})</span>
                              </>
                            ) : (
                              UNKNOWN
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Saved</dt>
                          <dd>{formatSavedAt(row.created_at)}</dd>
                        </div>
                      </dl>
                    </div>
                    <div className="student-qualifications__record-actions">
                      {confirming?.kind === "education" &&
                      confirming.id === row.id ? (
                        <div
                          className="student-qualifications__confirm"
                          role="group"
                          aria-label={`Remove ${row.qualification}`}
                        >
                          <p>Remove this record from your account?</p>
                          <div>
                            <button
                              type="button"
                              className="button button-secondary"
                              disabled={mutationBusy || recordsUnavailable}
                              onClick={() => setConfirming(null)}
                            >
                              Keep
                            </button>
                            <button
                              type="button"
                              className="button button-secondary"
                              disabled={mutationBusy || recordsUnavailable}
                              onClick={confirmRemove}
                            >
                              {removingId === row.id
                                ? "Removing…"
                                : "Remove record"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="text-link"
                          aria-label={`Remove ${row.qualification}`}
                          disabled={mutationBusy || recordsUnavailable}
                          onClick={() =>
                            setConfirming({ kind: "education", id: row.id })
                          }
                        >
                          <Trash2 size={14} aria-hidden="true" /> Remove
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <details className="student-qualifications__add">
              <summary>
                <Plus size={14} aria-hidden="true" /> Add education record
              </summary>
              <form
                className="student-qualifications__form"
                onSubmit={addEducation}
              >
                <fieldset
                  disabled={mutationBusy}
                  className="student-qualifications__fields"
                >
                  <p className="student-qualifications__hint">
                    Enter details exactly as your school reports them. Leave
                    grade and scale both blank when unknown; this view never
                    converts grades.
                  </p>
                  <div className="student-qualifications__grid">
                    <label>
                      Qualification
                      <input
                        value={eduQualification}
                        maxLength={120}
                        onChange={(e) => setEduQualification(e.target.value)}
                        placeholder="For example: High school diploma"
                      />
                    </label>
                    <label>
                      Country
                      <select
                        value={eduCountry}
                        onChange={(e) => setEduCountry(e.target.value)}
                      >
                        <option value="">Unknown</option>
                        {countryOptions.map(([code, name]) => (
                          <option key={code} value={code}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Curriculum
                      <select
                        value={eduCurriculum}
                        onChange={(e) => setEduCurriculum(e.target.value)}
                      >
                        {curricula.map((c) => (
                          <option key={c} value={c}>
                            {displayEnum(c)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Level
                      <select
                        value={eduLevel}
                        onChange={(e) => setEduLevel(e.target.value)}
                      >
                        {educationLevels.map((l) => (
                          <option key={l} value={l}>
                            {displayEnum(l)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Status
                      <select
                        value={eduStatus}
                        onChange={(e) => setEduStatus(e.target.value)}
                      >
                        {qualificationStatuses.map((s) => (
                          <option key={s} value={s}>
                            {displayEnum(s)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Graduation year
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1900}
                        max={2100}
                        step={1}
                        value={eduYear}
                        onChange={(e) => setEduYear(e.target.value)}
                        placeholder="Blank if unknown"
                      />
                    </label>
                    <label>
                      Grade (exact label)
                      <input
                        value={eduGrade}
                        maxLength={80}
                        onChange={(e) => setEduGrade(e.target.value)}
                        placeholder="Exactly as reported"
                      />
                    </label>
                    <label>
                      Grade scale
                      <input
                        value={eduScale}
                        maxLength={120}
                        onChange={(e) => setEduScale(e.target.value)}
                        placeholder="For example: out of 100"
                      />
                    </label>
                  </div>
                  {eduError && (
                    <p className="student-qualifications__error" role="alert">
                      {eduError}
                    </p>
                  )}
                  <div className="student-qualifications__actions">
                    <button
                      type="submit"
                      className="button button-primary"
                      disabled={
                        mutationBusy ||
                        recordsUnavailable ||
                        education.length >= 100
                      }
                    >
                      {eduSaving
                        ? "Saving…"
                        : eduError
                          ? "Retry add"
                          : "Add education record"}
                    </button>
                  </div>
                </fieldset>
              </form>
            </details>
          </div>

          <div
            role="tabpanel"
            id="student-qualifications-panel-tests"
            aria-labelledby="student-qualifications-tab-tests"
            hidden={tab !== "tests"}
            className="student-qualifications__panel"
          >
            {tests.length === 0 ? (
              <p className="student-qualifications__empty" role="status">
                No test records yet. Add one below exactly as it appears on your
                score report.
              </p>
            ) : (
              <ul className="student-qualifications__list">
                {tests.map((row) => (
                  <li key={row.id} className="student-qualifications__record">
                    <div className="student-qualifications__record-main">
                      <strong>{row.label}</strong>
                      <dl className="student-qualifications__meta">
                        <div>
                          <dt>Test</dt>
                          <dd>{row.kind}</dd>
                        </div>
                        <div>
                          <dt>Status</dt>
                          <dd>{row.status}</dd>
                        </div>
                        <div>
                          <dt>Date taken</dt>
                          <dd>
                            {row.taken_on ??
                              (row.status === "taken"
                                ? UNKNOWN
                                : "Not applicable")}
                          </dd>
                        </div>
                        <div>
                          <dt>Score</dt>
                          <dd>
                            {row.score_label !== null &&
                            row.scale_label !== null ? (
                              <>
                                {row.score_label}{" "}
                                <span>(scale: {row.scale_label})</span>
                              </>
                            ) : row.status === "taken" ? (
                              UNKNOWN
                            ) : (
                              "Not applicable"
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Saved</dt>
                          <dd>{formatSavedAt(row.created_at)}</dd>
                        </div>
                      </dl>
                    </div>
                    <div className="student-qualifications__record-actions">
                      {confirming?.kind === "tests" &&
                      confirming.id === row.id ? (
                        <div
                          className="student-qualifications__confirm"
                          role="group"
                          aria-label={`Remove ${row.label}`}
                        >
                          <p>Remove this record from your account?</p>
                          <div>
                            <button
                              type="button"
                              className="button button-secondary"
                              disabled={mutationBusy || recordsUnavailable}
                              onClick={() => setConfirming(null)}
                            >
                              Keep
                            </button>
                            <button
                              type="button"
                              className="button button-secondary"
                              disabled={mutationBusy || recordsUnavailable}
                              onClick={confirmRemove}
                            >
                              {removingId === row.id
                                ? "Removing…"
                                : "Remove record"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="text-link"
                          aria-label={`Remove ${row.label}`}
                          disabled={mutationBusy || recordsUnavailable}
                          onClick={() =>
                            setConfirming({ kind: "tests", id: row.id })
                          }
                        >
                          <Trash2 size={14} aria-hidden="true" /> Remove
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <details className="student-qualifications__add">
              <summary>
                <Plus size={14} aria-hidden="true" /> Add test record
              </summary>
              <form className="student-qualifications__form" onSubmit={addTest}>
                <fieldset
                  disabled={mutationBusy}
                  className="student-qualifications__fields"
                >
                  <p className="student-qualifications__hint">
                    Enter the label and score scale exactly as your report shows
                    them. Only a taken test can carry a date or a result;
                    planned and registered tests keep those fields blank. This
                    view never converts scores.
                  </p>
                  <div className="student-qualifications__grid">
                    <label>
                      Test
                      <select
                        aria-label="Test"
                        value={testKind}
                        onChange={(e) => setTestKind(e.target.value)}
                      >
                        {testKinds.map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Label
                      <input
                        value={testLabel}
                        maxLength={120}
                        onChange={(e) => setTestLabel(e.target.value)}
                        placeholder="Exactly as on your report"
                      />
                    </label>
                    <label>
                      Status
                      <select
                        aria-label="Status"
                        value={testStatus}
                        onChange={(e) => setTestStatus(e.target.value)}
                      >
                        {testStatuses.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Date taken
                      <input
                        type="date"
                        value={testTakenOn}
                        disabled={testStatus !== "taken"}
                        onChange={(e) => setTestTakenOn(e.target.value)}
                      />
                    </label>
                    <label>
                      Score (exact result)
                      <input
                        value={testScore}
                        maxLength={80}
                        disabled={testStatus !== "taken"}
                        onChange={(e) => setTestScore(e.target.value)}
                        placeholder="Exactly as reported"
                      />
                    </label>
                    <label>
                      Score scale
                      <input
                        value={testScale}
                        maxLength={120}
                        disabled={testStatus !== "taken"}
                        onChange={(e) => setTestScale(e.target.value)}
                        placeholder="For example: band 0–9"
                      />
                    </label>
                  </div>
                  {testStatus !== "taken" && (
                    <p className="student-qualifications__hint">
                      Planned or registered: date and result fields stay blank
                      until the test is taken.
                    </p>
                  )}
                  {testError && (
                    <p className="student-qualifications__error" role="alert">
                      {testError}
                    </p>
                  )}
                  <div className="student-qualifications__actions">
                    <button
                      type="submit"
                      className="button button-primary"
                      disabled={
                        mutationBusy ||
                        recordsUnavailable ||
                        tests.length >= 100
                      }
                    >
                      {testSaving
                        ? "Saving…"
                        : testError
                          ? "Retry add"
                          : "Add test record"}
                    </button>
                  </div>
                </fieldset>
              </form>
            </details>
          </div>
        </>
      )}
    </section>
  );
}
