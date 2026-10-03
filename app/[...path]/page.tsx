import { notFound, redirect } from "next/navigation";
import Info from "@/pages-ui/info";
import { guides } from "@/lib/guides";
import Resources from "@/pages-ui/resources";
import Scholarships from "@/pages-ui/scholarships";
import { AuthForm } from "@/components/college/auth";
export default async function Page({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
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
