import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "manager" | "client" | "platform_owner" | null;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole>(null);
  const [loading, setLoading] = useState(true);
  const roleFetchRef = useRef<string | null>(null);

  const fetchRole = useCallback(async (userId: string) => {
    // Dedup concurrent fetches for same user
    if (roleFetchRef.current === userId) return;
    roleFetchRef.current = userId;

    try {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .single();
      const userRole = (data?.role as AppRole) ?? null;
      setRole(userRole);

      // Check is_active for non-admin roles
      if (userRole === "manager") {
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_active")
          .eq("user_id", userId)
          .single();
        if (profile && !(profile as any).is_active) {
          await supabase.auth.signOut();
          setUser(null);
          setSession(null);
          setRole(null);
        }
      }
    } finally {
      roleFetchRef.current = null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // 1. Listen for auth changes (don't do async work here — just update session/user)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!mounted) return;
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (!newSession?.user) {
          setRole(null);
          setLoading(false);
        }
      }
    );

    // 2. Get initial session (for page reloads)
    supabase.auth.getSession().then(async ({ data: { session: initialSession } }) => {
      if (!mounted) return;
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      if (initialSession?.user) {
        await fetchRole(initialSession.user.id);
      } else {
        setRole(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchRole]);

  // 3. Fetch role whenever user changes (handles sign-in via onAuthStateChange)
  useEffect(() => {
    if (user) {
      fetchRole(user.id).then(() => setLoading(false));
    }
  }, [user?.id, fetchRole]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, role, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
