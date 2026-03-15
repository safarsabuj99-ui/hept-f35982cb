import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { LayoutDashboard, Building2, CreditCard, Settings, LogOut, Crown, Megaphone, Shield, Activity, GitBranch, TrendingUp, BarChart3, Users, AlertTriangle, Grid3X3, LineChart, Calculator, HeartPulse, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";

const navItems = [
  { title: "Dashboard", url: "/platform", icon: LayoutDashboard },
  { title: "Lifecycle", url: "/platform/lifecycle", icon: GitBranch },
  { title: "Revenue", url: "/platform/revenue", icon: TrendingUp },
  { title: "Usage", url: "/platform/usage", icon: BarChart3 },
  { title: "Agencies", url: "/platform/agencies", icon: Building2 },
  { title: "Billing", url: "/platform/billing", icon: CreditCard },
  { title: "Plans", url: "/platform/plans", icon: Settings },
  { title: "Announcements", url: "/platform/announcements", icon: Megaphone },
  { title: "Audit Logs", url: "/platform/audit", icon: Shield },
  { title: "System Health", url: "/platform/health", icon: Activity },
];

const intelligenceItems = [
  { title: "Cohorts", url: "/platform/cohorts", icon: Users },
  { title: "Churn Risk", url: "/platform/churn", icon: AlertTriangle },
  { title: "Adoption", url: "/platform/adoption", icon: Grid3X3 },
  { title: "Forecasting", url: "/platform/forecasting", icon: LineChart },
  { title: "Costs", url: "/platform/costs", icon: Calculator },
  { title: "Health Scores", url: "/platform/health-scores", icon: HeartPulse },
  { title: "Benchmarks", url: "/platform/benchmarks", icon: Trophy },
];

function PlatformSidebar() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarContent className="flex flex-col h-full">
        <div className="p-4 flex items-center gap-3 border-b border-sidebar-border/50">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Crown className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-sidebar-foreground truncate">Platform Owner</p>
              <p className="text-xs text-sidebar-foreground/50">SaaS Management</p>
            </div>
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end={item.url === "/platform"} className="hover:bg-sidebar-accent/50" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Intelligence</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {intelligenceItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} className="hover:bg-sidebar-accent/50" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="mt-auto p-3 border-t border-sidebar-border/50">
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50">
            <LogOut className="mr-2 h-4 w-4" />
            {!collapsed && "Sign Out"}
          </Button>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}

export function PlatformLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <PlatformSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-12 flex items-center border-b bg-background px-4">
            <SidebarTrigger className="mr-4" />
            <h2 className="text-sm font-semibold text-foreground">Platform Management</h2>
          </header>
          <main className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
