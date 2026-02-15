import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BarChart3, LogOut, Shield, Megaphone, LayoutDashboard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function ClientLayout() {
  const { signOut, user } = useAuth();
  const location = useLocation();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b bg-card/95 backdrop-blur-sm px-4 md:px-8">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <span className="text-lg font-bold tracking-tight">AdSpend Portal</span>
          <Badge variant="secondary" className="text-[10px] hidden sm:inline-flex gap-1 ml-1">
            <Shield className="h-2.5 w-2.5" /> Client
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {user?.email}
          </span>
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={signOut} className="gap-2">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
        </div>
      </header>
      {/* Sub-nav */}
      <div className="border-b bg-card/50 px-4 md:px-8">
        <nav className="flex gap-1 -mb-px">
          <Link
            to="/dashboard"
            className={cn(
              "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors",
              location.pathname === "/dashboard"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <LayoutDashboard className="h-4 w-4" /> Dashboard
          </Link>
          <Link
            to="/dashboard/campaigns"
            className={cn(
              "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors",
              location.pathname.startsWith("/dashboard/campaigns")
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Megaphone className="h-4 w-4" /> Campaigns
          </Link>
        </nav>
      </div>
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
