import { Link, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions, type PermissionKey } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NavLink } from "@/components/NavLink";
import {
  BarChart3, Users, DollarSign, LogOut, Menu, X,
} from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

interface NavItem {
  to: string;
  icon: any;
  label: string;
  permKey: PermissionKey;
}

const allNavItems: NavItem[] = [
  { to: "/manager", icon: Users, label: "My Clients", permKey: "can_view_dashboard_stats" },
  { to: "/manager/add-funds", icon: DollarSign, label: "Add Funds", permKey: "can_manage_finance" },
];

function ManagerSidebarContent() {
  const { signOut } = useAuth();
  const { hasPermission } = usePermissions();
  const location = useLocation();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const navItems = useMemo(
    () => allNavItems.filter((item) => hasPermission(item.permKey)),
    [hasPermission]
  );

  const isActive = (path: string) => location.pathname === path;

  return (
    <Sidebar collapsible="icon" className="border-r-0 sidebar-premium">
      <SidebarHeader className="sidebar-header-premium">
        <div className="flex h-16 items-center gap-3 px-4">
          <div className="sidebar-logo-orb">
            <BarChart3 className="h-5 w-5 text-white relative z-10" />
          </div>
          {!collapsed && (
            <div className="flex items-center gap-2 animate-slide-up-fade">
              <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
                HEPT
              </span>
              <span className="sidebar-version-tag">v2.0</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 py-4 space-y-1">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {navItems.map((item) => {
                const active = isActive(item.to);
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                      <NavLink
                        to={item.to}
                        end
                        className={cn(
                          "group/nav relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300",
                          active
                            ? "sidebar-nav-active"
                            : "text-sidebar-foreground/60 hover:text-sidebar-foreground sidebar-nav-hover"
                        )}
                        activeClassName=""
                      >
                        <div className={cn(
                          "relative flex items-center justify-center shrink-0 transition-all duration-300",
                          active ? "sidebar-icon-bubble" : ""
                        )}>
                          <item.icon className={cn(
                            "h-4 w-4 relative z-10 transition-all duration-300",
                            active ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/50 group-hover/nav:text-sidebar-foreground/80"
                          )} />
                        </div>
                        {!collapsed && (
                          <span className="truncate">{item.label}</span>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="sidebar-footer-premium">
        <div className="flex items-center justify-between gap-2 px-3 py-3">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-all duration-200"
            onClick={signOut}
            title="Sign Out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export function ManagerLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <ManagerSidebarContent />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-card/80 backdrop-blur-xl px-4 lg:px-6">
            <SidebarTrigger className="press-effect" />
            <div className="flex items-center gap-2 lg:hidden">
              <BarChart3 className="h-5 w-5 text-primary" />
              <span className="text-base font-bold">HEPT</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <NotificationBell allNotificationsPath="/manager/notifications" />
              <div className="lg:hidden"><ThemeToggle /></div>
            </div>
          </header>

          <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
            <div className="page-enter">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
