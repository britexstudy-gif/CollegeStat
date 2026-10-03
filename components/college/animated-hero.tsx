/* eslint-disable @next/next/no-img-element -- Locally generated artwork and video poster. */
"use client";
import { useEffect, useRef, useState } from "react";

/** One continuous scene. No image swaps, layout movement, or autoplay audio. */
export function AnimatedHero() {
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const finished = useRef(false);
  const [reduced, setReduced] = useState(true);
  const [visible, setVisible] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const device = navigator as Navigator & { connection?: { saveData?: boolean } };
    const update = () => setReduced(preference.matches || !!device.connection?.saveData);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    let intersecting = true;
    const update = () => setVisible(intersecting && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting;
      update();
    });
    if (frame.current) observer.observe(frame.current);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (finished.current || reduced || !visible || failed) element.pause();
    else void element.play().catch(() => element.pause());
  }, [reduced, visible, failed]);
  return (
    <div className="open-hero-art animated-campus" ref={frame}>
      <div
        className="hero-film"
        role="group"
        aria-label="Blue editorial collage of a student, university buildings and an ascending plane, with a slow camera movement"
      >
        {reduced || failed ? (
          <img
            src="/images/hero/blue-collage.webp"
            alt=""
            width={1536}
            height={1024}
            fetchPriority="high"
          />
        ) : (
          <video
            ref={video}
            muted
            playsInline
            preload="none"
            poster="/images/hero/blue-collage.webp"
            aria-hidden="true"
            onTimeUpdate={() => {
              if (video.current && video.current.currentTime >= 5) {
                finished.current = true;
                video.current.pause();
              }
            }}
            onError={() => setFailed(true)}
          >
            <source src="/images/hero/blue-collage-loop.mp4" type="video/mp4" />
          </video>
        )}

      </div>
      <span className="art-note">Your future, wide open.</span>
    </div>
  );
}
