"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { signInHref } from "@/lib/auth-navigation";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { fetchCatalogue, universitiesByIds } from "@/lib/supabase/catalogue";
import type { University, Scholarship } from "@/lib/domain";
type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  role: "student" | "admin";
  preferences: Record<string, unknown>;
};
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
};
const Context = createContext<State>(null!);
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
  const openAuth = useCallback(() => {
    router.push(signInHref(window.location.pathname + window.location.search));
  }, [router]);
  const [universities, setUniversities] = useState(initialUniversities),
    [scholarships, setScholarships] = useState(initialScholarships),
    [mode, setMode] = useState<"reference" | "supabase">("reference"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [user, setUser] = useState<User | null>(null),
    [profile, setProfile] = useState<Profile | null>(null),
    [authReady, setAuthReady] = useState(false),
    [saved, setSaved] = useState<string[]>([]),
    [savedScholarships, setSavedScholarships] = useState<string[]>([]),
    [compare, setCompare] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  const accountGeneration = useRef(0);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCatalogue();
      setUniversities(data.universities);
      setScholarships(data.scholarships);
      setMode(data.mode);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The catalogue could not be loaded.",
      );
      if (process.env.NEXT_PUBLIC_CATALOGUE_SOURCE === "supabase")
        setUniversities([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const client = getSupabase();
    if (!client) {
      setAuthReady(true);
      return;
    }
    client.auth.getSession().then(({ data, error }) => {
      if (error) toast.error(error.message);
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, [refresh]);
  const refreshAccount = useCallback(async () => {
    const generation = ++accountGeneration.current;
    const client = getSupabase();
    if (!client || !user) {
      setSaved([]);
      setSavedScholarships([]);
      setProfile(null);
      return;
    }
    const [p, a, b, c] = await Promise.all([
      client.from("profiles").select("*").eq("id", user.id).single(),
      client
        .from("saved_universities")
        .select("university_id")
        .eq("user_id", user.id),
      client
        .from("saved_scholarships")
        .select("scholarship_id")
        .eq("user_id", user.id),
      client
        .from("comparison_lists")
        .select("university_ids")
        .eq("user_id", user.id)
        .eq("name", "My comparison")
        .maybeSingle(),
    ]);
    if (accountGeneration.current !== generation) return;
    const error = p.error || a.error || b.error || c.error;
    if (error) {
      toast.error("Your account data could not be loaded. Please retry.");
      return;
    }
    setProfile(p.data as Profile);
    setSaved(a.data?.map((v) => v.university_id) || []);
    setSavedScholarships(b.data?.map((v) => v.scholarship_id) || []);
    if (c.data) setCompare(c.data.university_ids);
  }, [user]);
  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount]);
  const toggleSaved = async (id: string, scholarship = false) => {
    const client = getSupabase();
    if (!client || !user) {
      openAuth();
      return false;
    }
    if (busy) return false;
    setBusy(true);
    const generation = accountGeneration.current;
    const list = scholarship ? savedScholarships : saved,
      exists = list.includes(id),
      table = scholarship ? "saved_scholarships" : "saved_universities",
      column = scholarship ? "scholarship_id" : "university_id";
    const setter = scholarship ? setSavedScholarships : setSaved;
    setter((old) => (exists ? old.filter((v) => v !== id) : [...old, id]));
    try {
      const { error } = exists
        ? await client
            .from(table)
            .delete()
            .eq("user_id", user.id)
            .eq(column, id)
        : await client.from(table).insert({ user_id: user.id, [column]: id });
      if (error) throw error;
      if (accountGeneration.current !== generation) return false;
      toast.success(exists ? "Removed from saved" : "Saved to your research");
      return true;
    } catch {
      if (accountGeneration.current !== generation) return false;
      setter(list);
      toast.error("Could not save. Please retry.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    try {
      const ids = JSON.parse(
        sessionStorage.getItem("collegestat-comparison") || "[]",
      );
      if (Array.isArray(ids))
        setCompare(
          ids
            .filter((v) => typeof v === "string" && /^[a-f0-9-]{36}$/i.test(v))
            .slice(0, 5),
        );
    } catch {}
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem("collegestat-comparison", JSON.stringify(compare));
    } catch {}
    if (!compare.length) return;
    let live = true;
    universitiesByIds(compare)
      .then((rows) => {
        if (live)
          setUniversities((old) => {
            const missing = rows.filter((r) => !old.some((u) => u.id === r.id));
            return missing.length ? [...old, ...missing] : old;
          });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [compare]);
  const toggleCompare = (id: string) => {
    setCompare((old) => {
      if (old.includes(id)) return old.filter((v) => v !== id);
      if (old.length >= 5) {
        toast("Compare up to five universities. Remove one to add another.");
        return old;
      }
      return [...old, id];
    });
  };
  const persistCompare = async () => {
    const client = getSupabase();
    if (!client || !user) {
      openAuth();
      return;
    }
    setBusy(true);
    const { error } = await client.rpc("save_comparison", {
      ids: compare,
      list_name: "My comparison",
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Comparison saved to your account");
  };
  const signOut = async () => {
    const client = getSupabase();
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) {
      toast.error(error.message);
      return;
    }
    setUser(null);
    setProfile(null);
    setSaved([]);
    setSavedScholarships([]);
    setCompare([]);
    toast("Signed out");
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
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useCollege = () => useContext(Context);
