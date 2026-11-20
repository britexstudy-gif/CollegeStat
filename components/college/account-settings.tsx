"use client";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { ArrowRight, Download, LogOut, Monitor, Moon, Sun, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { LANGUAGES, isLang } from "@/lib/i18n/languages";
import { exportAccount } from "@/services/workspace";
import { deleteProfileAccount } from "@/services/profile-account";
import type { AccountToken } from "@/lib/account-owner";
import { useCollege } from "./provider";
import { useI18n } from "./i18n";
import { Btn, List, ListRow, Page, PageHeader, Section, Select } from "./dash-ui";

/** Account settings: email, language, appearance, export, sign out and delete.
 * The profile form (grades, tests, goals) lives on /dashboard/profile. */
export function AccountSettings() {
  const s = useCollege();
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState<"" | "export" | "signout" | "delete">("");
  const [deleted, setDeleted] = useState<AccountToken | null>(null);
  const running = useRef(false);
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);
  const current = (owner: AccountToken) => s.accountScope.isCurrent(owner);
  const run = async (kind: "export" | "signout" | "delete", job: (owner: AccountToken) => Promise<void>) => {
    if (!s.user || running.current) return;
    const owner = s.accountScope.capture();
    if (owner.owner !== s.user.id) return;
    running.current = true;
    setBusy(kind);
    try {
      await job(owner);
    } catch {
      if (current(owner)) toast.error(t("oc.set.error"));
    } finally {
      running.current = false;
      setBusy("");
    }
  };

  if (deleted)
    return (
      <Page>
        <PageHeader title={t("oc.set.deleted")} actions={<Btn variant="primary" href="/">{t("oc.set.home")}</Btn>} />
      </Page>
    );

  const themes = [
    { value: "light", label: t("oc.set.theme.light"), Icon: Sun },
    { value: "dark", label: t("oc.set.theme.dark"), Icon: Moon },
    { value: "system", label: t("oc.set.theme.system"), Icon: Monitor },
  ];
  return (
    <Page className="set">
      <PageHeader title={t("db.settings")} description={t("oc.set.sub")} />

      <Section id="set-account" title={t("oc.set.account")}>
        <List>
          <ListRow title={t("oc.set.email")} meta={s.user?.email || "—"} />
          <ListRow
            title={t("oc.set.profile")}
            meta={t("oc.set.profile.text")}
            trailing={
              <Btn size="sm" href="/dashboard/profile">
                {t("oc.set.profile.cta")} <ArrowRight aria-hidden="true" />
              </Btn>
            }
          />
        </List>
      </Section>

      <Section id="set-prefs" title={t("oc.set.prefs")}>
        <List>
          <ListRow
            title={<label htmlFor="set-lang">{t("oc.set.lang")}</label>}
            meta={t("oc.set.lang.text")}
            trailing={
              <Select id="set-lang" value={lang} onChange={(e) => isLang(e.target.value) && setLang(e.target.value)} className="min-w-40">
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </Select>
            }
          />
          <ListRow
            className="set-wrap"
            title={<span id="set-theme">{t("oc.set.theme")}</span>}
            meta={t("oc.set.theme.text")}
            trailing={
              <div className="dk-seg" role="radiogroup" aria-labelledby="set-theme">
                {themes.map(({ value, label, Icon }) => (
                  <button key={value} type="button" role="radio" aria-checked={mounted && (theme || "system") === value} onClick={() => setTheme(value)}>
                    <Icon aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
            }
          />
        </List>
      </Section>

      <Section id="set-data" title={t("oc.set.data")}>
        <List>
          <ListRow
            title={t("oc.set.export")}
            meta={t("oc.set.export.text")}
            trailing={
              <Btn size="sm" disabled={!!busy} onClick={() => void run("export", async () => exportAccount(s.user!.id, s.accountScope))}>
                <Download aria-hidden="true" /> {t("oc.set.export.btn")}
              </Btn>
            }
          />
          <ListRow
            title={t("nav.sign_out")}
            meta={t("oc.set.signout.text")}
            trailing={
              <Btn size="sm" disabled={!!busy} onClick={() => void run("signout", async () => s.signOut())}>
                <LogOut aria-hidden="true" /> {t("nav.sign_out")}
              </Btn>
            }
          />
          <ListRow
            title={<span className="text-[var(--dk-danger)]">{t("oc.set.delete")}</span>}
            meta={t("oc.set.delete.text")}
            trailing={
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Btn size="sm" variant="danger" disabled={!!busy}>
                    <Trash2 aria-hidden="true" /> {t("oc.set.delete.btn")}
                  </Btn>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("oc.set.delete.confirm")}</AlertDialogTitle>
                    <AlertDialogDescription>{t("oc.set.delete.text")}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("oc.set.delete.keep")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        void run("delete", async (owner) => {
                          await deleteProfileAccount(s.accountScope, owner);
                          // The sign-in stays; with the profile gone, start again from onboarding.
                          await s.refreshAccount().catch(() => {});
                          if (s.accountScope.isCurrent(owner)) window.location.replace(new URL("/dashboard/welcome", window.location.origin).href);
                          else setDeleted(owner);
                        })
                      }
                    >
                      {t("oc.set.delete.go")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            }
          />
        </List>
      </Section>
    </Page>
  );
}
