"use client";
import { Bookmark, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCollege } from "./provider";
export function SaveButton({ id, scholarship = false }: { id: string; scholarship?: boolean }) {
  const s = useCollege();
  const saved = (scholarship ? s.savedScholarships : s.saved).includes(id);
  const [confirmed, setConfirmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <button className={"button button-secondary save-button " + (confirmed ? "save-confirmed" : "")}
    aria-pressed={saved} disabled={s.busy} onClick={async () => {
      const wasSaved = saved;
      if (await s.toggleSaved(id, scholarship) && !wasSaved) {
        setConfirmed(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setConfirmed(false), 1100);
      }
    }}>{saved ? <Check size={16} aria-hidden="true"/> : <Bookmark size={16} aria-hidden="true"/>}{saved ? "Saved" : "Save"}</button>;
}
