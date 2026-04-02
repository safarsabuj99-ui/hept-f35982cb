import { Link, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions, type PermissionKey } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NavLink } from "@/components/NavLink";
import {
  BarChart3, Users, PlusCircle, LogOut, Settings, ScrollText,
  UserCog, Monitor, Plug, MapPin, TrendingUp, Banknote, Megaphone, UserCircle, AlertTriangle, Activity, Bell as BellIcon,
} from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { usePendingCounts } from "@/hooks/usePendingCounts";
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
  permKey?: PermissionKey;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const allSections: NavSection[] = [
  {
    title: "",
    items: [
      { to: "/admin", icon: BarChart3, label: "Dashboard", permKey: "can_view_dashboard_stats" },
      { to: "/admin/attention", icon: AlertTriangle, label: "Attention", permKey: "can_view_dashboard_stats" },
    ],
  },
  {
    title: "Clients",
    items: [
      { to: "/admin/clients", icon: Users, label: "Client List", permKey: "can_manage_clients" },
      { to: "/admin/clients/new", icon: PlusCircle, label: "New Client", permKey: "can_manage_clients" },
      { to: "/admin/client-notices", icon: BellIcon, label: "Notices", permKey: "can_manage_clients" },
      { to: "/admin/team", icon: UserCog, label: "Team", permKey: "can_manage_team" },
    ],
  },
  {
    title: "Advertising",
    items: [
      { to: "/admin/ad-accounts", icon: Monitor, label: "Ad Accounts", permKey: "can_view_ad_accounts" },
      { to: "/admin/integrations", icon: Plug, label: "Integrations", permKey: "can_configure_system" },
      { to: "/admin/campaigns", icon: MapPin, label: "Campaigns", permKey: "can_manage_campaigns" },
    ],
  },
  {
    title: "Finance",
    items: [
      { to: "/admin/finance", icon: TrendingUp, label: "Finance", permKey: "can_manage_finance" },
      { to: "/admin/payment-requests", icon: Banknote, label: "Payments", permKey: "can_approve_payments" },
      { to: "/admin/orders", icon: Megaphone, label: "Orders", permKey: "can_manage_campaigns" },
    ],
  },
  {
    title: "System",
    items: [
      { to: "/admin/profile", icon: UserCircle, label: "My Profile" },
      { to: "/admin/settings", icon: Settings, label: "Settings", permKey: "can_configure_system" },
      { to: "/admin/sync-health", icon: Activity, label: "Sync Health", permKey: "can_configure_system" },
      { to: "/admin/logs", icon: ScrollText, label: "System Logs", permKey: "can_view_audit_logs" },
    ],
  },
];

function AdminSidebarContent() {
  const { hasPermission } = usePermissions();
  const { signOut } = useAuth();
  const location = useLocation();
  const { pendingPayments, pendingOrders } = usePendingCounts();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const badgeCounts: Record<string, number> = {
    "/admin/payment-requests": pendingPayments,
    "/admin/orders": pendingOrders,
  };

  const filteredSections = useMemo(
    () =>
      allSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => !item.permKey || hasPermission(item.permKey)),
        }))
        .filter((section) => section.items.length > 0),
    [hasPermission]
  );

  const isActive = (path: string) => location.pathname === path;

  return (
    <Sidebar collapsible="icon" className="border-r-0 sidebar-premium">
      {/* Premium Header */}
      <SidebarHeader className="sidebar-header-premium">
        <div className="flex h-16 items-center gap-3 px-4">
          <div className="sidebar-logo-orb">
            <BarChart3 className="h-5 w-5 text-white relative z-10" />
          </div>
          {!collapsed && (
            <div className="flex items-center gap-2 animate-slide-up-fade">
              <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
                AdSpend
              </span>
              <span className="sidebar-version-tag">v2.0</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      {/* Navigation */}
      <SidebarContent className="px-3 py-4 space-y-1">
        {filteredSections.map((section, sIdx) => (
          <SidebarGroup key={section.title || "top"} className="p-0">
            {/* Section divider label */}
            {section.title && !collapsed && (
              <div className="sidebar-section-divider">
                <span className="sidebar-section-label">{section.title}</span>
                <div className="sidebar-section-line" />
              </div>
            )}
            {section.title && collapsed && (
              <div className="my-2 mx-2 h-px bg-gradient-to-r from-transparent via-sidebar-border to-transparent" />
            )}

            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                {section.items.map((item, iIdx) => {
                  const active = isActive(item.to);
                  const badge = badgeCounts[item.to] || 0;
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
                          {/* Icon with bubble effect for active */}
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
                          {/* Glassmorphic badge */}
                          {badge > 0 && !collapsed && (
                            <span className="sidebar-badge-glass ml-auto">
                              {badge}
                            </span>
                          )}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* Premium Footer */}
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

export function AdminLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AdminSidebarContent />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-card/80 backdrop-blur-xl px-4 lg:px-6">
            <SidebarTrigger className="press-effect" />
            <div className="flex items-center gap-2 lg:hidden">
              <BarChart3 className="h-5 w-5 text-primary" />
              <span className="text-base font-bold">AdSpend</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <NotificationBell allNotificationsPath="/admin/notifications" />
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
