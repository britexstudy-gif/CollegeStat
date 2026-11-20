"use client";
/* /dashboard/profile as a settings hub (Nov 19): a left list of sections, content on the right;
 * on a phone the list is the first screen and each section opens on its own. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  KeyRound,
  LogOut,
  Monitor,
  Moon,
  Sun,
  Trash2,
} from "lucide-react";
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
import { deleteProfileAccount, saveProfile } from "@/services/profile-account";
import type { AccountToken } from "@/lib/account-owner";
import { getSupabase } from "@/lib/supabase/client";
import { clearSignIns, recordSignIn, type SignIn } from "@/lib/profile-signins";
import { snapshotFrom } from "@/lib/student-profile";
import { GRADE_SCALES } from "@/lib/grades/convert";
import { programme, programmeKey } from "@/lib/programmes";
import { regionName } from "@/lib/region-name";
import { effectivePlan } from "@/lib/plans";
import type { MessageKey } from "@/lib/i18n/messages";
import { useCollege } from "./provider";
import { useI18n } from "./i18n";
import { certTest, testScore } from "./onboarding-steps";
import { AcademicProfile } from "./profile-overview";
import type { CollegeRow } from "./workspace-oneprep-overview";
import { Btn, Input, List, ListRow, Select, StatusPill } from "./dash-ui";
import "./profile-settings.css";
import { AvatarBuilder } from "./avatar-builder";

/* Nov 19 (v3): a profile like the ChatGPT app. Avatar and name on top, then
 * grouped rows (label left, value and chevron right); each row opens a detail
 * view or the matching onboarding question. No tab bar. */
type View = "home" | "academic" | "personal" | "general" | "prefs" | "security" | "data";
const VIEWS: View[] = ["academic", "personal", "general", "prefs", "security", "data"];
const viewOf = (x: string | null): View => (x && (VIEWS as string[]).includes(x) ? (x as View) : "home");

export function ProfileSettings({ previewColleges }: { previewColleges?: CollegeRow[] } = {}) {
  const { t } = useI18n();
  const param = useSearchParams().get("section");
  const [view, setView] = useState<View>(viewOf(param));
  const top = useRef<HTMLDivElement>(null);
  const go = (v: View) => {
    setView(v);
    try {
      history.replaceState(null, "", v === "home" ? location.pathname : "?section=" + v);
    } catch {
      /* ignore */
    }
    top.current?.scrollIntoView({ block: "start" });
  };
  if (view === "academic")
    return (
      <div className="pfs pfs--wide" ref={top}>
        <BackBar onBack={() => go("home")} />
        <AcademicProfile previewColleges={previewColleges} />
      </div>
    );
  if (view !== "home")
    return (
      <div className="pfs" ref={top}>
        <BackBar onBack={() => go("home")} />
        <h1 className="pfs-h1">{t(("pfs.s." + view) as MessageKey)}</h1>
        {view === "personal" && <Personal />}
        {view === "general" && <General />}
        {view === "prefs" && <Prefs />}
        {view === "security" && <Security />}
        {view === "data" && <DataPrivacy />}
      </div>
    );
  return (
    <div className="pfs" ref={top}>
      <ProfileHome go={go} />
    </div>
  );
}

