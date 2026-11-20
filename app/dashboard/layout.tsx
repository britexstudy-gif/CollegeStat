import { Suspense } from "react";
import Workspace from "@/pages-ui/workspace";
import { DashboardAuthRedirect } from "@/components/college/dashboard-auth-redirect";
export const metadata = {
  title: "Your workspace",
  robots: { index: false, follow: false },
};
/** The controller and editors stay mounted across nested discovery routes.
 * Signed-out requests never reach here: proxy.ts redirects them to sign-in. */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Suspense fallback={null}>
        <DashboardAuthRedirect />
      </Suspense>
      <Workspace embedded>{children}</Workspace>
    </>
  );
}
