"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useCollege } from "./provider";
import { getSupabase } from "@/lib/supabase/client";
import { staffFetch } from "@/services/admin-client";
import {
  StaffSessionScope,
  STAFF_WARNING_MS,
  staffSessionReceipt,
  staffTokenSessionId,
  StaffSessionExpiredError,
  captureStaffSessionCompletion,
} from "@/lib/staff-session";
import { runAccountSignOut } from "@/lib/account-signout";
import { abortable } from "@/lib/abortable";

type ContextValue = {
  boundary: StaffSessionScope;
  active: boolean;
  ready: boolean;
  remaining: number;
  error: string;
  refresh: () => Promise<void>;
  open: () => Promise<void>;
  stay: () => Promise<void>;
  close: () => Promise<void>;
};
const Context = createContext<ContextValue | null>(null);
export function useStaffSession() {
  const context = useContext(Context);
  if (!context) throw new Error("Staff session boundary is required");
  return context;
}
export function StaffSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { accountScope: scope, user, profile } = useCollege();
  const boundary = useMemo(() => new StaffSessionScope(), []);
  const [active, setActive] = useState(false),
    [ready, setReady] = useState(false),
    [remaining, setRemaining] = useState(0),
    [error, setError] = useState("");
  const revision = useRef(0),
    lastTouch = useRef(0),
    ending = useRef(false),
    checkingExpiry = useRef(false),
    activityChannel = useRef<BroadcastChannel | null>(null);
  const sync = useCallback(() => {
    setActive(boundary.active());
    setRemaining(boundary.remaining());
  }, [boundary]);
  const captureCompletion = useCallback(
    () =>
      captureStaffSessionCompletion(scope, boundary, () => revision.current),
    [scope, boundary],
  );
  const request = useCallback(
    async (action: "status" | "start" | "touch" | "end") => {
      const token = scope.capture();
      if (action === "start") revision.current++;
      let generation = revision.current;
      let boundaryGeneration = boundary.capture();
      const started = performance.now();
      const result = staffSessionReceipt.parse(
        await staffFetch("/api/staff/session", { action }, undefined, {
          scope,
          token,
          timeoutMs: 10000,
          expectedSessionId:
            action === "touch" ? (boundary.identity() ?? undefined) : undefined,
          observeSession: (token) => {
            const sessionId = staffTokenSessionId(token);
            if (!sessionId) throw new StaffSessionExpiredError();
            if (boundary.identify(sessionId)) {
              revision.current++;
              generation = revision.current;
            }
            boundaryGeneration = boundary.capture();
          },
        }),
      );
      if (
        !scope.isCurrent(token) ||
        generation !== revision.current ||
        boundaryGeneration !== boundary.capture()
      )
        return;
      boundary.accept(result, performance.now() - started);
      setReady(true);
      setError("");
      sync();
    },
    [scope, boundary, sync],
  );
  const refresh = useCallback(async () => {
    const token = scope.capture();
    const generation = revision.current;
    try {
      await request("status");
    } catch {
      if (!scope.isCurrent(token) || generation !== revision.current) return;
      boundary.close();
      sync();
      setReady(true);
      setError("Admin session could not be checked. Retry your connection.");
    }
  }, [request, boundary, sync, scope]);
  const open = useCallback(async () => {
    await request("start");
  }, [request]);
  const stay = useCallback(async () => {
    const ownsCompletion = captureCompletion();
    await request("touch");
    if (!ownsCompletion()) return;
    lastTouch.current = performance.now();
    activityChannel.current?.postMessage({
      type: "activity",
      owner: scope.capture().owner,
    });
  }, [request, scope, captureCompletion]);
  const close = useCallback(async () => {
    if (ending.current) return;
    ending.current = true;
    const token = scope.capture();
    const sessionId = boundary.identity();
    revision.current++;
    boundary.close();
    sync();
    setError("Admin access ended after 15 minutes without activity.");
    const db = getSupabase();
    try {
      // Close the ledger before logout. Pending admin work is already cancelled locally.
      await staffFetch("/api/staff/session", { action: "end" }, undefined, {
        scope,
        token,
        timeoutMs: 4000,
        expectedSessionId: sessionId ?? undefined,
      });
    } catch {
      /* Server idle expiry still denies privileged calls if the connection is offline. */
    }
    try {
      const current = db
        ? await abortable(db.auth.getSession(), AbortSignal.timeout(5000))
        : null;
      if (
        db &&
        scope.isCurrent(token) &&
        sessionId &&
        staffTokenSessionId(current?.data.session?.access_token ?? "") ===
          sessionId
      )
        await runAccountSignOut(scope, token, () =>
          abortable(
            db.auth.signOut({ scope: "local" }),
            AbortSignal.timeout(8000),
          ),
        );
    } catch {
      /* Access remains closed; a retry can sign out the local account. */
    } finally {
      ending.current = false;
    }
  }, [scope, boundary, sync]);
  useEffect(() => {
    const counter = revision;
    const owner = scope.capture();
    revision.current++;
    boundary.close();
    setReady(false);
    sync();
    if (user?.id === owner.owner && profile?.role === "admin") void refresh();
    else setReady(true);
    const unsubscribe = scope.subscribe(() => {
      counter.current++;
      boundary.close();
      setReady(false);
      sync();
    });
    return () => {
      counter.current++;
      unsubscribe();
      boundary.close();
    };
  }, [scope, user?.id, profile?.role, boundary, refresh, sync]);
  useEffect(() => {
    const db = getSupabase();
    if (!db) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const listener = db.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id !== scope.capture().owner) return;
      if (!boundary.identify(staffTokenSessionId(session.access_token))) return;
      revision.current++;
      setReady(false);
      sync();
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 0);
    });
    return () => {
      clearTimeout(timer);
      listener.data.subscription.unsubscribe();
    };
  }, [scope, boundary, sync, refresh]);
  useEffect(() => {
    const unsubscribe = boundary.subscribe(sync);
    const check = () => {
      sync();
      if (active && !boundary.active() && !checkingExpiry.current) {
        // A different tab may have received a real activity receipt. Check the
        // server without extending activity before ending their shared session.
        checkingExpiry.current = true;
        boundary.close();
        const ownsCompletion = captureCompletion();
        void request("status")
          .catch(() => {
            if (ownsCompletion()) boundary.close();
          })
          .finally(() => {
            checkingExpiry.current = false;
            if (ownsCompletion() && !boundary.active()) void close();
          });
      }
    };
    const activity = (event: Event) => {
      if (!event.isTrusted || document.hidden || !boundary.active()) return;
      const now = performance.now();
      if (now - lastTouch.current < 30000) return;
      lastTouch.current = now;
      const ownsCompletion = captureCompletion();
      void stay().catch(() => {
        if (!ownsCompletion()) return;
        boundary.close();
        sync();
        setError(
          "Admin access could not be renewed. Verify your authenticator again.",
        );
      });
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const event of events)
      window.addEventListener(event, activity, { passive: true });
    const resume = () => {
      check();
      if (!document.hidden && boundary.active()) void refresh();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    const timer = setInterval(check, 1000);
    return () => {
      clearInterval(timer);
      unsubscribe();
      for (const event of events) window.removeEventListener(event, activity);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
    };
  }, [
    active,
    boundary,
    close,
    refresh,
    stay,
    sync,
    request,
    captureCompletion,
  ]);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("collegestat-staff-activity-v1");
    activityChannel.current = channel;
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data;
      if (
        data &&
        typeof data === "object" &&
        "type" in data &&
        "owner" in data &&
        data.type === "activity" &&
        data.owner === scope.capture().owner
      )
        void refresh();
    };
    return () => {
      activityChannel.current = null;
      channel.close();
    };
  }, [scope, refresh]);
  const value = useMemo(
    () => ({
      boundary,
      active,
      ready,
      remaining,
      error,
      refresh,
      open,
      stay,
      close,
    }),
    [boundary, active, ready, remaining, error, refresh, open, stay, close],
  );
  return (
    <Context.Provider value={value}>
      {active && remaining <= STAFF_WARNING_MS && (
        <div className="staff-idle-warning" role="status">
          <span>
            Admin session ends in {Math.ceil(remaining / 1000)} seconds.
          </span>
          <button
            type="button"
            onClick={() => {
              const ownsCompletion = captureCompletion();
              void stay().catch(() => {
                if (ownsCompletion()) void close();
              });
            }}
          >
            Keep working
          </button>
        </div>
      )}
      {children}
    </Context.Provider>
  );
}
