"use client";
/*
 * DotGrid: a calm canvas dot field in the spirit of React Bits' DotGrid (https://reactbits.dev),
 * written here without GSAP. A soft accent glow drifts slowly over the field and lights the dots
 * under it. Colours come from the --dot-base / --dot-glow CSS variables so light and dark both work.
 * Paused while off screen or the tab is hidden; one static frame under prefers-reduced-motion.
 */
import { useEffect, useRef } from "react";

export interface DotGridProps {
  gap?: number;
  dotSize?: number;
  /** Seconds for one slow drift cycle. */
  period?: number;
  className?: string;
}

export default function DotGrid({ gap = 26, dotSize = 1.4, period = 40, className }: DotGridProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let w = 0;
    let h = 0;
    let dpr = 1;
    let base = "rgb(120 120 120)";
    let glow = "37 99 235";
    let raf = 0;
    let visible = true;
    let last = 0;
    const readColours = () => {
      const cs = getComputedStyle(canvas);
      base = cs.getPropertyValue("--dot-base").trim() || base;
      glow = cs.getPropertyValue("--dot-glow").trim() || glow;
    };
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      const a = (t / 1000 / period) * Math.PI * 2;
      // Two glows on slow, different orbits.
      const spots = [
        { x: w * (0.5 + 0.22 * Math.sin(a)), y: h * (0.4 + 0.12 * Math.cos(a * 1.3)), r: Math.min(w, 900) * 0.34 },
        { x: w * (0.5 + 0.3 * Math.cos(a * 0.8 + 1)), y: h * (0.46 + 0.1 * Math.sin(a + 2)), r: Math.min(w, 900) * 0.22 },
      ];
      const cols = Math.ceil(w / gap) + 1;
      const rows = Math.ceil(h / gap) + 1;
      ctx.fillStyle = base;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = i * gap + gap / 2;
          const y = j * gap + gap / 2;
          let lit = 0;
          for (const s of spots) {
            const d = Math.hypot(x - s.x, y - s.y) / s.r;
            if (d < 1) lit = Math.max(lit, (1 - d) * (1 - d));
          }
          ctx.beginPath();
          if (lit > 0.02) {
            ctx.fillStyle = `rgb(${glow} / ${0.22 + lit * 0.5})`;
            ctx.arc(x, y, dotSize * (1 + lit * 0.7), 0, Math.PI * 2);
          } else {
            ctx.fillStyle = base;
            ctx.arc(x, y, dotSize, 0, Math.PI * 2);
          }
          ctx.fill();
        }
      }
    };
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      readColours();
      draw(performance.now());
    };
    const loop = (now: number) => {
      raf = 0;
      if (!visible || reduce.matches || document.hidden) return;
      // About 30 fps is plenty for a slow drift.
      if (now - last > 33) {
        last = now;
        draw(now);
      }
      raf = requestAnimationFrame(loop);
    };
    const kick = () => {
      if (!raf && visible && !reduce.matches && !document.hidden) raf = requestAnimationFrame(loop);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) kick();
    });
    io.observe(canvas);
    const theme = new MutationObserver(() => {
      readColours();
      draw(performance.now());
    });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const onChange = () => (reduce.matches ? draw(0) : kick());
    reduce.addEventListener("change", onChange);
    document.addEventListener("visibilitychange", kick);
    resize();
    kick();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      theme.disconnect();
      reduce.removeEventListener("change", onChange);
      document.removeEventListener("visibilitychange", kick);
    };
  }, [gap, dotSize, period]);
  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
