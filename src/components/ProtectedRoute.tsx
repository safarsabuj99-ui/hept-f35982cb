import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth, AppRole } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Clock, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
  const { user, role, loading, signOut } = useAuth();
  const [orgStatus, setOrgStatus] = useState<string | null>(null);
  const [checkingOrg, setCheckingOrg] = useState(false);

  useEffect(() => {
    if (!user || role !== "admin") return;
    setCheckingOrg(true);
    supabase
      .from("profiles")
      .select("org_id")
      .eq("user_id", user.id)
      .single()
      .then(async ({ data: profile }) => {
        if (!profile?.org_id) { setCheckingOrg(false); return; }
        const { data: org } = await supabase
          .from("organizations")
          .select("status")
          .eq("id", profile.org_id)
          .single();
        setOrgStatus((org as any)?.status ?? null);
        setCheckingOrg(false);
      });
  }, [user, role]);

  if (loading || checkingOrg) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // Show pending payment screen for admin users whose org is pending
  if (role === "admin" && orgStatus === "pending_payment" && requiredRole === "admin") {
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

  if (requiredRole && role !== requiredRole) {
    // Allow admin to access client routes when impersonating
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
