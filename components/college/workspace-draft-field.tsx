"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Check, Save } from "lucide-react";
import { validPlanDate } from "@/lib/workspace-planner";

/** A refresh may update the receipt, but must never replace an unsaved edit. */
export function WorkspaceDraftField({
  label, value: savedValue, kind = "notes", help, onSave, disabled = false,
}: {
  label: string;
  value: string;
  kind?: "notes" | "date";
  help?: string;
  disabled?: boolean;
  onSave: (value: string) => Promise<boolean>;
}) {
  const id = useId();
  const [value, setValue] = useState(savedValue);
  const [confirmed, setConfirmed] = useState(savedValue);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const previous = useRef(savedValue);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    const before = previous.current;
    setValue((draft) => draft === before ? savedValue : draft);
    setConfirmed(savedValue);
    previous.current = savedValue;
  }, [savedValue]);
  const dirty = value !== confirmed;
  const save = async () => {
    if (busy || disabled || !dirty) return;
    if (kind === "date" && value && !validPlanDate(value)) {
      setStatus("Choose a real calendar date.");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const saved = await onSave(value);
      if (!alive.current) return;
      if (saved) {
        setConfirmed(value);
        previous.current = value;
        setStatus("Saved");
      } else setStatus("Could not save. Your edit is still here; retry when ready.");
    } catch {
      if (alive.current) setStatus("Could not save. Your edit is still here; retry when ready.");
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <div className={"workspace-draft-field workspace-draft-field--" + kind}>
      <label htmlFor={id}>{label}</label>
      {help && <p id={id + "-help"}>{help}</p>}
      {kind === "notes" ? (
        <textarea id={id} value={value} maxLength={10000} rows={3} disabled={busy || disabled}
          aria-describedby={help ? id + "-help" : undefined}
          placeholder="What matters? What do you still need to check?"
          onChange={(event) => { setValue(event.target.value); setStatus(""); }} />
      ) : (
        <input id={id} type="date" value={value} disabled={busy || disabled}
          aria-describedby={help ? id + "-help" : undefined}
          onChange={(event) => { setValue(event.target.value); setStatus(""); }} />
      )}
      <div className="workspace-draft-actions">
        <button type="button" className="text-link" disabled={busy || disabled || !dirty} onClick={() => void save()}>
          {status === "Saved" && !dirty ? <Check size={14} aria-hidden="true" /> : <Save size={14} aria-hidden="true" />}
          {busy ? "Saving…" : kind === "notes" ? "Save notes" : "Save date"}
        </button>
        <span role="status" aria-live="polite">{status || (dirty ? "Unsaved changes" : "")}</span>
      </div>
    </div>
  );
}
