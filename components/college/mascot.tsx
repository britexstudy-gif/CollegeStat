"use client";
/* CollegeStat's AI mascot (Nov 18, v2): "Spark", a soft gradient squircle with pill eyes and a
 * small twinkling star. Original, minimal, plain SVG. The eyes follow the pointer a little and
 * blink now and then; all motion stops with reduced motion. */
import { useEffect, useId, useRef } from "react";
import "./mascot.css";

export function Mascot({ size = 112, busy = false }: { size?: number; busy?: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  const id = useId().replace(/:/g, "");

  // Eyes look toward the pointer (at most 3.5 units), updated once per frame.
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const d = Math.max(1, Math.hypot(dx, dy));
        const k = Math.min(1, d / 400) * 3.5;
        el.style.setProperty("--look-x", ((dx / d) * k).toFixed(2) + "px");
        el.style.setProperty("--look-y", ((dy / d) * k).toFixed(2) + "px");
      });
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
    };
  }, []);

  return (
    <svg
      ref={ref}
      className={"cs-mascot" + (busy ? " is-busy" : "")}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label="CollegeStat AI"
    >
      <defs>
        <linearGradient id={id + "b"} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="m-c1" />
          <stop offset="1" className="m-c2" />
        </linearGradient>
        <radialGradient id={id + "s"} cx="0.3" cy="0.22" r="0.6">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <filter id={id + "g"} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>
      {/* glow under the body */}
      <ellipse cx="60" cy="74" rx="34" ry="26" fill={`url(#${id}b)`} className="m-glow" filter={`url(#${id}g)`} />
      <ellipse cx="60" cy="110" rx="26" ry="3.5" className="m-shadow" />
      <g className="m-float">
        {/* body: a squircle */}
        <path d="M60 30c26 0 36 10 36 36s-10 38-36 38-36-12-36-38 10-36 36-36z" fill={`url(#${id}b)`} />
        <path d="M60 30c26 0 36 10 36 36s-10 38-36 38-36-12-36-38 10-36 36-36z" fill={`url(#${id}s)`} />
        {/* eyes */}
        <g className="m-eyes">
          <g className="m-look">
            <rect x="44" y="56" width="8" height="15" rx="4" className="m-eye" />
            <rect x="68" y="56" width="8" height="15" rx="4" className="m-eye" />
          </g>
        </g>
        {/* smile */}
        <path d="M54 80q6 4 12 0" className="m-smile" />
      </g>
      {/* spark */}
      <path d="M92 14l2.6 7.4L102 24l-7.4 2.6L92 34l-2.6-7.4L82 24l7.4-2.6z" className="m-spark" />
      <circle cx="104" cy="40" r="2" className="m-spark m-spark-2" />
    </svg>
  );
}