function BackBar({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  return (
    <button type="button" className="pfs-backbar" onClick={onBack}>
      <ChevronLeft aria-hidden="true" /> {t("pfs.h.student")}
    </button>
  );
}

function Row({ label, value, onClick, href, danger }: { label: ReactNode; value?: ReactNode; onClick?: () => void; href?: string; danger?: boolean }) {
  const inner = (
    <>
      <span className="pfs-row-label">{label}</span>
      {value != null && <span className="pfs-row-value">{value}</span>}
      <ChevronRight className="pfs-row-go" aria-hidden="true" />
    </>
  );
  const cls = "pfs-row" + (danger ? " is-danger" : "");
  return <li>{href ? <a className={cls} href={href}>{inner}</a> : <button type="button" className={cls} onClick={onClick}>{inner}</button>}</li>;
}

function Group({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="pfs-group">
      <h2>{title}</h2>
      <ul>{children}</ul>
    </section>
  );
}

function ProfileHome({ go }: { go: (v: View) => void }) {
  const saveProfileRow = useProfileSave();
  const s = useCollege();
  const { t, lang } = useI18n();
  const snap = useMemo(() => snapshotFrom(s.profile?.preferences), [s.profile?.preferences]);
  const name = s.profile?.display_name?.trim() || s.user?.email?.split("@")[0] || "";
  const plan = effectivePlan(s.profile?.preferences);
  const add = <span className="pfs-row-add">{t("pfs.r.notset")}</span>;
  const step = (id: string) => "/dashboard/welcome?step=" + id;
  const majors = snap.majors.slice(0, 2).map((m) => {
    const p = programme(m);
    return p ? t(programmeKey(p) as MessageKey) : m;
  });
  const tests = snap.tests
    .filter((x) => x.status === "taken" && x.score)
    .slice(0, 3)
    .map((x) => x.id.toUpperCase().replace("_", " ") + " " + x.score);
  const budget = snap.funding === "full" ? t("pfs.r.funding") : snap.budget ? (snap.budget >= 90000 ? "$50k+" : "$" + Math.round(snap.budget / 1000) + "k") : null;
  return (
    <>
      <header className="pfs-hero">
        <AvatarBuilder save={(avatar) => saveProfileRow({ preferences: { avatar } })} />
        <h1>{name}</h1>
        <p>{s.user?.email}</p>
        <span className="pfs-plan">{t(`d2.plan.${plan}.name` as MessageKey)}</span>
      </header>

      <Group title={t("pfs.h.student")}>
        <Row label={t("pfs.r.from")} value={snap.home ? regionName(snap.home, lang) : add} href={step("home")} />
        <Row label={t("pfs.r.where")} value={snap.dreams.length ? snap.dreams.slice(0, 3).map((c) => regionName(c, lang)).join(", ") : add} href={step("countries")} />
        <Row label={t("pfs.r.major")} value={majors.length ? majors.join(", ") : add} href={step("subjects")} />
        <Row label={t("pfs.r.start")} value={snap.start_year || add} href={step("year")} />
        <Row label={t("pfs.r.grades")} value={snap.grade ? snap.grade.value : add} href={step("gpa")} />
        <Row label={t("pfs.r.tests")} value={tests.length ? tests.join(" · ") : add} href={step("tests")} />
        <Row label={t("pfs.r.budget")} value={budget || add} href={step("budget")} />
        <Row label={t("pfs.r.full")} onClick={() => go("academic")} />
      </Group>

      <Group title={t("pfs.h.app")}>
        <Row label={t("pfs.s.personal")} value={t("pfs.d.personal")} onClick={() => go("personal")} />
        <Row label={t("pfs.s.prefs")} value={t("pfs.d.prefs")} onClick={() => go("prefs")} />
      </Group>

      <Group title={t("pfs.h.account")}>
        <Row label={t("pfs.s.general")} value={t("pfs.d.general")} onClick={() => go("general")} />
        <Row label={t("pfs.s.security")} value={t("pfs.d.security")} onClick={() => go("security")} />
        <Row label={t("pfs.s.data")} value={t("pfs.d.data")} onClick={() => go("data")} />
      </Group>

      <ul className="pfs-group pfs-group--solo">
        <li>
          <button type="button" className="pfs-row is-danger" onClick={() => void s.signOut()}>
            <LogOut aria-hidden="true" /> <span className="pfs-row-label">{t("nav.sign_out")}</span>
          </button>
        </li>
      </ul>
    </>
  );
}

function Block({ title, note, children }: { title?: ReactNode; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="pfs-block">
      {title && <h3>{title}</h3>}
      {note && <p className="pfs-note">{note}</p>}
      {children}
    </section>
  );
}

/** Save a change to the profile row. Returns true on success. */
function useProfileSave() {
  const s = useCollege();
  const { t } = useI18n();
  return async (patch: { display_name?: string | null; preferences?: Record<string, unknown> }) => {
    if (!s.user || !s.profile) return false;
    const owner = s.accountScope.capture();
    if (owner.owner !== s.user.id) return false;
    try {
      await saveProfile(
        s.accountScope,
        {
          display_name: patch.display_name === undefined ? (s.profile.display_name ?? null) : patch.display_name,
          preferences: { ...(s.profile.preferences || {}), ...(patch.preferences || {}) },
        },
        owner,
      );
      await s.refreshAccount();
      return true;
    } catch {
      if (s.accountScope.isCurrent(owner)) toast.error(t("pfs.error"));
      return false;
    }
  };
}

function General() {
  const s = useCollege();
  const { t } = useI18n();
  const save = useProfileSave();
  const saved = s.profile?.display_name ?? "";
  const [name, setName] = useState(saved);
  const [busy, setBusy] = useState(false);
  const plan = effectivePlan(s.profile?.preferences);
  return (
    <Block>
      <List>
        <ListRow
          className="pfs-wrap"
          title={<label htmlFor="pfs-name">{t("pfs.name")}</label>}
          meta={t("pfs.name.text")}
          trailing={
            <form
              className="pfs-inline"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                const ok = await save({ display_name: name.trim() || null });
                setBusy(false);
                if (ok) toast(t("pfs.saved"));
              }}
            >
              <Input id="pfs-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
              <Btn size="sm" type="submit" variant="primary" disabled={busy || name.trim() === saved.trim()}>
                {t("pfs.save")}
              </Btn>
            </form>
          }
        />
        <ListRow title={t("pfs.email")} meta={s.user?.email || "—"} />
        <ListRow
          title={t("pfs.plan")}
          meta={t(`d2.plan.${plan}.name` as MessageKey)}
          trailing={
            <Btn size="sm" href="/dashboard/plans">
              {t("pfs.plan.manage")} <ArrowRight aria-hidden="true" />
            </Btn>
          }
        />
      </List>
    </Block>
  );
}

