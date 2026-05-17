import { useState, useEffect, useRef } from "react";
import { Navigate } from "react-router-dom";
import { useAuth, AppRole } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Clock, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubscriptionGate } from "@/components/SubscriptionGate";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: AppRole;
}

const roleHomeMap: Record<string, string> = {
  admin: "/admin",
  manager: "/manager",
  client: "/dashboard",
  platform_owner: "/platform",
};

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, role, loading, authReady, signOut } = useAuth();
  const [orgStatus, setOrgStatus] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [suspensionReason, setSuspensionReason] = useState<string | null>(null);
  const [checkingOrg, setCheckingOrg] = useState(false);
  const lastCheckedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user || role !== "admin") return;
    if (lastCheckedUserIdRef.current === user.id) return;

    setCheckingOrg(true);
    lastCheckedUserIdRef.current = user.id;
    supabase
      .from("profiles")
      .select("org_id")
      .eq("user_id", user.id)
      .single()
      .then(async ({ data: profile }) => {
        if (!profile?.org_id) { setCheckingOrg(false); return; }
        const { data: org } = await supabase
          .from("organizations")
          .select("status, suspension_reason")
          .eq("id", profile.org_id)
          .single();
        setOrgId(profile.org_id);
        setOrgStatus((org as any)?.status ?? null);
        setSuspensionReason((org as any)?.suspension_reason ?? null);
        setCheckingOrg(false);
      });
  }, [user, role]);

  if (!authReady || loading || checkingOrg) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Guard: if auth says "no user" but a Supabase session token still exists in
  // localStorage, we're in a transient restore window. Show the loader instead
  // of bouncing to /login (which causes the reload-flash loop).
  if (!user) {
    let hasToken = false;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) {
          const v = localStorage.getItem(k);
          if (v && v.length > 10) { hasToken = true; break; }
        }
      }
    } catch {}
    if (hasToken) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }
    return <Navigate to="/login" replace />;
  }

  // Block admin users whose org is in a non-active state
  if (role === "admin" && requiredRole === "admin" && orgId) {
    // Pending payment — show simple review screen
    if (orgStatus === "pending_payment") {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
          <Card className="max-w-md w-full text-center">
            <CardContent className="pt-8 pb-8 space-y-4">
              <div className="h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto">
                <Clock className="h-8 w-8 text-amber-500" />
              </div>
              <h2 className="text-xl font-bold">Payment Under Review</h2>
              <p className="text-muted-foreground text-sm">
                Your agency account has been created but your payment is being verified.
                You'll get full access once the payment is approved by our team.
              </p>
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> Verification in progress
              </Badge>
              <div className="pt-4">
                <Button variant="outline" size="sm" onClick={() => signOut()}>Sign Out</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    // Suspended or Cancelled — show SubscriptionGate with plan selection + payment
    if (orgStatus === "suspended" || orgStatus === "cancelled") {
      return (
        <SubscriptionGate
          orgId={orgId}
          orgStatus={orgStatus}
          suspensionReason={suspensionReason}
          onSignOut={() => signOut()}
        />
      );
    }
  }

  if (requiredRole && role !== requiredRole) {
    const hasImpersonateParam = new URLSearchParams(window.location.search).has("impersonate");
    if (requiredRole === "client" && role === "admin" && (sessionStorage.getItem("impersonate_client_id") || hasImpersonateParam)) {
      // Admin is impersonating a client — allow through
    } else {
      const home = role ? roleHomeMap[role] || "/login" : "/login";
      return <Navigate to={home} replace />;
    }
  }

  return <>{children}</>;
}
