"use client";
import { Bookmark, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCollege } from "./provider";
export function SaveButton({
  id,
  scholarship = false,
  compact = false,
  label,
}: {
  id: string;
  scholarship?: boolean;
  compact?: boolean;
  label?: string;
}) {
  const s = useCollege();
  const saved = (scholarship ? s.savedScholarships : s.saved).includes(id);
  const [confirmed, setConfirmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <button
      className={
        "button button-secondary save-button " +
        (compact ? "save-compact " : "") +
        (confirmed ? "save-confirmed" : "")
      }
      aria-label={label ? (saved ? "Unsave " : "Save ") + label : undefined}
      title={
        compact ? (saved ? "Remove from saved" : "Save university") : undefined
      }
      aria-pressed={saved}
      disabled={s.busy}
      onClick={async () => {
        const wasSaved = saved;
        if ((await s.toggleSaved(id, scholarship)) && !wasSaved) {
          setConfirmed(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setConfirmed(false), 1100);
        }
      }}
    >
      {saved ? (
        <Check size={16} aria-hidden="true" />
      ) : (
        <Bookmark size={16} aria-hidden="true" />
      )}
      <span className={compact ? "sr-only" : undefined}>
        {saved ? "Saved" : "Save"}
      </span>
    </button>
  );
}
