import { notFound, redirect } from "next/navigation";
import Info from "@/pages-ui/info";
import { guides } from "@/lib/guides";
import Resources from "@/pages-ui/resources";
import Scholarships from "@/pages-ui/scholarships";
import { AuthForm } from "@/components/college/auth";
import { currentScholarships } from "@/server/scholarship-catalogue";
import { pageMetadata, privateMetadata } from "@/lib/seo";
type Props = { params: Promise<{ path: string[] }> };
const infoPages: Record<string, { title: string; description: string }> = {
  methodology: {
    title: "Methodology",
    description: "How CollegeStat sources, verifies, and compares university data: primary sources, reporting years, missing values, and ranking permissions.",
  },
  sources: {
    title: "Data sources",
    description: "Every dataset behind CollegeStat, with publisher, licence, coverage, and retrieval date.",
  },
  about: {
    title: "About",
    description: "CollegeStat helps students research universities with sourced, transparent data instead of guesswork.",
  },
  terms: { title: "Terms of use", description: "The terms for using CollegeStat and its university research data." },
  privacy: { title: "Privacy", description: "How CollegeStat handles your account, saved universities, and research notes." },
};
export async function generateMetadata({ params }: Props) {
  const { path } = await params;
  if (path.length === 1 && infoPages[path[0]])
    return pageMetadata({ ...infoPages[path[0]], path: "/" + path[0] });
  const guide = path[0] === "resources" && path.length === 2 && guides.find((g) => g.id === path[1]);
  if (guide)
    return pageMetadata({
      title: guide.title.replace(/\.$/, ""),
      description: `${guide.subtitle}. ${guide.body[0]}`,
      path: `/resources/${guide.id}`,
    });
  const award = path[0] === "scholarship" && path.length === 2 && currentScholarships.find((s) => s.slug === path[1]);
  if (award)
    return pageMetadata({
      title: award.name,
      description: award.description || `Eligibility, funding, and deadlines for ${award.name}.`,
      path: `/scholarship/${award.slug}`,
    });
  if (path[0] === "auth") return privateMetadata("Account");
  return {};
}
export default async function Page({
  params,
}: Props) {
  const { path } = await params;
  if (["login", "signup"].includes(path[0]))
    redirect("/auth/" + (path[0] === "login" ? "sign-in" : "sign-up"));
  if (
    ["methodology", "sources", "about", "terms", "privacy"].includes(path[0]) &&
    path.length === 1
  )
    return <Info page={path[0]} />;
  if (
    path[0] === "resources" &&
    path.length === 2 &&
    guides.some((g) => g.id === path[1])
  )
    return <Resources id={path[1]} />;
  if (path[0] === "scholarship" && path.length === 2)
    return <Scholarships slug={path[1]} />;
  if (
    path[0] === "auth" &&
    ["forgot-password", "reset-password"].includes(path[1])
  )
    return <AuthForm />;
  notFound();
}
