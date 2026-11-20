import { notFound } from "next/navigation";
import Harness from "./harness";

// Temporary screenshot harness: served by the dev server only. Production builds answer 404.
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Harness />;
}
