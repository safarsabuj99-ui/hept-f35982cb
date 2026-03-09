import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useImpersonation } from "@/hooks/useImpersonation";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BarChart3, LogOut, Shield, Megaphone, LayoutDashboard, FileBarChart, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function ClientLayout() {
  const { signOut, user } = useAuth();
  const location = useLocation();
  const { isImpersonating, stopImpersonating } = useImpersonation();

  const tabs = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", match: (p: string) => p === "/dashboard" },
    { to: "/dashboard/campaigns", icon: Megaphone, label: "Campaigns", match: (p: string) => p.startsWith("/dashboard/campaigns") },
    { to: "/dashboard/reports", icon: FileBarChart, label: "Reports", match: (p: string) => p.startsWith("/dashboard/reports") },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Impersonation banner */}
      {isImpersonating && (
        <div className="flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-amber-950">
          <span className="text-sm font-medium">You are viewing this dashboard as a client</span>
          <Button size="sm" variant="secondary" className="gap-1.5 h-7 text-xs press-effect" onClick={stopImpersonating}>
            <ArrowLeft className="h-3 w-3" /> Back to Admin
          </Button>
        </div>
      )}
      {/* Gradient accent bar */}
      <div className="h-1 w-full bg-gradient-to-r from-primary via-primary/70 to-accent" />
      <header className="sticky top-0 z-50 flex h-12 md:h-16 items-center justify-between border-b bg-card/80 backdrop-blur-xl px-4 md:px-8">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary breathing-glow" />
          <span className="text-lg font-bold tracking-tight hidden sm:inline">AdSpend Portal</span>
          <Badge variant="secondary" className="text-[10px] hidden sm:inline-flex gap-1 ml-1">
            <Shield className="h-2.5 w-2.5" /> Client
          </Badge>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <span className="hidden text-sm text-muted-foreground md:inline">
            {user?.email}
          </span>
          <ThemeToggle />
          {!isImpersonating && (
            <Button variant="ghost" size="sm" onClick={signOut} className="gap-2 press-effect h-8 px-2 md:px-3">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          )}
        </div>
      </header>
      {/* Desktop sub-nav — hidden on mobile */}
      <div className="hidden md:block border-b bg-card/50 px-4 md:px-8">
        <nav className="flex gap-1 -mb-px">
          {tabs.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-all duration-200",
                tab.match(location.pathname)
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              <tab.icon className="h-4 w-4" /> {tab.label}
            </Link>
          ))}
        </nav>
      </div>
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 pb-20 md:pb-6">
        <div className="page-enter">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bottom-tab-bar">
        <nav className="flex items-center justify-around px-2 py-1">
          {tabs.map((tab) => {
            const isActive = tab.match(location.pathname);
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  "bottom-tab-item flex-1",
                  isActive ? "bottom-tab-active" : "text-muted-foreground"
                )}
              >
                <tab.icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
