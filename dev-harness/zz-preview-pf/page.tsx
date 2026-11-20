import { notFound } from "next/navigation";
import Harness from "./harness";

// Temporary screenshot harness for the profile work: served by the dev server only. Delete before shipping.
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Harness />;
}
