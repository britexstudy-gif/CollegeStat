import { redirect } from "next/navigation";

/** Preserve public resource bookmarks while keeping one reading destination. */
export default async function Page() {
  redirect("/articles");
}
