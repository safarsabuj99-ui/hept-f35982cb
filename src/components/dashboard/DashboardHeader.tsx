import { useAuth } from "@/hooks/useAuth";
import { Clock, MonitorSmartphone, ClipboardCheck } from "lucide-react";

interface DashboardHeaderProps {
  lastSynced: string | null;
  activeAccounts: number;
  pendingCount: number;
}

export function DashboardHeader({ lastSynced, activeAccounts, pendingCount }: DashboardHeaderProps) {
  const { user } = useAuth();
  
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const displayName = user?.email?.split("@")[0] ?? "Admin";
  
  const today = new Date().toLocaleDateString("en-US", {
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
            <span className="inline-block overflow-hidden">
              <span className="inline-block typewriter">
                {greeting},{" "}
              </span>
            </span>
            <span className="text-primary">{displayName}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-muted-foreground">
            <span className="hidden sm:inline">{today}</span>
            <span className="sm:hidden">{new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            {lastSynced && (
              <span className="inline-flex items-center gap-1.5 text-xs">
                <span className="pulse-dot" />
                <Clock className="h-3 w-3" /> {lastSynced}
              </span>
            )}
          </div>
        </div>
        {onSyncNow && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSyncNow}
            disabled={isSyncing}
            className={`gap-2 shrink-0 press-effect transition-all duration-300 ${
              isSyncing ? "animate-glow-pulse" : ""
            }`}
          >
            <RefreshCw className={`h-3.5 w-3.5 transition-transform duration-500 ${isSyncing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">{isSyncing ? "Syncing..." : "Sync Now"}</span>
          </Button>
        )}
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
