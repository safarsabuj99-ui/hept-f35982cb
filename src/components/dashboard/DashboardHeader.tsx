import { useAuth } from "@/hooks/useAuth";
import { CurrencyToggle } from "@/components/CurrencyToggle";
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
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">
          {greeting}, <span className="text-primary">{displayName}</span>
        </h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{today}</span>
          {lastSynced && (
            <span className="inline-flex items-center gap-1.5 text-xs">
              <span className="pulse-dot" />
              <Clock className="h-3 w-3" /> {lastSynced}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="stat-pill">
          <MonitorSmartphone className="h-3.5 w-3.5 text-primary" />
          <span className="font-mono">{activeAccounts}</span> Accounts
        </div>
        <div className="stat-pill">
          <ClipboardCheck className="h-3.5 w-3.5 text-warning" />
          <span className="font-mono">{pendingCount}</span> Pending
        </div>
        <CurrencyToggle />
      </div>
    </div>
  );
}
