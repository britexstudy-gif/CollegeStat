import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import Info from "@/pages-ui/info";
import { getSource } from "@/lib/source-library";
import Scholarships from "@/pages-ui/scholarships";
import { AuthForm } from "@/components/college/auth";
const infoPages: Record<string, { title: string; description: string }> = {
  methodology: {
    title: "Data methodology: how CollegeStat verifies university data",
    description: "How records are collected from primary sources, dated, verified and shown with their reporting year.",
  },
  sources: {
    title: "Sources: where CollegeStat data comes from",
    description: "Official university pages, education datasets and ranking publishers behind every figure, with retrieval dates.",
  },
  about: {
    title: "About CollegeStat",
    description: "CollegeStat is independent university research for students applying abroad, built on sourced data.",
  },
  terms: { title: "Terms of use", description: "The terms for using CollegeStat." },
  privacy: { title: "Privacy policy", description: "What CollegeStat stores about you, and how to delete it." },
};
export async function generateMetadata({ params }: { params: Promise<{ path: string[] }> }): Promise<Metadata> {
  const { path } = await params;
  const info = path.length === 1 && Object.hasOwn(infoPages, path[0]) ? infoPages[path[0]] : undefined;
  if (info) return pageMetadata({ ...info, path: "/" + path[0] });
  return { robots: { index: false, follow: false } };
}
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ path: string[] }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { path } = await params;
  if (["login", "signup"].includes(path[0])) {
    const query = searchParams ? await searchParams : undefined;
    const rawNext = query?.next;
    const next = Array.isArray(rawNext) ? rawNext[0] : rawNext;
    const target = "/auth/" + (path[0] === "login" ? "sign-in" : "sign-up");
    redirect(next ? target + "?next=" + encodeURIComponent(next) : target);
  }
  if (
    ["methodology", "sources", "about", "terms", "privacy"].includes(path[0]) &&
    path.length === 1
  )
    return <Info page={path[0]} />;
  if (
    path[0] === "resources" &&
    path.length === 2 &&
    getSource(path[1])
  )
    redirect("/articles/" + path[1]);
  if (path[0] === "scholarship" && path.length === 2)
    return <Scholarships slug={path[1]} />;
  if (
    path[0] === "auth" &&
    ["forgot-password", "reset-password"].includes(path[1])
  )
    return <AuthForm />;
  notFound();
}
