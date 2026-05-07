import { Link, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useImpersonation } from "@/hooks/useImpersonation";
import { useProfile } from "@/hooks/useProfile";
import { useBranding } from "@/hooks/useBranding";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  LogOut, Megaphone, LayoutDashboard, FileBarChart,
  ArrowLeft, Wallet, BarChart3
} from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
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

const tabs = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", match: (p: string) => p === "/dashboard" },
  { to: "/dashboard/wallet", icon: Wallet, label: "Wallet", match: (p: string) => p.startsWith("/dashboard/wallet") },
  { to: "/dashboard/campaigns", icon: Megaphone, label: "Campaigns", match: (p: string) => p.startsWith("/dashboard/campaigns") },
  { to: "/dashboard/reports", icon: FileBarChart, label: "Reports", match: (p: string) => p.startsWith("/dashboard/reports") },
];

function ClientSidebarContent() {
  const { signOut } = useAuth();
  const { isImpersonating } = useImpersonation();
  const { brandName, logoUrl } = useBranding();
  const location = useLocation();
  const { state, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";

  useEffect(() => {
    setOpenMobile(false);
  }, [location.pathname, setOpenMobile]);

  return (
    <Sidebar collapsible="icon" className="border-r-0 sidebar-premium hidden md:flex">
      <SidebarHeader className="sidebar-header-premium">
        <div className="flex h-16 items-center gap-3 px-4">
          <div className="sidebar-logo-orb overflow-hidden">
            {logoUrl ? (
              <img src={logoUrl} alt={brandName} className="h-full w-full object-contain p-0.5 relative z-10" />
            ) : (
              <BarChart3 className="h-5 w-5 text-white relative z-10" />
            )}
          </div>
          {!collapsed && (
            <div className="flex items-center gap-2 animate-slide-up-fade">
              <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
                {brandName}
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 py-4 space-y-1">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {tabs.map((tab) => {
                const active = tab.match(location.pathname);
                return (
                  <SidebarMenuItem key={tab.to}>
                    <SidebarMenuButton asChild isActive={active} tooltip={tab.label}>
                      <Link
                        to={tab.to}
                        className={cn(
                          "group/nav relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300",
                          active
                            ? "sidebar-nav-active"
                            : "text-sidebar-foreground/60 hover:text-sidebar-foreground sidebar-nav-hover"
                        )}
                      >
                        <div className={cn(
                          "relative flex items-center justify-center shrink-0 transition-all duration-300",
                          active ? "sidebar-icon-bubble" : ""
                        )}>
                          <tab.icon className={cn(
                            "h-4 w-4 relative z-10 transition-all duration-300",
                            active ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/50 group-hover/nav:text-sidebar-foreground/80"
                          )} />
                        </div>
                        {!collapsed && <span className="truncate">{tab.label}</span>}
                      </Link>
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
          {!isImpersonating && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-all duration-200"
              onClick={signOut}
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export function ClientLayout() {
  const { signOut, user } = useAuth();
  const location = useLocation();
  const { isImpersonating, stopImpersonating } = useImpersonation();
  const { profile } = useProfile();
  const { brandName, logoUrl } = useBranding();

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || "?";

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full flex-col bg-background">
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

        <div className="flex flex-1 w-full min-w-0">
          <ClientSidebarContent />

          <div className="flex-1 flex flex-col min-w-0">
            {/* Desktop header */}
            <header className="client-header sticky top-0 z-50 hidden md:flex h-16 items-center justify-between px-6">
              <div className="flex items-center gap-3">
                <SidebarTrigger className="press-effect" />
              </div>
              <div className="flex items-center gap-3">
                <NotificationBell allNotificationsPath="/dashboard/notifications" />
                <Avatar className="h-9 w-9 client-avatar-ring">
                  <AvatarFallback className="client-avatar-fallback text-xs font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </div>
            </header>

            {/* Mobile header (preserved) */}
            <header className="client-header sticky top-0 z-50 flex md:hidden h-14 items-center justify-between px-4">
              <div className="flex items-center gap-2.5">
                <div className="client-logo-orb overflow-hidden">
                  {logoUrl ? (
                    <img src={logoUrl} alt={brandName} className="h-full w-full object-contain p-0.5 relative z-10" />
                  ) : (
                    <BarChart3 className="h-4 w-4 text-primary-foreground relative z-10" />
                  )}
                </div>
                <span className="text-base font-bold tracking-tight hidden sm:inline">{brandName}</span>
              </div>
              <div className="flex items-center gap-2">
                <NotificationBell allNotificationsPath="/dashboard/notifications" />
                <ThemeToggle />
                {!isImpersonating && (
                  <Button variant="ghost" size="sm" onClick={signOut} className="gap-1.5 press-effect h-8 px-2 text-muted-foreground hover:text-foreground">
                    <LogOut className="h-4 w-4" />
                  </Button>
                )}
                <Avatar className="h-8 w-8 client-avatar-ring">
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
          </div>
        </div>

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
    </SidebarProvider>
  );
}
