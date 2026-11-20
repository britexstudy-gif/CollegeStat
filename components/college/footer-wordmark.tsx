"use client";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
const ParticleText = dynamic(() => import("./react-bits/ParticleText"), {
  ssr: false,
  loading: () => <span className="wordmark-placeholder">CollegeStat.</span>,
});
export function FooterWordmark() {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <div className="footer-wordmark" role="img" aria-label="CollegeStat">
      <ParticleText
        text="CollegeStat."
        color={dark ? "#f2f3f5" : "#15171c"}
        highlightColor="#2563eb"
        fontSize="clamp(64px, 18vw, 280px)"
        fontWeight={700}
        density={3}
        particleSize={2.6}
        scatter={65}
        gatherDuration={1100}
        stagger={180}
        idleDrift={0.25}
        pointerRepel={14}
        repelRadius={90}
        trigger="visible"
        glow={false}
      />
    </div>
  );
}
