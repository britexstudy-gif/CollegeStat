"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Columns3, Database, LoaderCircle, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  StatusChip,
  cellText,
  isCellPrimitive,
  recordTitle,
  type AdminRow,
} from "./admin-supabase-status";

const HIDDEN_FROM_COLUMNS = new Set([
  "id",
  "name",
  "title",
  "label",
  "display_name",
  "metric",
  "table_name",
  "status",
  "verification_status",
]);

const PRIORITY_ORDER = [
  "slug",
  "code",
  "email",
  "kind",
  "type",
  "category",
  "country",
  "city",
  "state",
  "website",
  "website_url",
  "url",
  "source_url",
  "university_id",
  "scholarship_id",
  "program_id",
  "amount",
  "value",
  "year",
  "published",
  "created_at",
  "updated_at",
];

function rankKey(key: string): number {
  const direct = PRIORITY_ORDER.indexOf(key);
  if (direct !== -1) return direct;
  if (/^(created_at|updated_at|deleted_at|inserted_at)$/.test(key)) return 900;
  if (/(metadata|payload|raw_json|raw|extra|extensions)$/.test(key)) return 800;
  if (key.endsWith("_id")) return 500;
  if (/^(notes|description|body|content)$/.test(key)) return 600;
  return 400;
}

function dynamicKeys(rows: AdminRow[]): string[] {
  const seen: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!HIDDEN_FROM_COLUMNS.has(key) && !seen.includes(key)) seen.push(key);
    }
  }
  return seen;
}

function defaultVisibleKeys(allKeys: string[]): string[] {
  return [...allKeys].sort((a, b) => rankKey(a) - rankKey(b)).slice(0, 5);
}

export function SupabaseDataTable({
  tableName,
  rows,
  loading,
  error = "",
  renderActions,
}: {
  tableName: string;
  rows: AdminRow[];
  loading: boolean;
  error?: string;
  renderActions: (row: AdminRow) => ReactNode;
}) {
  const allKeys = useMemo(() => dynamicKeys(rows), [rows]);
  const defaultShown = useMemo(() => defaultVisibleKeys(allKeys), [allKeys]);
  const [visible, setVisible] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<AdminRow | null>(null);
  const [detailTrigger, setDetailTrigger] = useState<HTMLElement | null>(null);
  // Column choice persists across pages/search; it resets only when the table changes.
  useEffect(() => {
    setVisible(null);
  }, [tableName]);
  // Selection and open drawer reset per result set, never the loaded rows.
  useEffect(() => {
    setSelected(new Set());
    setDetail(null);
  }, [tableName, rows]);
  const base = visible ?? defaultShown;
  const shown = base.filter((key) => allKeys.includes(key));
  const toggleColumn = (key: string) => {
    const current = visible ?? defaultShown;
    setVisible(
      current.includes(key)
        ? current.filter((k) => k !== key)
        : [...current, key],
    );
  };
  const toggleRow = (id: string) => {
    setSelected((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const togglePage = () => {
    setSelected((old) => {
      if (rows.every((r) => old.has(r.id))) return new Set();
      return new Set(rows.map((r) => r.id));
    });
  };
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someChecked = selected.size > 0 && !allChecked;
  const selectPage = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectPage.current) selectPage.current.indeterminate = someChecked;
  }, [someChecked]);
  const colSpan = 4 + shown.length;
  return (
    <>
      <div className="sb-tablebar">
        <span className="sb-count" aria-live="polite">
          {selected.size > 0
            ? `${selected.size} of ${rows.length} selected`
            : `${rows.length} rows on this page`}
        </span>
        <span className="sb-toolbar-spacer" />
        {allKeys.length > 0 && (
          <details className="sb-cols">
            <summary aria-label="Toggle column visibility">
              <Columns3 size={14} aria-hidden="true" /> Columns · {shown.length}
              /{allKeys.length}
            </summary>
            <div
              className="sb-cols-panel"
              role="group"
              aria-label="Visible columns"
            >
              {allKeys.map((key) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={shown.includes(key)}
                    onChange={() => toggleColumn(key)}
                  />
                  {key.replaceAll("_", " ")}
                </label>
              ))}
            </div>
          </details>
        )}
      </div>
      <div
        className="sb-gridwrap"
        role="region"
        aria-label={`${tableName} records grid`}
        aria-busy={loading}
        tabIndex={0}
      >
        <table className="sb-grid">
          <caption className="sb-sr-only">
            {tableName.replaceAll("_", " ")} records, {rows.length} rows on this
            page
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                aria-label="Select rows"
                className="sb-col-select"
              >
                <input
                  type="checkbox"
                  ref={selectPage}
                  aria-label="Select all rows on this page"
                  aria-checked={someChecked ? "mixed" : allChecked}
                  checked={allChecked}
                  disabled={loading || !rows.length}
                  onChange={togglePage}
                />
              </th>
              <th scope="col" className="sb-col-record">
                Record
              </th>
              {shown.map((key) => (
                <th scope="col" key={key}>
                  {key.replaceAll("_", " ")}
                </th>
              ))}
              <th scope="col" className="sb-col-state">
                State
              </th>
              <th scope="col" className="sb-col-action">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr className="sb-loading-row">
                <td colSpan={colSpan}>
                  <div className="sb-grid-loading" role="status">
                    <LoaderCircle size={18} aria-hidden="true" />
                    Loading records…
                  </div>
                </td>
              </tr>
            )}
            {!loading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={colSpan}>
                  <div className="sb-grid-empty">
                    <Database size={25} strokeWidth={1.5} aria-hidden="true" />
                    <strong>No records found</strong>
                    <p>
                      No records match this table and filter. Clear the search
                      or create a sourced record.
                    </p>
                  </div>
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={row.id}
                className={selected.has(row.id) ? "sb-selected" : ""}
                data-selected={selected.has(row.id) ? "true" : undefined}
              >
                <td className="sb-col-select">
                  <input
                    type="checkbox"
                    aria-label={`Select ${recordTitle(row)}`}
                    checked={selected.has(row.id)}
                    onChange={() => toggleRow(row.id)}
                  />
                </td>
                <td className="sb-col-record">
                  <button
                    type="button"
                    className="sb-rowtitle"
                    title={recordTitle(row)}
                    onClick={(event) => {
                      setDetailTrigger(event.currentTarget);
                      setDetail(row);
                    }}
                  >
                    {recordTitle(row)}
                  </button>
                  <div className="sb-cell-id">{row.id}</div>
                </td>
                {shown.map((key) => (
                  <td key={key}>
                    <span
                      className="sb-cell"
                      title={
                        isCellPrimitive(row[key])
                          ? cellText(row[key])
                          : undefined
                      }
                    >
                      {isCellPrimitive(row[key]) ? (
                        cellText(row[key])
                      ) : (
                        <span className="sb-null">
                          {cellText(row[key])} · inspect row
                        </span>
                      )}
                    </span>
                  </td>
                ))}
                <td className="sb-col-state">
                  <StatusChip row={row} />
                </td>
                <td className="sb-col-action">
                  <div className="sb-row-actions">{renderActions(row)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <RowDetail
        row={detail}
        tableName={tableName}
        onClose={() => setDetail(null)}
        returnFocus={detailTrigger}
        actions={detail ? renderActions(detail) : null}
      />
    </>
  );
}

