import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export type AppRole = "admin" | "manager" | "client" | "platform_owner" | "affiliate" | null;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole;
  loading: boolean;
  authReady: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Detect obviously broken sessions in localStorage */
function isSessionCorrupted(): boolean {
  try {
    const raw = localStorage.getItem("sb-hhpiimnvkgmpfnldgdhc-auth-token");
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const token = parsed?.access_token || parsed?.currentSession?.access_token;
    if (!token) return true;
    // Check JWT has 3 parts
    const parts = token.split(".");
    if (parts.length !== 3) return true;
    // Decode payload and check for sub claim
    const payload = JSON.parse(atob(parts[1]));
    if (!payload.sub) return true;
    // Check if expired (with 60s grace)
    if (payload.exp && payload.exp * 1000 < Date.now() - 60000) return true;
    return false;
  } catch {
    return false;
  }
}

function clearCorruptedSession() {
  try {
    localStorage.removeItem("sb-hhpiimnvkgmpfnldgdhc-auth-token");
  } catch {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const roleFetchIdRef = useRef(0);
  const lastHandledUserIdRef = useRef<string | null>(null);
  const queryClient = useQueryClient();

  const fetchRole = useCallback(async (userId: string, fetchId: number) => {
    try {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .single();

      // Only apply if this is still the latest fetch
      if (roleFetchIdRef.current !== fetchId) return;

      const userRole = (data?.role as AppRole) ?? null;
      setRole(userRole);

      // Check is_active for manager role
      if (userRole === "manager") {
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_active")
          .eq("user_id", userId)
          .single();
        if (roleFetchIdRef.current !== fetchId) return;
        if (profile && !(profile as any).is_active) {
          await supabase.auth.signOut();
          setUser(null);
          setSession(null);
          setRole(null);
        }
      }
    } catch {
      if (roleFetchIdRef.current === fetchId) {
        setRole(null);
      }
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // Step 0: Check for corrupted session BEFORE anything
    if (isSessionCorrupted()) {
      clearCorruptedSession();
    }

    // Step 1: Register listener FIRST (before getSession)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!mounted) return;

        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (_event === 'SIGNED_OUT') {
          lastHandledUserIdRef.current = null;
          setRole(null);
          setAuthReady(true);
          setLoading(false);
          // Clear all cached queries on sign out
          queryClient.clear();
          return;
        }

        if (_event === 'TOKEN_REFRESHED') {
          // Role doesn't change on token refresh, skip
          return;
        }

        // SIGNED_IN and INITIAL_SESSION can fire back-to-back for the same
        // user on initial page load. Dedup by uid so we don't refetch roles
        // (and re-flash the UI) twice. Also no longer nuke the whole query
        // cache on SIGNED_IN — per-user queryKeys handle invalidation.
        if (newSession?.user) {
          if (lastHandledUserIdRef.current === newSession.user.id) {
            // Already handled this user — ensure ready flags but skip refetch
            setAuthReady(true);
            setLoading(false);
            return;
          }
          lastHandledUserIdRef.current = newSession.user.id;
          const fetchId = ++roleFetchIdRef.current;
          fetchRole(newSession.user.id, fetchId).then(() => {
            if (mounted) {
              setAuthReady(true);
              setLoading(false);
            }
          });
        } else {
          lastHandledUserIdRef.current = null;
          setRole(null);
          setAuthReady(true);
          setLoading(false);
        }
      }
    );

    // Step 2: Get initial session directly. Don't rely solely on the auth
    // event firing (some browsers/PWA modes delay INITIAL_SESSION). Resolve
    // auth state from the explicit getSession() result so we never get stuck
    // in a "restoring" state that would force a redirect to /login.
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (!mounted) return;

      if (!initialSession) {
        // Definitively unauthenticated.
        setSession(null);
        setUser(null);
        setRole(null);
        lastHandledUserIdRef.current = null;
        setAuthReady(true);
        setLoading(false);
        return;
      }

      // Authenticated. Seed state from this call so protected routes never
      // see a momentary `!user` and redirect to /login while the listener
      // is still warming up.
      setSession(initialSession);
      setUser(initialSession.user);

      const uid = initialSession.user.id;
      if (lastHandledUserIdRef.current === uid) {
        setAuthReady(true);
        setLoading(false);
        return;
      }
      lastHandledUserIdRef.current = uid;
      const fetchId = ++roleFetchIdRef.current;
      fetchRole(uid, fetchId).finally(() => {
        if (!mounted) return;
        setAuthReady(true);
        setLoading(false);
      });
    }).catch(() => {
      if (!mounted) return;
      // Network failure on initial session lookup: don't strand the UI on
      // the spinner, but also don't pretend the user is signed out — leave
      // user/session null and let onAuthStateChange recover when it can.
      setAuthReady(true);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchRole, queryClient]); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    queryClient.clear();
  };

  return (
    <AuthContext.Provider value={{ user, session, role, loading, authReady, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
