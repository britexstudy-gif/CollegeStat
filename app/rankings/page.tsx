import Rankings from "@/pages-ui/rankings";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata({
  title: "World university rankings",
  description: "Compare world and regional university rankings from leading publishers, with each publisher’s edition, methodology, and source linked.",
  path: "/rankings",
});
export default function RankingsPage() {
  return <Rankings />;
}
