import type { Publisher } from "@/lib/ranking-highlights";
const marks = {
  qs: { name: "QS World University Rankings", src: "/logos/publishers/qs.png" },
  the: { name: "Times Higher Education", src: "/logos/publishers/the.svg" },
  arwu: { name: "ShanghaiRanking", src: "/logos/publishers/arwu.svg" },
  leiden: { name: "CWTS Leiden Ranking", src: "/logos/publishers/leiden.png" },
};
export function PublisherMark({
  provider,
}: {
  provider: Publisher | "leiden";
}) {
  const mark = marks[provider];
  return (
    <span className={`publisher-mark publisher-${provider}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mark.src} alt={mark.name} width={100} height={40} />
    </span>
  );
}
