import type { Metadata } from "next";
import { RankingsView } from "@/components/college/rankings-view";
import { JsonLd } from "@/components/seo/json-ld";
import { rankingPublishers } from "@/lib/ranking-highlights";
import { buildBreadcrumbJsonLd, buildItemListJsonLd } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { rankingsView } from "@/server/rankings-view";

export const metadata: Metadata = pageMetadata({
  title: "University rankings: QS, THE, ARWU and national tables",
  description:
    "Compare world and national university rankings from QS, Times Higher Education, ARWU and others. Every position keeps its publisher, edition and scope.",
  path: "/rankings",
});

export default async function RankingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (typeof value === "string") params.set(key, value);
  return (
    <>
      <JsonLd
        data={[
          buildBreadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Rankings", path: "/rankings" }]),
          buildItemListJsonLd(
            "Ranking publishers",
            Object.values(rankingPublishers).map((p) => ({ name: `${p.name} World University Rankings ${p.year}`, path: p.url })),
          ),
        ]}
      />
      <div className="public-page-shell">
        <RankingsView data={await rankingsView(params)} />
      </div>
    </>
  );
}
