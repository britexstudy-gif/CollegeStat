import { permanentRedirect } from "next/navigation";

/** Plans live on the landing page (#pricing); the old /pricing URL points there.
 * Signed-in students manage their plan at /dashboard/plans. */
export default function Pricing() {
  permanentRedirect("/#pricing");
}
