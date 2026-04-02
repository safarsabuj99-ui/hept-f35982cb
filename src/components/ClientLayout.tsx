import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useImpersonation } from "@/hooks/useImpersonation";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  BarChart3, LogOut, Megaphone, LayoutDashboard, FileBarChart,
  ArrowLeft, Wallet
} from "lucide-react";
import { cn } from "@/lib/utils";

export function ClientLayout() {
  const { signOut, user } = useAuth();
  const location = useLocation();
  const { isImpersonating, stopImpersonating } = useImpersonation();
  const { profile } = useProfile();

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || "?";

  const tabs = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", match: (p: string) => p === "/dashboard" },
    { to: "/dashboard/wallet", icon: Wallet, label: "Wallet", match: (p: string) => p.startsWith("/dashboard/wallet") },
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

      {/* Premium glassmorphic header */}
      <header className="client-header sticky top-0 z-50 flex h-14 md:h-16 items-center justify-between px-4 md:px-8">
        {/* Left: Logo */}
        <div className="flex items-center gap-2.5">
          <div className="client-logo-orb">
            <BarChart3 className="h-4 w-4 text-primary-foreground relative z-10" />
          </div>
          <span className="text-base font-bold tracking-tight hidden sm:inline">AdSpend</span>
        </div>

        {/* Center: Desktop pill nav */}
        <nav className="hidden md:flex items-center gap-1 client-nav-bar">
          {tabs.map((tab) => {
            const isActive = tab.match(location.pathname);
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  "client-nav-pill flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full transition-all duration-200",
                  isActive
                    ? "client-nav-pill-active"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {/* Right: Avatar + controls */}
        <div className="flex items-center gap-2 md:gap-3">
          <NotificationBell allNotificationsPath="/dashboard/notifications" />
          <ThemeToggle />
          {!isImpersonating && (
            <Button variant="ghost" size="sm" onClick={signOut} className="gap-1.5 press-effect h-8 px-2 md:px-3 text-muted-foreground hover:text-foreground">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline text-xs">Sign Out</span>
            </Button>
          )}
          <Avatar className="h-8 w-8 md:h-9 md:w-9 client-avatar-ring">
            <AvatarFallback className="client-avatar-fallback text-xs font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 pb-20 md:pb-6">
        <div className="page-enter">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom tab bar — premium frosted glass */}
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
