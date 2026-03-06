import { Link, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions, type PermissionKey } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NavLink } from "@/components/NavLink";
import {
  BarChart3, Users, PlusCircle, LogOut, Settings, ScrollText,
  UserCog, Monitor, Plug, MapPin, TrendingUp, Banknote, Megaphone,
  ChevronRight,
} from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { usePendingCounts } from "@/hooks/usePendingCounts";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuBadge,
  SidebarProvider,
  SidebarTrigger,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface NavItem {
  to: string;
  icon: any;
  label: string;
  permKey?: PermissionKey;
}

interface NavSection {
  title: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

const allSections: NavSection[] = [
  {
    title: "Overview",
    defaultOpen: true,
    items: [
      { to: "/admin", icon: BarChart3, label: "Dashboard", permKey: "can_view_dashboard_stats" },
    ],
  },
  {
    title: "Clients",
    defaultOpen: true,
    items: [
      { to: "/admin/clients", icon: Users, label: "Client List", permKey: "can_manage_clients" },
      { to: "/admin/clients/new", icon: PlusCircle, label: "New Client", permKey: "can_manage_clients" },
      { to: "/admin/team", icon: UserCog, label: "Team", permKey: "can_manage_team" },
    ],
  },
  {
    title: "Advertising",
    items: [
      { to: "/admin/ad-accounts", icon: Monitor, label: "Ad Accounts" },
      { to: "/admin/integrations", icon: Plug, label: "Integrations", permKey: "can_configure_system" },
      { to: "/admin/campaigns", icon: MapPin, label: "Campaigns", permKey: "can_manage_campaigns" },
    ],
  },
  {
    title: "Finance",
    items: [
      { to: "/admin/finance", icon: TrendingUp, label: "Finance", permKey: "can_manage_finance" },
      { to: "/admin/payment-requests", icon: Banknote, label: "Payments", permKey: "can_manage_finance" },
      { to: "/admin/orders", icon: Megaphone, label: "Orders", permKey: "can_manage_campaigns" },
    ],
  },
  {
    title: "System",
    items: [
      { to: "/admin/settings", icon: Settings, label: "Settings", permKey: "can_configure_system" },
      { to: "/admin/logs", icon: ScrollText, label: "System Logs", permKey: "can_configure_system" },
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
    <Sidebar collapsible="icon" className="border-r-0">
      {/* Header / Logo */}
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex h-14 items-center gap-3 px-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl breathing-glow"
            style={{ background: "linear-gradient(135deg, hsl(var(--sidebar-primary)), hsl(260 60% 50%))" }}>
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <span className="text-lg font-bold tracking-tight text-sidebar-primary-foreground animate-slide-up-fade">
              AdSpend
            </span>
          )}
        </div>
      </SidebarHeader>

      {/* Navigation */}
      <SidebarContent className="px-2 py-3">
        {filteredSections.map((section) => {
          const sectionHasActive = section.items.some((item) => isActive(item.to));
          return (
            <Collapsible key={section.title} defaultOpen={section.defaultOpen || sectionHasActive} className="group/collapsible">
              <SidebarGroup>
                <CollapsibleTrigger asChild>
                  <SidebarGroupLabel className="cursor-pointer text-[10px] uppercase tracking-[0.15em] text-sidebar-foreground/40 hover:text-sidebar-foreground/60 transition-colors flex items-center justify-between pr-2">
                    {!collapsed && section.title}
                    {!collapsed && (
                      <ChevronRight className="h-3 w-3 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    )}
                  </SidebarGroupLabel>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {section.items.map((item) => {
                        const active = isActive(item.to);
                        const badge = badgeCounts[item.to] || 0;
                        return (
                          <SidebarMenuItem key={item.to}>
                            <SidebarMenuButton
                              asChild
                              isActive={active}
                              tooltip={item.label}
                            >
                              <NavLink
                                to={item.to}
                                end
                                className={cn(
                                  "group/nav relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                                  active
                                    ? "nav-active-indicator bg-sidebar-accent text-sidebar-primary"
                                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground hover:translate-x-0.5 hover:scale-[1.02]"
                                )}
                                activeClassName=""
                              >
                                <item.icon className={cn(
                                  "h-4 w-4 shrink-0 transition-all duration-200",
                                  active && "text-sidebar-primary"
                                )} />
                                {!collapsed && <span>{item.label}</span>}
                              </NavLink>
                            </SidebarMenuButton>
                            {badge > 0 && (
                              <SidebarMenuBadge className="animate-scale-bounce bg-destructive text-destructive-foreground text-[10px] font-bold">
                                {badge}
                              </SidebarMenuBadge>
                            )}
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          );
        })}
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 justify-start gap-2 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground press-effect text-xs"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Sign Out</span>}
          </Button>
          {!collapsed && <ThemeToggle />}
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
          {/* Mobile + desktop trigger header */}
          <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-card/80 backdrop-blur-xl px-4 lg:px-6">
            <SidebarTrigger className="press-effect" />
            <div className="flex items-center gap-2 lg:hidden">
              <BarChart3 className="h-5 w-5 text-primary" />
              <span className="text-base font-bold">AdSpend</span>
            </div>
            <div className="ml-auto flex items-center gap-2 lg:hidden">
              <ThemeToggle />
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
