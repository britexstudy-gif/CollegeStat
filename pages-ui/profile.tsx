"use client";
import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCollege } from "@/components/college/provider";
import { EmptyState } from "@/components/college/primitives";
import { ProfileSettings } from "@/components/college/profile-settings";
import { useT } from "@/components/college/i18n";

// Older private qualification records stay reachable at ?tab=Qualifications.
const StudentQualifications = dynamic(() => import("@/components/college/student-qualifications").then((m) => m.StudentQualifications));

export default function Profile() {
  const s = useCollege();
  const t = useT();
  const tab = useSearchParams().get("tab");
  if (!s.authReady)
    return (
      <div className="mx-auto grid w-full max-w-[960px] gap-4" role="status" aria-label={t("d2.pf.loading")}>
        <div className="h-64 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
        <div className="h-48 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
      </div>
    );
  if (!s.user)
    return (
      <EmptyState
        title={t("d2.pf.signin.title")}
        description={t("d2.pf.signin.text")}
        action={
          <Button asChild className="rounded-full">
            <Link href="/auth/sign-in?next=/dashboard/profile">
              {t("nav.sign_in")} <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        }
      />
    );
  if (!s.profile) return <ProfileRecovery />;
  if (tab === "Qualifications")
    return (
      <div className="mx-auto grid w-full max-w-[960px] gap-4">
        <Link href="/dashboard/profile" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" /> {t("pf.title")}
        </Link>
        <StudentQualifications />
      </div>
    );
  return <ProfileSettings key={s.profile.id} />;
}

function ProfileRecovery() {
  const s = useCollege();
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <EmptyState
      title={t("d2.pf.recover.title")}
      description={t("d2.pf.recover.text")}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            className="rounded-full"
            disabled={busy}
            onClick={async () => {
              const owner = s.accountScope.capture();
              if (!owner.owner || owner.owner !== s.user?.id) return;
              setBusy(true);
              try {
                await s.refreshAccount();
              } catch {
                if (s.accountScope.isCurrent(owner)) toast.error(t("d2.pf.recover.error"));
              } finally {
                if (s.accountScope.isCurrent(owner)) setBusy(false);
              }
            }}
          >
            {busy ? t("d2.pf.recover.busy") : t("d2.pf.recover.retry")}
          </Button>
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/dashboard">{t("dash.home")}</Link>
          </Button>
        </div>
      }
    />
  );
}
