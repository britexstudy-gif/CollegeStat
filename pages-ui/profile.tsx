"use client";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useCollege } from "@/components/college/provider";
import { EmptyState, Choice } from "@/components/college/primitives";
import { countries } from "@/lib/domain";
import { getSupabase } from "@/lib/supabase/client";
import { exportAccount } from "@/services/workspace";
import { Preferences } from "@/lib/research";
export default function Profile() {
  const s = useCollege();
  if (!s.user)
    return (
      <EmptyState
        title="Your priorities. Your control."
        description="Sign in to set research preferences, manage your private data, and keep your workspace across devices."
        action={
          <button className="button button-primary" onClick={s.openAuth}>
            Sign in
          </button>
        }
      />
    );
  if(!s.profile)return <EmptyState title="Loading your profile…" description="Restoring your private preferences."/>;
  return <ProfileForm key={s.profile.id} />;
}
function ProfileForm() {
  const s = useCollege(),
    prefs = s.profile?.preferences as Preferences | undefined;
  const [name, setName] = useState(s.profile?.display_name || ""),
    [field, setField] = useState(prefs?.field || ""),
    [budget, setBudget] = useState(String(prefs?.budget || "")),
    [currency, setCurrency] = useState(prefs?.currency || "USD"),
    [locations, setLocations] = useState<string[]>(prefs?.countries || []),
    [aid, setAid] = useState(prefs?.aid || false),
    [weights, setWeights] = useState(
      prefs?.weights || { location: 1, program: 1, budget: 1, aid: 1 },
    ),
    [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const db = getSupabase();
    if (!db || !s.user) return;
    setBusy(true);
    const { error } = await db
      .from("profiles")
      .update({
        display_name: name.trim() || null,
        preferences: {
          countries: locations,
          field,
          budget: budget ? Number(budget) : undefined,
          currency,
          aid,
          weights,
        },
      })
      .eq("id", s.user.id);
    setBusy(false);
    if (error) toast.error("Your preferences could not be saved");
    else {
      await s.refreshAccount();
      toast.success("Preferences saved");
    }
  };
  const clear = async (history = false) => {
    const db = getSupabase();
    if (!db || !s.user) return;
    const { error } = history
      ? await db.from("research_history").delete().eq("user_id", s.user.id)
      : await db
          .from("profiles")
          .update({ preferences: {} })
          .eq("id", s.user.id);
    if (error) toast.error("Could not clear data");
    else {
      if (!history) {
        setLocations([]);
        setField("");
        setBudget("");
        setAid(false);
        setWeights({ location: 1, program: 1, budget: 1, aid: 1 });
        await s.refreshAccount();
      }
      toast.success("Cleared");
    }
  };
  const deleteAccount = async () => {
    const db = getSupabase();
    if (!db) return;
    const { data } = await db.auth.getSession();
    const response = await fetch("/api/account", {
      method: "DELETE",
      headers: { Authorization: "Bearer " + data.session?.access_token },
    });
    if (!response.ok) {
      toast.error(
        "Account deletion failed. Check the server configuration and retry.",
      );
      return;
    }
    await s.signOut();
  };
  return (
    <div className="research-page">
      <header className="page-intro">
        <div className="eyebrow">YOUR RESEARCH PREFERENCES</div>
        <h1>Give your research some direction.</h1>
        <p>
          Everything here is optional and private. Fit indicators reflect these
          preferences; they never estimate admission probability.
        </p>
      </header>
      <div className="detail-grid">
        <form className="panel" onSubmit={save}>
          <h2>Your priorities</h2>
          <div className="form-grid">
            <label className="form-field">
              Display name
              <input
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="form-field">
              Intended field
              <input
                value={field}
                onChange={(e) => setField(e.target.value)}
                maxLength={100}
              />
            </label>
            <label className="form-field">
              Annual tuition budget
              <input
                type="number"
                min="0"
                max="1000000"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </label>
            <label className="form-field">
              Budget currency
              <Choice
                label="Budget currency"
                value={currency}
                onChange={setCurrency}
                options={["USD", "EUR", "GBP", "UZS", "CAD"]}
              />
            </label>
          </div>
          <h3>Desired countries</h3>
          <div className="form-grid">
            {Object.entries(countries).map(([code, name]) => (
              <label className="filter-checkbox" key={code}>
                <Checkbox
                  checked={locations.includes(code)}
                  onCheckedChange={(v) =>
                    setLocations((old) =>
                      v ? [...old, code] : old.filter((c) => c !== code),
                    )
                  }
                />
                {name}
              </label>
            ))}
          </div>
          <label className="filter-checkbox" style={{ margin: "25px 0" }}>
            <Checkbox checked={aid} onCheckedChange={(v) => setAid(!!v)} />
            Financial aid matters to my decision
          </label>
          <h3>Fit dimension weights</h3>
          <p className="caption">
            Zero excludes a dimension. Missing university data is always
            excluded.
          </p>
          <div className="form-grid" style={{ marginTop: 15 }}>
            {Object.keys(weights).map((k) => (
              <label className="form-field" key={k}>
                {k}
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={weights[k]}
                  onChange={(e) =>
                    setWeights((old) => ({
                      ...old,
                      [k]: Number(e.target.value),
                    }))
                  }
                />
              </label>
            ))}
          </div>
          <button className="button button-primary" disabled={busy}>
            Save preferences
          </button>
        </form>
        <section className="panel">
          <h2>Privacy controls</h2>
          <p className="caption">
            Supabase manages your authentication. Your profile, notes, lists,
            and activity are protected by owner-only database policies.
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "start",
              gap: 18,
              marginTop: 25,
            }}
          >
            <button
              className="text-link"
              onClick={() =>
                exportAccount(s.user!.id).catch(() =>
                  toast.error("Export failed"),
                )
              }
            >
              Export my personal data ↓
            </button>
            <button className="text-link" onClick={() => clear(true)}>
              Clear browsing history
            </button>
            <button className="text-link" onClick={() => clear()}>
              Clear research preferences
            </button>
            <button className="text-link" onClick={s.signOut}>
              Sign out
            </button>
            <AlertDialog>
              <AlertDialogTrigger
                className="text-link"
                style={{ color: "#c94b4b" }}
              >
                Delete my account
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Delete your account and private research?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes your profile, notes, saved items,
                    and lists. Export your data first if you want a copy.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep account</AlertDialogCancel>
                  <AlertDialogAction onClick={deleteAccount}>
                    Delete permanently
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </section>
      </div>
    </div>
  );
}
