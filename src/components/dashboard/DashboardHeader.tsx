import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { Clock, MonitorSmartphone, ClipboardCheck } from "lucide-react";

function getDhakaNow() {
  const dhakaDateTime = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Dhaka" });
  return new Date(dhakaDateTime.replace(" ", "T"));
}

interface DashboardHeaderProps {
  lastSynced: string | null;
  activeAccounts: number;
  pendingCount: number;
}

export function DashboardHeader({ lastSynced, activeAccounts, pendingCount }: DashboardHeaderProps) {
  const { user } = useAuth();
  const { profile } = useProfile();
  
  const dhakaNow = getDhakaNow();
  const hour = dhakaNow.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const displayName = profile?.full_name || user?.email?.split("@")[0] || "Admin";
  
  const today = dhakaNow.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="flex flex-col gap-3 animate-slide-up-fade" style={{ animationFillMode: "forwards" }}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            <span className="inline-block animate-slide-up-fade">
              {greeting},{" "}
            </span>
            <span className="text-primary">{displayName}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-muted-foreground">
            <span className="hidden sm:inline">{today}</span>
            <span className="sm:hidden">{dhakaNow.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            {lastSynced && (
              <span className="inline-flex items-center gap-1.5 text-xs">
                <span className="pulse-dot" />
                <Clock className="h-3 w-3" /> {lastSynced}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="stat-pill opacity-0 animate-scale-bounce" style={{ animationDelay: "200ms", animationFillMode: "forwards" }}>
          <MonitorSmartphone className="h-3.5 w-3.5 text-primary" />
          <span className="font-mono">{activeAccounts}</span> <span className="hidden xs:inline">Accounts</span>
        </div>
        <div className="stat-pill opacity-0 animate-scale-bounce" style={{ animationDelay: "350ms", animationFillMode: "forwards" }}>
          <ClipboardCheck className="h-3.5 w-3.5 text-warning" />
          <span className="font-mono">{pendingCount}</span> <span className="hidden xs:inline">Pending</span>
        </div>
      </div>
    </div>
  );
}
