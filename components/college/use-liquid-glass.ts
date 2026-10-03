"use client";
import { useCallback, useEffect, useId, useState } from "react";
import { glassMap, glassMapSize } from "@/lib/glass-map";

const cache = new Map<string, string>();
const ns = "http://www.w3.org/2000/svg";

/** Progressive enhancement only. No animation loop, scroll listener, external asset or dependency. */
export function useLiquidGlass<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const ref = useCallback((node: T | null) => setElement(node), []);
  const id = "cs-glass-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  useEffect(() => {
    if (!element) return;
    const media = window.matchMedia(
      "(min-width: 360px) and (prefers-reduced-motion: no-preference) and (prefers-reduced-transparency: no-preference) and (prefers-contrast: no-preference)",
    );
    const device = navigator as Navigator & {
      connection?: { saveData?: boolean };
      deviceMemory?: number;
    };
    const capable =
      /Chrome\//.test(navigator.userAgent) &&
      CSS.supports("backdrop-filter", 'url("#' + id + '")') &&
      !device.connection?.saveData &&
      (device.deviceMemory == null || device.deviceMemory >= 4) &&
      (navigator.hardwareConcurrency || 4) >= 4;
    if (!capable) return;
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.style.position = "absolute";
    svg.style.pointerEvents = "none";
    const defs = document.createElementNS(ns, "defs");
    const filter = document.createElementNS(ns, "filter");
    filter.id = id;
    filter.setAttribute("x", "0");
    filter.setAttribute("y", "0");
    filter.setAttribute("width", "100%");
    filter.setAttribute("height", "100%");
    filter.setAttribute("color-interpolation-filters", "sRGB");
    const map = document.createElementNS(ns, "feImage");
    map.setAttribute("result", "lens");
    map.setAttribute("preserveAspectRatio", "none");
    const displacement = document.createElementNS(ns, "feDisplacementMap");
    displacement.setAttribute("in", "SourceGraphic");
    displacement.setAttribute("in2", "lens");
    displacement.setAttribute("scale", "32");
    displacement.setAttribute("xChannelSelector", "R");
    displacement.setAttribute("yChannelSelector", "G");
    filter.appendChild(map);
    filter.appendChild(displacement);
    defs.appendChild(filter);
    svg.appendChild(defs);
    document.body.appendChild(svg);
    let timer: ReturnType<typeof setTimeout> | undefined,
      visible = false,
      last = "";
    const clear = () => {
      delete element.dataset.refraction;
      element.style.removeProperty("--glass-filter");
    };
    const render = () => {
      if (!media.matches || !visible || document.hidden) {
        clear();
        return;
      }
      const rect = element.getBoundingClientRect();
      displacement.setAttribute(
        "scale",
        String(Math.min(32, rect.height * 0.45)),
      );
      const size = glassMapSize(rect.width, rect.height);
      if (!size) {
        clear();
        return;
      }
      const bezel =
        parseFloat(
          getComputedStyle(element).getPropertyValue("--glass-bezel"),
        ) || 10;
      const radius =
        parseFloat(getComputedStyle(element).borderTopLeftRadius) || 18;
      const key = [
        size.width,
        size.height,
        Math.round(radius * size.scale),
        Math.round(bezel * size.scale),
      ].join(":");
      if (key !== last) {
        let url = cache.get(key);
        if (!url) {
          const canvas = document.createElement("canvas");
          canvas.width = size.width;
          canvas.height = size.height;
          const context = canvas.getContext("2d");
          if (!context) {
            clear();
            return;
          }
          const data = context.createImageData(size.width, size.height);
          data.data.set(
            glassMap(
              size.width,
              size.height,
              radius * size.scale,
              bezel * size.scale,
            ),
          );
          context.putImageData(data, 0, 0);
          url = canvas.toDataURL("image/png");
          if (cache.size >= 12) cache.delete(cache.keys().next().value!);
          cache.set(key, url);
        }
        map.setAttribute("href", url);
        last = key;
      }
      // SVG backdrop filter primitives need the surface's actual dimensions, even with a smaller map.
      map.setAttribute("width", String(rect.width));
      map.setAttribute("height", String(rect.height));
      element.style.setProperty("--glass-filter", 'url("#' + id + '")');
      element.dataset.refraction = "ready";
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(render, 140);
    };
    const resize = new ResizeObserver(schedule);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      schedule();
    });
    resize.observe(element);
    intersection.observe(element);
    media.addEventListener("change", schedule);
    document.addEventListener("visibilitychange", schedule);
    return () => {
      clearTimeout(timer);
      resize.disconnect();
      intersection.disconnect();
      media.removeEventListener("change", schedule);
      document.removeEventListener("visibilitychange", schedule);
      clear();
      svg.remove();
    };
  }, [id, element]);
  return ref;
}
