import { Link, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions, type PermissionKey } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  BarChart3, Users, DollarSign, LogOut, Menu, X, Megaphone,
} from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

const allNavItems: { to: string; icon: any; label: string; permKey: PermissionKey }[] = [
  { to: "/manager", icon: Users, label: "My Clients", permKey: "can_view_dashboard_stats" },
  { to: "/manager/add-funds", icon: DollarSign, label: "Add Funds", permKey: "can_manage_finance" },
];

export function ManagerLayout() {
  const { signOut } = useAuth();
  const { hasPermission } = usePermissions();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = useMemo(
    () => allNavItems.filter((item) => hasPermission(item.permKey)),
    [hasPermission]
  );

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 flex-col bg-sidebar text-sidebar-foreground lg:flex sticky top-0 h-screen">
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
          <BarChart3 className="h-6 w-6 text-sidebar-primary breathing-glow" />
          <span className="text-lg font-bold text-sidebar-primary-foreground">AdSpend</span>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                location.pathname === item.to
                  ? "nav-active-indicator bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:translate-x-0.5"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center justify-between border-t border-sidebar-border p-4">
          <Button
            variant="ghost"
            className="flex-1 justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground press-effect"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b bg-card/80 backdrop-blur-xl px-4 lg:hidden">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <span className="text-lg font-bold">AdSpend</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)} className="press-effect">
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </header>

        {mobileOpen && (
          <div className="absolute inset-x-0 top-16 z-50 border-b bg-card/95 backdrop-blur-xl p-4 shadow-lg lg:hidden animate-slide-up-fade">
            <nav className="space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    location.pathname === item.to
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground hover:bg-accent"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
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
          <div className="page-enter">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
