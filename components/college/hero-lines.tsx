/* Soft lines into the landing hero's product picture, in CollegeStat's calm style: three thin
 * lines per side run in from the screen edge, make one gentle rounded turn, and meet the
 * picture's side. A soft brand-blue glow drifts along each line into the picture.
 * Pure SVG + CSS; the pulses stop under prefers-reduced-motion. */

// Paths in a 100x100 box, stretched to the side's size; the turns are soft curves.
const TRACES: { d: string; delay: number }[] = [
  { d: "M0 16 H30 Q38 16 38 23 V27 Q38 34 46 34 H100", delay: 0 },
  { d: "M0 58 H54 Q62 58 62 54 V52 Q62 48 70 48 H100", delay: 1.8 },
  { d: "M0 92 H18 Q26 92 26 84 V76 Q26 68 34 68 H100", delay: 3.4 },
];

function Side({ flip }: { flip?: boolean }) {
  return (
    <svg className={"lp-beams-side" + (flip ? " is-right" : "")} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {TRACES.map(({ d, delay }, i) => (
        <g key={i}>
          <path d={d} className="lp-beam" vectorEffect="non-scaling-stroke" />
          <path d={d} className="lp-beam-glow" vectorEffect="non-scaling-stroke" pathLength={100} style={{ animationDelay: `${delay + (flip ? 0.6 : 0)}s` }} />
          <path d={d} className="lp-beam-pulse" vectorEffect="non-scaling-stroke" pathLength={100} style={{ animationDelay: `${delay + (flip ? 0.6 : 0)}s` }} />
        </g>
      ))}
    </svg>
  );
}

export function HeroBeams() {
  return (
    <div className="lp-beams" aria-hidden="true">
      <Side />
      <Side flip />
    </div>
  );
}
