"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import { University } from "@/lib/domain";
import { universitiesByIds } from "@/lib/supabase/catalogue";
import { UniversityLogo } from "./primitives";
const key = "collegestat-recent-universities";
export function readRecentUniversities(): string[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(data)
      ? [
          ...new Set(
            data.filter(
              (id): id is string =>
                typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id),
            ),
          ),
        ].slice(0, 8)
      : [];
  } catch {
    return [];
  }
}
export function rememberUniversity(id: string) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify(
        [id, ...readRecentUniversities().filter((v) => v !== id)].slice(0, 8),
      ),
    );
  } catch {}
}
export function RecentExploration() {
  const [rows, setRows] = useState<University[]>([]);
  useEffect(() => {
    let live = true;
    const ids = readRecentUniversities();
    if (ids.length)
      void universitiesByIds(ids)
        .then((data) => {
          if (live)
            setRows(ids.flatMap((id) => data.filter((u) => u.id === id)));
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!rows.length) return null;
  return (
    <section
      className="recent-exploration"
      aria-label="Recently explored universities"
    >
      <div className="split-heading">
        <div>
          <span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span>
          <p className="caption">Recently explored on this device</p>
        </div>
        <button
          className="text-link"
          onClick={() => {
            try {
              localStorage.removeItem(key);
            } catch {}
            setRows([]);
          }}
        >
          <X size={13} /> Clear
        </button>
      </div>
      <div className="recent-strip">
        {rows.map((u) => (
          <Link href={"/university/" + u.slug} key={u.id}>
            <UniversityLogo university={u} size="sm" />
            <span>{u.name}</span>
            <ArrowUpRight size={13} />
          </Link>
        ))}
      </div>
    </section>
  );
}
