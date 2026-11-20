"use client";
import { writeSessionHint } from "@/lib/auth-navigation";
import { recordActivity } from "@/lib/progress-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { usePathname, useRouter } from "next/navigation";
import { signInHref } from "@/lib/auth-navigation";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { fetchCatalogue, universitiesByIds } from "@/lib/supabase/catalogue";
import type { University, Scholarship } from "@/lib/domain";
import { defersPublicCatalogue } from "@/lib/page-bootstrap";
import { usesHostedCatalogue } from "@/lib/catalogue-mode";
import {
  AccountScope,
  changeAccountOwner,
  emptyAccount,
  visibleAccount,
} from "@/lib/account-owner";
import {
  loadProviderAccount,
  setProviderSaved,
  saveProviderComparison,
  type ProviderProfile as Profile,
} from "@/services/provider-account";
import { isUUID } from "@/lib/student-writing";
import { effectivePlan, limitsOf } from "@/lib/plans";
import { translate } from "@/lib/i18n/messages";
import { resolveLang } from "@/lib/i18n/languages";

const pageLang = () => resolveLang(typeof document === "undefined" ? null : document.documentElement.lang, null);
import { ownsSignOutResult, runAccountSignOut } from "@/lib/account-signout";
type State = {
  universities: University[];
  scholarships: Scholarship[];
  mode: "reference" | "supabase";
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  user: User | null;
  profile: Profile | null;
  authReady: boolean;
  configured: boolean;
  openAuth: () => void;
  saved: string[];
  savedScholarships: string[];
  toggleSaved: (id: string, scholarship?: boolean) => Promise<boolean>;
  compare: string[];
  toggleCompare: (id: string) => void;
  setCompare: (ids: string[]) => void;
  persistCompare: () => Promise<void>;
  busy: boolean;
  signOut: () => Promise<void>;
  refreshAccount: () => Promise<void>;
  accountScope: AccountScope;
};
const Context = createContext<State>(null!);
/** Exposed for the local preview harness only (app/zz-d2). */
export const CollegeContext = Context;
export function CollegeProvider({
  children,
  initialUniversities = [],
  initialScholarships = [],
}: {
  children: ReactNode;
  initialUniversities?: University[];
  initialScholarships?: Scholarship[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const catalogueReady = useRef(initialUniversities.length > 0);
  const openAuth = useCallback(() => {
    router.push(signInHref(window.location.pathname + window.location.search));
  }, [router]);
  const [universities, setUniversities] = useState(initialUniversities),
    [scholarships, setScholarships] = useState(initialScholarships),
    [mode, setMode] = useState<"reference" | "supabase">(
      usesHostedCatalogue() ? "supabase" : "reference",
    ),
    [loading, setLoading] = useState(initialUniversities.length === 0),
    [error, setError] = useState("");
  const [user, setUser] = useState<User | null>(null),
    [account, setAccount] = useState(() => ({
      ...emptyAccount<Profile>(),
      generation: 0,
    })),
    [authReady, setAuthReady] = useState(false),
    [busy, setBusy] = useState(false);
  const [authRevision, setAuthRevision] = useState(0);
  const userId = user?.id ?? null;
  const [sharedAccountScope] = useState(() => new AccountScope());
  const accountScope = useRef(sharedAccountScope);
  const accountGeneration = useSyncExternalStore(
    useCallback(
      (notify) => sharedAccountScope.subscribe(notify),
      [sharedAccountScope],
    ),
    () => sharedAccountScope.capture().generation,
    () => 0,
  );
  const renderedAccount = { owner: userId, generation: accountGeneration };
  const { profile, saved, savedScholarships, compare } =
    account.generation === accountGeneration
      ? visibleAccount(account, userId)
      : emptyAccount<Profile>(userId);
  const comparisonMissingKey = compare
    .filter((id) => !universities.some((u) => u.id === id))
    .join(",");
  const accountReadRevision = useRef(0);
  const accountReadController = useRef<AbortController | null>(null);
  const comparisonRevision = useRef(0);
  const savedRevision = useRef(0);
  const mutationBusy = useRef(false);
  const signOutBusy = useRef(false);
  const commitUser = useCallback((nextUser: User | null) => {
    writeSessionHint(!!nextUser);
    const nextOwner = nextUser?.id ?? null;
    const previousOwner = accountScope.current.capture().owner;
    if (accountScope.current.changeOwner(nextOwner)) {
      accountReadController.current?.abort();
      accountReadRevision.current++;
      comparisonRevision.current++;
      savedRevision.current++;
      mutationBusy.current = false;
      setBusy(false);
      const generation = accountScope.current.capture().generation;
      setAccount((old) => ({
        ...changeAccountOwner(old, nextOwner),
        generation,
      }));
      try {
        sessionStorage.removeItem("collegestat-comparison");
        if (previousOwner !== null)
          sessionStorage.removeItem("collegestat-comparison:anonymous");
      } catch {}
    }
    setUser(nextUser);
  }, []);
  useEffect(() => {
    if (!accountScope.current.isOwner(null)) return;
    try {
      const ids = JSON.parse(
        sessionStorage.getItem("collegestat-comparison:anonymous") || "[]",
      );
      if (Array.isArray(ids)) {
        const selection = ids
          .filter((v) => typeof v === "string" && /^[a-f0-9-]{36}$/i.test(v))
          .slice(0, 5);
        // Queue restoration before the auth subscription below so a restored
        // signed-in session can retain this anonymous selection on first load.
        setAccount((old) =>
          old.owner === null ? { ...old, compare: selection } : old,
        );
      }
    } catch {}
  }, []);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCatalogue();
      setUniversities(data.universities);
      setScholarships(data.scholarships);
      setMode(data.mode);
      catalogueReady.current = true;
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The catalogue could not be loaded.",
      );
      // Keep the bundled initialUniversities as fallback on Supabase failure;
      // never wipe the visible catalogue to [].
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    // Reuse either hosted or bundled SSR cards. Account pages do not need
    // discovery data; load it once if the visitor navigates to a public page.
    if (catalogueReady.current || defersPublicCatalogue(pathname || "")) {
      setLoading(false);
    } else {
      void refresh();
    }
  }, [pathname, refresh]);
  useEffect(() => {
    const client = getSupabase();
    if (!client) {
      setAuthReady(true);
      return;
    }
    let live = true;
    let eventRevision = 0;
    let authTransitionSeen = false;
    const restoreTimeout = setTimeout(() => {
      if (!live || eventRevision !== 0) return;
      // An expired startup read must not later overwrite an explicit sign-in.
      eventRevision++;
      authTransitionSeen = true;
      commitUser(null);
      setAuthReady(true);
      toast.error("Your session could not be restored. Please sign in again.");
    }, 10000);
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (!live || (event === "INITIAL_SESSION" && authTransitionSeen)) return;
      clearTimeout(restoreTimeout);
      if (event !== "INITIAL_SESSION") authTransitionSeen = true;
      eventRevision++;
      commitUser(session?.user ?? null);
      if (
        [
          "SIGNED_IN",
          "USER_UPDATED",
          "TOKEN_REFRESHED",
          "MFA_CHALLENGE_VERIFIED",
        ].includes(event)
      )
        setAuthRevision((revision) => revision + 1);
      setAuthReady(true);
    });
    void client.auth
      .getSession()
      .then(({ data, error }) => {
        // A startup read must never undo a newer sign-in, refresh, or sign-out.
        if (!live || eventRevision !== 0) return;
        clearTimeout(restoreTimeout);
        if (error)
          toast.error(
            "Your session could not be restored. Please sign in again.",
          );
        commitUser(data.session?.user ?? null);
        setAuthReady(true);
      })
      .catch(() => {
        if (!live || eventRevision !== 0) return;
        clearTimeout(restoreTimeout);
        commitUser(null);
        setAuthReady(true);
        toast.error(
          "Your session could not be restored. Please sign in again.",
        );
      });
    return () => {
      live = false;
      clearTimeout(restoreTimeout);
      data.subscription.unsubscribe();
    };
  }, [commitUser]);
  const refreshAccount = useCallback(async () => {
    if (!accountScope.current.isOwner(userId)) return;
    const token = { owner: userId, generation: accountGeneration };
    if (!accountScope.current.isCurrent(token)) return;
    const readRevision = ++accountReadRevision.current;
    const compareRevision = comparisonRevision.current;
    const savedReadRevision = savedRevision.current;
    const client = getSupabase();
    if (!client || !userId) return;
    accountReadController.current?.abort();
    const controller = new AbortController();
    accountReadController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const snapshot = await loadProviderAccount(
        accountScope.current,
        token,
        controller.signal,
      );
      if (
        !accountScope.current.isCurrent(token) ||
        accountReadRevision.current !== readRevision
      )
        return;
      setAccount((old) => {
        if (
          !accountScope.current.isCurrent(token) ||
          accountReadRevision.current !== readRevision
        )
          return old;
        const current = visibleAccount(old, userId);
        return {
          owner: userId,
          generation: token.generation,
          loaded: true,
          profile: snapshot.profile,
          saved:
            savedRevision.current === savedReadRevision
              ? snapshot.saved
              : current.saved,
          savedScholarships:
            savedRevision.current === savedReadRevision
              ? snapshot.savedScholarships
              : current.savedScholarships,
          compare:
            comparisonRevision.current === compareRevision &&
            snapshot.compare !== null
              ? snapshot.compare
              : current.compare,
        };
      });
    } catch {
      if (
        accountScope.current.isCurrent(token) &&
        accountReadRevision.current === readRevision
      )
        toast.error("Your account data could not be loaded. Please retry.");
    } finally {
      clearTimeout(timeout);
      if (accountReadController.current === controller)
        accountReadController.current = null;
    }
  }, [userId, accountGeneration]);
  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount, authRevision]);
  useEffect(() => {
    const focused = () => void refreshAccount();
    window.addEventListener("focus", focused);
    return () => window.removeEventListener("focus", focused);
  }, [refreshAccount]);
  const toggleSaved = async (id: string, scholarship = false) => {
    const client = getSupabase();
    if (!client || !userId) {
      openAuth();
      return false;
    }
    if (
      !isUUID(id) ||
      !accountScope.current.isCurrent(renderedAccount) ||
      mutationBusy.current
    )
      return false;
    if (
      !account.loaded ||
      account.owner !== userId ||
      account.generation !== accountGeneration
    ) {
      toast("Your account is still loading. Please retry shortly.");
      return false;
    }
    mutationBusy.current = true;
    savedRevision.current++;
    setBusy(true);
    const token = renderedAccount;
    const list = scholarship ? savedScholarships : saved,
      exists = list.includes(id);
    // My colleges size follows the plan (lib/plans.ts); the database proposal
    // in supabase/proposals/plan-limits-nov16.sql enforces the same number.
    if (!exists && !scholarship) {
      const plan = effectivePlan(profile?.preferences);
      const max = limitsOf(plan).listSize;
      if (saved.length >= max) {
        const lang = pageLang();
        toast(translate(lang, "d2.limit.list", { n: max }), {
          action: { label: translate(lang, "d2.limit.see"), onClick: () => router.push("/dashboard/plans") },
        });
        return false;
      }
    }
    const field = scholarship ? "savedScholarships" : "saved";
    const update = (shouldSave: boolean) =>
      setAccount((old) =>
        accountScope.current.isCurrent(token) && old.owner === userId
          ? {
              ...old,
              [field]: shouldSave
                ? [...new Set([...old[field], id])]
                : old[field].filter((savedId) => savedId !== id),
            }
          : old,
      );
    update(!exists);
    try {
      await setProviderSaved(
        accountScope.current,
        id,
        !exists,
        scholarship,
        token,
      );
      if (!accountScope.current.isCurrent(token)) return false;
      savedRevision.current++;
      update(!exists);
      toast.success(exists ? "Removed from saved" : "Saved to your research");
      if (!exists && !scholarship) void recordActivity("shortlist", id, { silent: true });
      return true;
    } catch {
      if (!accountScope.current.isCurrent(token)) return false;
      savedRevision.current++;
      update(exists);
      toast.error("Could not save. Please retry.");
      return false;
    } finally {
      if (accountScope.current.isCurrent(token)) {
        mutationBusy.current = false;
        setBusy(false);
      }
    }
  };
  const setCompare = useCallback(
    (ids: string[]) => {
      const token = { owner: userId, generation: accountGeneration };
      if (
        !accountScope.current.isCurrent(token) ||
        !Array.isArray(ids) ||
        ids.length > 5 ||
        ids.some((id) => !isUUID(id))
      )
        return;
      const selection = [...new Set(ids)];
      comparisonRevision.current++;
      setAccount((old) =>
        accountScope.current.isCurrent(token)
          ? {
              ...visibleAccount(old, userId),
              generation: token.generation,
              compare: selection,
            }
          : old,
      );
    },
    [userId, accountGeneration],
  );
  useEffect(() => {
    try {
      if (userId === null && account.owner === null)
        sessionStorage.setItem(
          "collegestat-comparison:anonymous",
          JSON.stringify(compare),
        );
    } catch {}
    // Comparison pages own their full-profile load; the public tray only needs
    // missing card identities. Workspace pages resolve their own saved rows.
    if (
      !comparisonMissingKey ||
      pathname === "/compare" ||
      defersPublicCatalogue(pathname)
    )
      return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let live = true;
    universitiesByIds(comparisonMissingKey.split(","), controller.signal)
      .then((rows) => {
        if (live)
          setUniversities((old) => {
            const missing = rows.filter((r) => !old.some((u) => u.id === r.id));
            return missing.length ? [...old, ...missing] : old;
          });
      })
      .catch(() => {})
      .finally(() => clearTimeout(timeout));
    return () => {
      live = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [compare, comparisonMissingKey, userId, account.owner, pathname]);
  const toggleCompare = (id: string) => {
    const token = renderedAccount;
    if (!isUUID(id) || !accountScope.current.isCurrent(token)) return;
    comparisonRevision.current++;
    setAccount((old) => {
      if (!accountScope.current.isCurrent(token)) return old;
      const current = {
        ...visibleAccount(old, userId),
        generation: token.generation,
      };
      if (current.compare.includes(id))
        return { ...current, compare: current.compare.filter((v) => v !== id) };
      if (current.compare.length >= 5) {
        toast("Compare up to five universities. Remove one to add another.");
        return current;
      }
      return { ...current, compare: [...current.compare, id] };
    });
  };
  const persistCompare = async () => {
    const client = getSupabase();
    if (!client || !userId) {
      openAuth();
      return;
    }
    const token = renderedAccount;
    if (!accountScope.current.isCurrent(token) || mutationBusy.current) return;
    comparisonRevision.current++;
    mutationBusy.current = true;
    setBusy(true);
    try {
      await saveProviderComparison(accountScope.current, compare, token);
      if (!accountScope.current.isCurrent(token)) return;
      comparisonRevision.current++;
      toast.success("Comparison saved to your account");
    } catch {
      if (accountScope.current.isCurrent(token))
        toast.error("Your comparison could not be saved. Please retry.");
    } finally {
      if (accountScope.current.isCurrent(token)) {
        mutationBusy.current = false;
        setBusy(false);
      }
    }
  };
  const signOut = async () => {
    const client = getSupabase();
    const token = renderedAccount;
    if (
      !client ||
      token.owner === null ||
      !accountScope.current.isCurrent(token) ||
      signOutBusy.current
    )
      return;
    signOutBusy.current = true;
    try {
      const confirmed = await runAccountSignOut(
        accountScope.current,
        token,
        () => client.auth.signOut(),
      );
      if (!confirmed || !ownsSignOutResult(accountScope.current, token)) return;
      if (accountScope.current.isCurrent(token)) commitUser(null);
      toast("Signed out");
    } catch {
      if (ownsSignOutResult(accountScope.current, token))
        toast.error("Sign out could not be confirmed. Please retry.");
    } finally {
      signOutBusy.current = false;
    }
  };
  return (
    <Context.Provider
      value={{
        universities,
        scholarships,
        mode,
        loading,
        error,
        refresh,
        user,
        profile,
        authReady,
        configured: supabaseConfigured,
        openAuth,
        saved,
        savedScholarships,
        toggleSaved,
        compare,
        toggleCompare,
        setCompare,
        persistCompare,
        busy,
        signOut,
        refreshAccount,
        accountScope: sharedAccountScope,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useCollege = () => useContext(Context);