function Prefs() {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);
  const themes = [
    { value: "light", label: t("oc.set.theme.light"), Icon: Sun },
    { value: "dark", label: t("oc.set.theme.dark"), Icon: Moon },
    { value: "system", label: t("oc.set.theme.system"), Icon: Monitor },
  ];
  return (
    <Block>
      <List>
        <ListRow
          title={<label htmlFor="pfs-lang">{t("oc.set.lang")}</label>}
          meta={t("oc.set.lang.text")}
          trailing={
            <Select id="pfs-lang" value={lang} onChange={(e) => isLang(e.target.value) && setLang(e.target.value)} className="min-w-40">
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </Select>
          }
        />
        <ListRow
          className="pfs-wrap"
          title={<span id="pfs-theme">{t("oc.set.theme")}</span>}
          meta={t("oc.set.theme.text")}
          trailing={
            <div className="dk-seg" role="radiogroup" aria-labelledby="pfs-theme">
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
    </Block>
  );
}

const NOTES_MAX = 600;

function Personal() {
  const s = useCollege();
  const { t, lang } = useI18n();
  const save = useProfileSave();
  const prefs = s.profile?.preferences as Record<string, unknown> | undefined;
  const snap = useMemo(() => snapshotFrom(prefs), [prefs]);
  const savedNotes = typeof prefs?.ai_notes === "string" ? (prefs.ai_notes as string) : "";
  const [notes, setNotes] = useState(savedNotes);
  const [busy, setBusy] = useState(false);
  const on = prefs?.personalize_off !== true;

  const facts = useMemo(() => {
    const out: string[] = [];
    const join = (a: string[]) => a.join(", ");
    if (snap.home) out.push(t("pfs.f.home", { v: regionName(snap.home, lang) }));
    if (snap.grade) {
      const max = GRADE_SCALES[snap.grade.scale]?.max;
      out.push(t("pfs.f.grades", { v: `${snap.grade.value}${max ? " / " + max : ""}` }));
    }
    const taken = snap.tests.filter((x) => x.status === "taken").map((x) => [certTest(x.id)?.label || x.id, testScore(x.id, x.score)].filter(Boolean).join(" "));
    if (taken.length) out.push(t("pfs.f.tests", { v: join(taken) }));
    if (snap.activities.length) out.push(t("pfs.f.acts", { v: snap.activities.length }));
    const majors = snap.majors.map((m) => {
      const p = programme(m);
      return p ? t(programmeKey(p) as MessageKey) : m;
    });
    if (majors.length) out.push(t("pfs.f.majors", { v: join(majors) }));
    if (snap.dreams.length) out.push(t("pfs.f.where", { v: join(snap.dreams.map((c) => regionName(c, lang))) }));
    if (snap.budget && snap.budget < 90000) out.push(t("pfs.f.budget", { v: "$" + snap.budget.toLocaleString("en") }));
    if (snap.start_year) out.push(t("pfs.f.start", { v: snap.start_year }));
    return out;
  }, [snap, t, lang]);

  return (
    <>
      <Block note={t("pfs.p.intro")}>
        <div className="pfs-know">
          {facts.length ? (
            <ul>
              {facts.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          ) : (
            <p className="pfs-note">{t("pfs.p.empty")}</p>
          )}
          <Btn size="sm" href="/dashboard/welcome">
            {t("pfs.p.edit")} <ArrowRight aria-hidden="true" />
          </Btn>
        </div>
      </Block>
      <Block title={<label htmlFor="pfs-notes">{t("pfs.p.notes")}</label>} note={t("pfs.p.notes.hint")}>
        <textarea
          id="pfs-notes"
          className="dk-input pfs-notes"
          rows={4}
          maxLength={NOTES_MAX}
          value={notes}
          placeholder={t("pfs.p.notes.ph")}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="pfs-foot">
          <span className="pfs-note dk-num">
            {notes.length}/{NOTES_MAX}
          </span>
          <Btn
            size="sm"
            variant="primary"
            disabled={busy || notes.trim() === savedNotes.trim()}
            onClick={async () => {
              setBusy(true);
              const ok = await save({ preferences: { ai_notes: notes.trim() } });
              setBusy(false);
              if (ok) toast(t("pfs.saved"));
            }}
          >
            {t("pfs.save")}
          </Btn>
        </div>
      </Block>
      <Block>
        <List>
          <ListRow
            title={<span id="pfs-pz">{t("pfs.p.toggle")}</span>}
            meta={t("pfs.p.toggle.text")}
            trailing={
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-labelledby="pfs-pz"
                className="pfs-switch"
                onClick={async () => {
                  await save({ preferences: { personalize_off: on } });
                }}
              >
                <i />
              </button>
            }
          />
        </List>
      </Block>
    </>
  );
}

function DataPrivacy() {
  const s = useCollege();
  const { t } = useI18n();
  const [busy, setBusy] = useState<"" | "export" | "delete">("");
  const [deleted, setDeleted] = useState(false);
  const running = useRef(false);
  const run = async (kind: "export" | "delete", job: (owner: AccountToken) => Promise<void>) => {
    if (!s.user || running.current) return;
    const owner = s.accountScope.capture();
    if (owner.owner !== s.user.id) return;
    running.current = true;
    setBusy(kind);
    try {
      await job(owner);
    } catch {
      if (s.accountScope.isCurrent(owner)) toast.error(t("oc.set.error"));
    } finally {
      running.current = false;
      setBusy("");
    }
  };
  if (deleted)
    return (
      <Block title={t("oc.set.deleted")}>
        <Btn variant="primary" href="/">
          {t("oc.set.home")}
        </Btn>
      </Block>
    );
  return (
    <Block note={t("pfs.d.intro")}>
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
                        else setDeleted(true);
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
    </Block>
  );
}

const providerName = (p: string, t: (k: MessageKey) => string) => (p === "google" ? "Google" : p === "github" ? "GitHub" : t("pfs.acc.email"));

function Security() {
  const s = useCollege();
  const { t, lang } = useI18n();
  const router = useRouter();
  const [log, setLog] = useState<SignIn[]>([]);
  const [busy, setBusy] = useState(false);
  const uid = s.user?.id;
  const user = s.user as { last_sign_in_at?: string; app_metadata?: { provider?: string }; identities?: { provider: string }[] } | null;
  const provider = user?.app_metadata?.provider || "email";
  const identities = (user?.identities || []).map((i) => i.provider);
  const connected = new Set([...identities, provider]);

  // A new session shows up as a new last_sign_in_at: write it down once, on this device.
  useEffect(() => {
    if (!uid) return;
    const at = user?.last_sign_in_at;
    queueMicrotask(() => setLog(recordSignIn(uid, at, provider)));
  }, [uid, user?.last_sign_in_at, provider]);

  const fmt = (iso: string) => new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const current = user?.last_sign_in_at;
  const signOutAll = async () => {
    const client = getSupabase();
    if (!client || busy) return;
    setBusy(true);
    try {
      const { error } = await client.auth.signOut({ scope: "global" });
      if (error) throw error;
      router.replace("/auth/sign-in");
    } catch {
      toast.error(t("pfs.sec.all.error"));
      setBusy(false);
    }
  };
  const where = (x: SignIn) => [t(("pfs.kind." + x.kind) as MessageKey), x.tz && t("pfs.sec.near", { tz: x.tz.replace(/_/g, " ") })].filter(Boolean).join(" · ");

  return (
    <>
      <Block title={t("pfs.sec.history")} note={t("pfs.sec.history.note")}>
        {log.length ? (
          <List>
            {log.map((x) => (
              <ListRow
                key={x.id}
                title={x.os ? t("pfs.sec.on", { browser: x.browser, os: x.os }) : x.browser}
                meta={
                  <>
                    <span className="dk-num">{fmt(x.at)}</span> · {t("pfs.sec.via", { p: providerName(x.provider, t) })}
                    <br />
                    {where(x)}
                  </>
                }
                trailing={x.id === current ? <StatusPill tone="success" dot>{t("pfs.sec.now")}</StatusPill> : undefined}
              />
            ))}
          </List>
        ) : (
          <p className="pfs-note">{t("pfs.sec.empty")}</p>
        )}
        {log.length > 0 && uid && (
          <button
            type="button"
            className="pfs-link"
            onClick={() => {
              clearSignIns(uid);
              setLog([]);
            }}
          >
            {t("pfs.sec.clear")}
          </button>
        )}
      </Block>

      <Block title={t("pfs.sec.sessions")}>
        <List>
          <ListRow title={t("pfs.sec.out")} meta={t("pfs.sec.out.text")} trailing={<Btn size="sm" disabled={busy} onClick={() => void s.signOut()}><LogOut aria-hidden="true" /> {t("nav.sign_out")}</Btn>} />
          <ListRow
            title={t("pfs.sec.all")}
            meta={t("pfs.sec.all.text")}
            trailing={
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Btn size="sm" disabled={busy}>
                    <KeyRound aria-hidden="true" /> {t("pfs.sec.all")}
                  </Btn>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("pfs.sec.all.q")}</AlertDialogTitle>
                    <AlertDialogDescription>{t("pfs.sec.all.qtext")}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("pfs.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void signOutAll()}>{t("pfs.sec.all")}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            }
          />
        </List>
      </Block>

      <Block title={t("pfs.acc")}>
        <List>
          <ListRow title={t("pfs.acc.email")} meta={s.user?.email || "—"} trailing={<StatusPill tone={connected.has("email") ? "success" : "neutral"}>{connected.has("email") ? t("pfs.acc.connected") : t("pfs.acc.none")}</StatusPill>} />
          <ListRow title="Google" trailing={<StatusPill tone={connected.has("google") ? "success" : "neutral"}>{connected.has("google") ? t("pfs.acc.connected") : t("pfs.acc.none")}</StatusPill>} />
          <ListRow title="GitHub" trailing={<StatusPill>{t("pfs.acc.soon")}</StatusPill>} />
        </List>
      </Block>
    </>
  );
}
