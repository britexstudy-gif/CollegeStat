"use client";
import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode, type RefObject } from "react";
import "./reveal.css";

/**
 * Reveal every element matching `selector` inside `root` as it scrolls into view.
 * Siblings get a small stagger (`stagger` ms each, capped). Elements already on
 * screen when the page loads are left alone, so nothing above the fold flashes.
 */
export function useScrollReveal(root: RefObject<HTMLElement | null>, selector: string, stagger = 70) {
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const nodes = [...el.querySelectorAll<HTMLElement>(selector)];
    const fold = window.innerHeight * 0.92;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).dataset.rv = "in";
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    for (const node of nodes) {
      if (node.getBoundingClientRect().top < fold) continue;
      const siblings = node.parentElement ? [...node.parentElement.children].filter((c) => nodes.includes(c as HTMLElement)) : [];
      const i = Math.max(0, siblings.indexOf(node));
      node.style.setProperty("--rv-delay", Math.min(i, 5) * stagger + "ms");
      node.dataset.rv = "wait";
      io.observe(node);
    }
    return () => {
      io.disconnect();
      for (const node of nodes) if (node.dataset.rv === "wait") node.dataset.rv = "in";
    };
  }, [root, selector, stagger]);
}

/**
 * Scroll reveal: children fade and rise in once when they enter the viewport.
 * Server HTML is fully visible (no flash for crawlers or slow JS); the hidden
 * state is applied only after hydration for elements still below the fold.
 * prefers-reduced-motion turns the motion off in CSS (globals: .rv).
 */
export function Reveal({
  as: Tag = "div",
  delay = 0,
  className = "",
  style,
  children,
  ...rest
}: {
  as?: ElementType;
  /** Stagger in ms. */
  delay?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
} & Record<string, unknown>) {
  const ref = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<"idle" | "wait" | "in">("idle");
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    // Already on screen at hydration: leave it visible, no animation.
    if (node.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    setState("wait");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState("in");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={ref}
      data-rv={state}
      className={"rv " + className}
      style={{ ...style, "--rv-delay": delay + "ms" } as CSSProperties}
      {...rest}
    >
      {children}
    </Tag>
  );
}
