

export function PeopleArt() {
  return (
    <svg className="hub-art hub-people" viewBox="0 0 120 56" aria-hidden="true">
      {[
        [22, "var(--art-mint)"],
        [60, "var(--art-accent)"],
        [98, "var(--art-warm)"],
      ].map(([x, color], i) => (
        <g key={i} className="hub-people-bob" style={{ animationDelay: `${i * 0.25}s` }}>
          <circle cx={x as number} cy={18} r={9} fill={color as string} />
          <path
            d={`M${(x as number) - 15} 52c0-11 7-18 15-18s15 7 15 18z`}
            fill={color as string}
            fillOpacity=".7"
          />
        </g>
      ))}
    </svg>
  );
}

export function TrophyArt() {
  return (
    <svg className="hub-art hub-trophy" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M20 10h24v14a12 12 0 01-24 0z" fill="var(--art-warm)" />
      <path d="M20 14h-7v4a8 8 0 008 8M44 14h7v4a8 8 0 01-8 8" stroke="var(--art-warm)" strokeWidth="3" fill="none" />
      <path d="M28 36h8v8h-8z" fill="var(--art-warm)" fillOpacity=".75" />
      <rect x="20" y="44" width="24" height="8" rx="3" fill="var(--art-ink)" />
      <path className="hub-art-twinkle" d="M50 4c1 3 2 4 5 5-3 1-4 2-5 5-1-3-2-4-5-5 3-1 4-2 5-5z" fill="var(--art-warm)" />
    </svg>
  );
}
