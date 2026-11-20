import { notFound } from "next/navigation";
import Harness from "./harness";
import { publicUniversity } from "@/server/university";
import { splitProfile } from "@/server/profile-split";
import { profileExtras } from "@/server/profile-extras";
import { profileMore } from "@/server/profile-more";

// Temporary screenshot harness (u2): signed-in university page. Dev only; production answers 404.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const u = await publicUniversity((await searchParams).slug || "mit");
  if (!u) notFound();
  return <Harness slug={u.slug} university={splitProfile(u).lite} extras={{ ...profileExtras(u.id), ...(await profileMore(u)) }} />;
}
