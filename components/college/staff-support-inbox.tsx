"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { RefreshCw, Inbox, ChevronLeft, ChevronRight } from "lucide-react";
import { z } from "zod";
import { supportRecord, type SupportRecord } from "@/lib/support-requests";
import { useStaffAccount } from "./use-staff-account";
import "@/app/support-inbox-oct12.css";
const listResult = z.object({
  records: z.array(supportRecord).max(25),
  has_more: z.boolean(),
});
const statusLabel = {
  new: "New",
  in_progress: "In progress",
  resolved: "Resolved",
};

export function StaffSupportInbox() {
  const { scope, staffFetch } = useStaffAccount();
  const [filter, setFilter] = useState<SupportRecord["status"] | "all">("new");
  const [page, setPage] = useState(0);
  const [records, setRecords] = useState<SupportRecord[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const load = useCallback(async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const owner = scope.capture();
    const version = ++revision.current;
    setLoading(true);
    setError("");
    try {
      const result = listResult.parse(
        await staffFetch(
          "/api/staff/support",
          { action: "list", status: filter === "all" ? null : filter, page },
          controller.signal,
        ),
      );
      if (!scope.isCurrent(owner) || version !== revision.current) return;
      setRecords(result.records);
      setMore(result.has_more);
    } catch (failure) {
      if (
        scope.isCurrent(owner) &&
        version === revision.current &&
        !controller.signal.aborted
      )
        setError(
          failure instanceof Error
            ? failure.message
            : "The inbox could not be loaded.",
        );
    } finally {
      if (scope.isCurrent(owner) && version === revision.current)
        setLoading(false);
    }
  }, [scope, staffFetch, filter, page]);
  useEffect(() => {
    const stop = scope.subscribe(() => {
      pending.current?.abort();
      revision.current++;
      setRecords([]);
      setMore(false);
      setLoading(false);
    });
    void load();
    return () => {
      stop();
      pending.current?.abort();
    };
  }, [load, scope]);
  return (
    <section className="staff-support-inbox" aria-label="Private support inbox">
      <header>
        <span className="section-caption">Private messages</span>
        <h2>Support inbox</h2>
        <p>
          Contact requests and student issue reports. Sender-provided emails are
          unverified. Notes stay internal.
        </p>
      </header>
      <div className="staff-inbox-toolbar">
        <label className="sr-only" htmlFor="support-inbox-filter">
          Message status
        </label>
        <select
          id="support-inbox-filter"
          value={filter}
          disabled={loading}
          onChange={(event) => {
            setFilter(event.target.value as typeof filter);
            setPage(0);
            setRecords([]);
          }}
        >
          <option value="new">New messages</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
          <option value="all">All messages</option>
        </select>
        <button
          className="sb-btn"
          type="button"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw size={14} />
          {loading ? "Loading…" : "Refresh"}
        </button>
        <small>Page {page + 1} · 25 messages per page</small>
      </div>
      {error && (
        <p role="alert" className="support-message-error">
          {error} Existing messages are kept; no review was changed.
        </p>
      )}
      {!loading && !error && records.length === 0 && (
        <div className="sb-empty">
          <Inbox size={24} />
          <h3>No messages in this view</h3>
          <p>
            New submissions from Contact us and Report a problem will appear
            here.
          </p>
        </div>
      )}
      {records.map((record) => (
        <InboxMessage
          key={record.id + record.updated_at}
          record={record}
          onSaved={(next) =>
            setRecords((old) =>
              old.map((row) => (row.id === next.id ? next : row)),
            )
          }
        />
      ))}
      <div className="staff-inbox-toolbar">
        <button
          type="button"
          className="sb-btn"
          disabled={page === 0 || loading}
          onClick={() => {
            setRecords([]);
            setPage((old) => old - 1);
          }}
        >
          <ChevronLeft size={14} />
          Previous
        </button>
        <button
          type="button"
          className="sb-btn"
          disabled={!more || loading}
          onClick={() => {
            setRecords([]);
            setPage((old) => old + 1);
          }}
        >
          Next
          <ChevronRight size={14} />
        </button>
      </div>
    </section>
  );
}

function InboxMessage({
  record,
  onSaved,
}: {
  record: SupportRecord;
  onSaved: (record: SupportRecord) => void;
}) {
  const { scope, staffFetch } = useStaffAccount();
  const [status, setStatus] = useState(record.status);
  const [note, setNote] = useState(record.admin_note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const stop = scope.subscribe(() => pending.current?.abort());
    return () => {
      stop();
      pending.current?.abort();
    };
  }, [scope]);
  const changed = status !== record.status || note !== record.admin_note;
  return (
    <article className="staff-inbox-message">
      <div>
        <small>
          {record.kind} · {new Date(record.created_at).toLocaleString()} ·{" "}
          {statusLabel[record.status]}
        </small>
        <h3>{record.subject}</h3>
        <p>{record.message}</p>
        <small>
          {record.name || "Name not supplied"}
          {record.email
            ? " · " + record.email + " (unverified)"
            : " · No email supplied"}
        </small>
        {record.page_path && <small>Page: {record.page_path}</small>}
        <small>
          Reference: {record.id} ·{" "}
          {record.user_id ? "Signed-in submission" : "Guest submission"}
        </small>
      </div>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || !changed) return;
          const owner = scope.capture();
          const controller = new AbortController();
          pending.current = controller;
          setBusy(true);
          setError("");
          try {
            const result = z
              .object({ record: supportRecord })
              .parse(
                await staffFetch(
                  "/api/staff/support",
                  {
                    action: "review",
                    id: record.id,
                    status,
                    admin_note: note,
                    expected_updated_at: record.updated_at,
                  },
                  controller.signal,
                ),
              );
            if (scope.isCurrent(owner)) onSaved(result.record);
          } catch (failure) {
            if (scope.isCurrent(owner) && !controller.signal.aborted)
              setError(
                failure instanceof Error
                  ? failure.message
                  : "Review was not confirmed. Your note is kept.",
              );
          } finally {
            if (scope.isCurrent(owner)) {
              setBusy(false);
              pending.current = null;
            }
          }
        }}
      >
        <label>
          Status
          <select
            disabled={busy}
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
          >
            {Object.entries(statusLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Internal note
          <textarea
            disabled={busy}
            value={note}
            maxLength={3000}
            rows={4}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <button
          className="sb-btn sb-btn--primary"
          type="submit"
          disabled={busy || !changed}
        >
          {busy ? "Saving…" : "Save review"}
        </button>
        {error && (
          <p role="alert" className="support-message-error">
            {error}
          </p>
        )}
        <small>No message is sent to the student from this action.</small>
      </form>
    </article>
  );
}
