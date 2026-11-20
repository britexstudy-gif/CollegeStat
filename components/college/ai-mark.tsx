"use client";
/* The AI mark (Nov 18, v3): a tiny "Spark" face, the same character as the chat mascot
 * (app/dashboard/assistant/mascot.tsx). Line version in currentColor for menus and inputs; the
 * tile version is the full gradient face. It blinks now and then, the star twinkles, and while
 * the AI is thinking the eyes look up. Motion stops with reduced motion (dashboard.css). */
import { useId } from "react";
import { cn } from "@/lib/utils";

export function AIMark({
  size = 20,
  tile = false,
  thinking = false,
  className,
}: {
  size?: number;
  tile?: boolean;
  thinking?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  if (tile)
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        aria-hidden="true"
        className={cn("ai-mark ai-mark-face", thinking && "is-thinking", className)}
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#5b8cff" />
            <stop offset="1" stopColor="#22c3e6" />
          </linearGradient>
        </defs>
        <path d="M15 4.5c8.6 0 11.5 3 11.5 11.5S23.6 28 15 28 3.5 24.6 3.5 16 6.4 4.5 15 4.5z" fill={`url(#${id})`} />
        <path d="M15 4.5c8.6 0 11.5 3 11.5 11.5" fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="1.2" strokeLinecap="round" />
        <g className="ai-mark-eyes">
          <rect x="10" y="12.5" width="3" height="6" rx="1.5" fill="#0d0d0d" />
          <rect x="17" y="12.5" width="3" height="6" rx="1.5" fill="#0d0d0d" />
        </g>
        <path className="ai-mark-dot" d="M27 1.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" fill="currentColor" />
      </svg>
    );
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("ai-mark", thinking && "is-thinking", className)}
    >
      <path
        d="M11 4c6 0 8.5 2.2 8.5 8.4S17 20.5 11 20.5 2.5 18.4 2.5 12.4 5 4 11 4z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <g className="ai-mark-eyes">
        <rect x="7.3" y="10" width="2.2" height="4.4" rx="1.1" fill="currentColor" />
        <rect x="12.5" y="10" width="2.2" height="4.4" rx="1.1" fill="currentColor" />
      </g>
      <path className="ai-mark-dot" d="M20 1.2l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7z" fill="currentColor" />
    </svg>
  );
}
