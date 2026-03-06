import { Link, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions, type PermissionKey } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  BarChart3, Users, PlusCircle, LogOut, Menu, X,
  Settings, ScrollText, UserCog, Monitor, Plug,
  MapPin, TrendingUp, Banknote, Megaphone,
} from "lucide-react";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { usePendingCounts } from "@/hooks/usePendingCounts";

const allNavItems: { to: string; icon: any; label: string; permKey?: PermissionKey }[] = [
  { to: "/admin", icon: BarChart3, label: "Dashboard", permKey: "can_view_dashboard_stats" },
  { to: "/admin/clients", icon: Users, label: "Client List", permKey: "can_manage_clients" },
  { to: "/admin/team", icon: UserCog, label: "Team", permKey: "can_manage_team" },
  { to: "/admin/clients/new", icon: PlusCircle, label: "New Client", permKey: "can_manage_clients" },
  
  { to: "/admin/ad-accounts", icon: Monitor, label: "Ad Accounts" },
  { to: "/admin/integrations", icon: Plug, label: "Integrations", permKey: "can_configure_system" },
  { to: "/admin/campaigns", icon: MapPin, label: "Campaigns", permKey: "can_manage_campaigns" },
  
  { to: "/admin/finance", icon: TrendingUp, label: "Finance", permKey: "can_manage_finance" },
  { to: "/admin/payment-requests", icon: Banknote, label: "Payments", permKey: "can_manage_finance" },
  { to: "/admin/orders", icon: Megaphone, label: "Orders", permKey: "can_manage_campaigns" },
  { to: "/admin/settings", icon: Settings, label: "Settings", permKey: "can_configure_system" },
  { to: "/admin/logs", icon: ScrollText, label: "System Logs", permKey: "can_configure_system" },
];

export function AdminLayout() {
  const { signOut } = useAuth();
  const { hasPermission } = usePermissions();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pendingPayments, pendingOrders } = usePendingCounts();

  const badgeCounts: Record<string, number> = {
    "/admin/payment-requests": pendingPayments,
    "/admin/orders": pendingOrders,
  };

  const navItems = useMemo(
    () => allNavItems.filter((item) => !item.permKey || hasPermission(item.permKey)),
    [hasPermission]
  );

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 flex-col bg-sidebar text-sidebar-foreground lg:flex sticky top-0 h-screen">
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
          <BarChart3 className="h-6 w-6 text-sidebar-primary" />
          <span className="text-lg font-bold text-sidebar-primary-foreground">AdSpend</span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                location.pathname === item.to
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
              {badgeCounts[item.to] > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {badgeCounts[item.to]}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center justify-between border-t border-sidebar-border p-4">
          <Button
            variant="ghost"
            className="flex-1 justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b bg-card px-4 lg:hidden">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <span className="text-lg font-bold">AdSpend</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </header>

        {mobileOpen && (
          <div className="absolute inset-x-0 top-16 z-50 border-b bg-card p-4 shadow-lg lg:hidden">
            <nav className="space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    location.pathname === item.to
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground hover:bg-accent"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                  {badgeCounts[item.to] > 0 && (
                    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                      {badgeCounts[item.to]}
                    </span>
                  )}
                </Link>
              ))}
              <button
                onClick={signOut}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive hover:bg-accent"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </nav>
          </div>
        )}

        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