function RowDetail({
  row,
  tableName,
  onClose,
  actions,
  returnFocus,
}: {
  row: AdminRow | null;
  tableName: string;
  onClose: () => void;
  actions: ReactNode;
  returnFocus: HTMLElement | null;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  if (!row) return null;
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <div className="supabase-console sb-modal-scope">
          <DialogPrimitive.Overlay className="sb-drawer-veil" />
          <DialogPrimitive.Content
            className="sb-drawer"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              closeRef.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (
                document.querySelector(
                  '.supabase-console-dialog[data-state="open"]',
                )
              )
                return;
              if (returnFocus?.isConnected) {
                returnFocus.focus();
                return;
              }
              document.querySelector<HTMLElement>(".sb-gridwrap")?.focus();
            }}
          >
            <div className="sb-drawer-head">
              <div className="sb-drawer-titleblock">
                <div className="sb-eyebrow">
                  {tableName.replaceAll("_", " ")} · row detail
                </div>
                <DialogPrimitive.Title asChild>
                  <h2>{recordTitle(row)}</h2>
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="sb-sr-only">
                  Inspect all sourced fields and raw evidence for this record.
                </DialogPrimitive.Description>
                <p className="sb-drawer-id">{row.id}</p>
                <StatusChip row={row} />
              </div>
              <button
                type="button"
                ref={closeRef}
                className="sb-drawer-close"
                onClick={onClose}
                aria-label="Close row detail"
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>
            <div className="sb-drawer-body">
              <h3 className="sb-drawer-section">
                Fields · {Object.keys(row).length}
              </h3>
              <dl className="sb-kv">
                {Object.entries(row).map(([key, value]) => (
                  <RowField key={key} k={key} v={value} />
                ))}
              </dl>
              <details className="sb-details">
                <summary>Raw record JSON</summary>
                <pre className="sb-json">{JSON.stringify(row, null, 2)}</pre>
              </details>
            </div>
            <div
              className="sb-drawer-actions"
              onClick={(event) => {
                if (
                  event.target instanceof Element &&
                  event.target.closest("button")
                )
                  onClose();
              }}
            >
              {actions}
            </div>
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function RowField({ k, v }: { k: string; v: unknown }) {
  return (
    <>
      <dt>{k.replaceAll("_", " ")}</dt>
      <dd>
        {typeof v === "string" && /^https?:\/\//.test(v) ? (
          <a className="sb-link" href={v} target="_blank" rel="noreferrer">
            {v}
          </a>
        ) : (
          cellText(v)
        )}
      </dd>
    </>
  );
}
