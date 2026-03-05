import { Navigate } from "react-router-dom";
import { useAuth, AppRole } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: AppRole;
}

const roleHomeMap: Record<string, string> = {
  admin: "/admin",
  manager: "/manager",
  client: "/dashboard",
};

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (requiredRole && role !== requiredRole) {
    // Allow admin to access client routes when impersonating
    if (requiredRole === "client" && role === "admin" && sessionStorage.getItem("impersonate_client_id")) {
      // Admin is impersonating a client — allow through
    } else {
      const home = role ? roleHomeMap[role] || "/login" : "/login";
      return <Navigate to={home} replace />;
    }
  }

  return <>{children}</>;
}
