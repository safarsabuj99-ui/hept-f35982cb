import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { NavLink } from "@/components/NavLink";
import { ThemeToggle } from "@/components/ThemeToggle";
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
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Building2, CreditCard, Settings, LogOut, Crown, Megaphone, Shield, Activity,
  GitBranch, TrendingUp, BarChart3, Users, AlertTriangle, Grid3X3, LineChart, Calculator, HeartPulse, Trophy,
} from "lucide-react";
import { useMemo } from "react";

interface NavItem {
  to: string;
  icon: any;
  label: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const allSections: NavSection[] = [
  {
    title: "",
    items: [
      { to: "/platform", icon: LayoutDashboard, label: "Dashboard" },
      { to: "/platform/lifecycle", icon: GitBranch, label: "Lifecycle" },
    ],
  },
  {
    title: "Revenue",
    items: [
      { to: "/platform/revenue", icon: TrendingUp, label: "Revenue" },
      { to: "/platform/usage", icon: BarChart3, label: "Usage" },
      { to: "/platform/billing", icon: CreditCard, label: "Billing" },
      { to: "/platform/plans", icon: Settings, label: "Plans" },
    ],
  },
  {
    title: "Agencies",
    items: [
      { to: "/platform/agencies", icon: Building2, label: "Agencies" },
      { to: "/platform/announcements", icon: Megaphone, label: "Announcements" },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { to: "/platform/cohorts", icon: Users, label: "Cohorts" },
      { to: "/platform/churn", icon: AlertTriangle, label: "Churn Risk" },
      { to: "/platform/adoption", icon: Grid3X3, label: "Adoption" },
      { to: "/platform/forecasting", icon: LineChart, label: "Forecasting" },
      { to: "/platform/costs", icon: Calculator, label: "Costs" },
      { to: "/platform/health-scores", icon: HeartPulse, label: "Health Scores" },
      { to: "/platform/benchmarks", icon: Trophy, label: "Benchmarks" },
    ],
  },
  {
    title: "System",
    items: [
      { to: "/platform/audit", icon: Shield, label: "Audit Logs" },
      { to: "/platform/health", icon: Activity, label: "System Health" },
    ],
  },
];

function PlatformSidebarContent() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const isActive = (path: string) => path === "/platform" ? location.pathname === path : location.pathname === path;

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <Sidebar collapsible="icon" className="border-r-0 sidebar-premium">
      <SidebarHeader className="sidebar-header-premium">
        <div className="flex h-16 items-center gap-3 px-4">
          <div className="sidebar-logo-orb">
            <Crown className="h-5 w-5 text-white relative z-10" />
          </div>
          {!collapsed && (
            <div className="flex items-center gap-2 animate-slide-up-fade">
              <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
                Platform
              </span>
              <span className="sidebar-version-tag">SaaS</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 py-4 space-y-1">
        {allSections.map((section) => (
          <SidebarGroup key={section.title || "top"} className="p-0">
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
                {section.items.map((item) => {
                  const active = isActive(item.to);
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <NavLink
                          to={item.to}
                          end={item.to === "/platform"}
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
        ))}
      </SidebarContent>

      <SidebarFooter className="sidebar-footer-premium">
        <div className="flex items-center justify-between gap-2 px-3 py-3">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-all duration-200"
            onClick={handleSignOut}
            title="Sign Out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export function PlatformLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <PlatformSidebarContent />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-card/80 backdrop-blur-xl px-4 lg:px-6">
            <SidebarTrigger className="press-effect" />
            <div className="flex items-center gap-2 lg:hidden">
              <Crown className="h-5 w-5 text-primary" />
              <span className="text-base font-bold">Platform</span>
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
