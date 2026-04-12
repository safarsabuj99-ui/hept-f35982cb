import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { NavLink } from "@/components/NavLink";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Link2, DollarSign, Wallet, User, LogOut, Gem,
} from "lucide-react";

const navItems = [
  { to: "/affiliate", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/affiliate/links", icon: Link2, label: "My Links" },
  { to: "/affiliate/earnings", icon: DollarSign, label: "Earnings" },
  { to: "/affiliate/payouts", icon: Wallet, label: "Payouts" },
  { to: "/affiliate/profile", icon: User, label: "Profile" },
];

function AffiliateSidebarContent() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const isActive = (path: string) => path === "/affiliate" ? location.pathname === path : location.pathname.startsWith(path);

  return (
    <Sidebar collapsible="icon" className="border-r-0 sidebar-premium">
      <SidebarHeader className="sidebar-header-premium">
        <div className="flex h-16 items-center gap-3 px-4">
          <div className="sidebar-logo-orb"><Gem className="h-5 w-5 text-white relative z-10" /></div>
          {!collapsed && (
            <div className="flex items-center gap-2 animate-slide-up-fade">
              <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">Affiliate</span>
              <span className="sidebar-version-tag">Portal</span>
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
                        end={item.to === "/affiliate"}
                        className={cn(
                          "group/nav relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300",
                          active ? "sidebar-nav-active" : "text-sidebar-foreground/60 hover:text-sidebar-foreground sidebar-nav-hover"
                        )}
                        activeClassName=""
                      >
                        <div className={cn("relative flex items-center justify-center shrink-0 transition-all duration-300", active ? "sidebar-icon-bubble" : "")}>
                          <item.icon className={cn("h-4 w-4 relative z-10 transition-all duration-300", active ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/50 group-hover/nav:text-sidebar-foreground/80")} />
                        </div>
                        {!collapsed && <span className="truncate">{item.label}</span>}
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
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/60" onClick={async () => { await signOut(); navigate("/affiliate/login"); }} title="Sign Out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export function AffiliateLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AffiliateSidebarContent />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-card/80 backdrop-blur-xl px-4 lg:px-6">
            <SidebarTrigger className="press-effect" />
            <div className="flex items-center gap-2 lg:hidden">
              <Gem className="h-5 w-5 text-primary" />
              <span className="text-base font-bold">Affiliate</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="lg:hidden"><ThemeToggle /></div>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
            <div className="page-enter"><Outlet /></div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
