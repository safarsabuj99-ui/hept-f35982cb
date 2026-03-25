import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollText, AlertTriangle, Info, CheckCircle2, ShieldAlert, Filter } from "lucide-react";
import { TablePagination } from "@/components/TablePagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AuditLog {
  id: string;
  user_id: string;
  action_type: string;
  description: string;
  created_at: string;
  user_name?: string;
}

// Severity mapping
const SEVERITY: Record<string, "critical" | "warning" | "info" | "success"> = {
  ad_guard_critical_error: "critical",
  transaction_rejected: "critical",
  payment_rejected: "critical",
  ad_guard_pause: "warning",
  exchange_rate_changed: "warning",
  client_password_reset: "warning",
  ad_guard_resume: "warning",
  client_created: "info",
  client_impersonation: "info",
  campaign_paused: "info",
  spend_logged: "info",
  funds_added: "success",
  transaction_completed: "success",
  payment_approved: "success",
  platform_transfer: "success",
};

const SEVERITY_CONFIG = {
  critical: { icon: ShieldAlert, color: "text-red-500", bg: "bg-red-100 dark:bg-red-900/30", dot: "bg-red-500" },
  warning: { icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-100 dark:bg-amber-900/30", dot: "bg-amber-500" },
  info: { icon: Info, color: "text-blue-500", bg: "bg-blue-100 dark:bg-blue-900/30", dot: "bg-blue-500" },
  success: { icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-100 dark:bg-emerald-900/30", dot: "bg-emerald-500" },
};

const ACTION_COLORS: Record<string, string> = {
  funds_added: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  spend_logged: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  client_created: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  exchange_rate_changed: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  transaction_completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  transaction_rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  payment_approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  payment_rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  client_password_reset: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  platform_transfer: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  ad_guard_pause: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  ad_guard_resume: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  client_impersonation: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

const ALL_ACTION_TYPES = [
  "funds_added", "spend_logged", "client_created", "exchange_rate_changed",
  "transaction_completed", "transaction_rejected", "payment_approved", "payment_rejected",
  "client_password_reset", "platform_transfer", "ad_guard_pause", "ad_guard_resume",
  "client_impersonation",
];

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filterType, setFilterType] = useState<string>("all");
  const [todayStats, setTodayStats] = useState({ total: 0, critical: 0 });

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const from = (currentPage - 1) * pageSize;
    const to = from + pageSize - 1;

    let countQuery = supabase.from("audit_logs" as any).select("*", { count: "exact", head: true });
    let dataQuery = supabase.from("audit_logs" as any).select("*").order("created_at", { ascending: false }).range(from, to);

    if (filterType !== "all") {
      countQuery = countQuery.eq("action_type", filterType);
      dataQuery = dataQuery.eq("action_type", filterType);
    }

    const [countRes, dataRes] = await Promise.all([countQuery, dataQuery]);

    setTotalCount(countRes.count ?? 0);
    const data = (dataRes.data as any[]) ?? [];

    if (data.length === 0) {
      setLogs([]);
      setLoading(false);
      return;
    }

    const userIds = [...new Set(data.map((l) => l.user_id))];
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
    const nameMap = Object.fromEntries((profiles ?? []).map((p) => [p.user_id, p.full_name]));

    setLogs(data.map((l) => ({ ...l, user_name: nameMap[l.user_id] || "System" })));
    setLoading(false);
  }, [currentPage, pageSize, filterType]);

  // Fetch today's stats
  const fetchTodayStats = useCallback(async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data, count } = await supabase
      .from("audit_logs" as any)
      .select("action_type", { count: "exact" })
      .gte("created_at", todayStart.toISOString());

    const criticalTypes = ["ad_guard_critical_error", "transaction_rejected", "payment_rejected"];
    const criticalCount = (data as any[] ?? []).filter((l) => criticalTypes.includes(l.action_type)).length;

    setTodayStats({ total: count ?? 0, critical: criticalCount });
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useEffect(() => { fetchTodayStats(); }, [fetchTodayStats]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("audit-logs-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "audit_logs" }, () => { fetchLogs(); fetchTodayStats(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchLogs, fetchTodayStats]);

  const getSeverity = (actionType: string) => SEVERITY[actionType] || "info";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ScrollText className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Logs</h1>
          <p className="text-muted-foreground">High-signal audit trail of critical actions</p>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex gap-4 flex-wrap">
        <Card className="flex-1 min-w-[140px]">
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <ScrollText className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Today</p>
              <p className="text-lg font-bold">{todayStats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[140px]">
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <ShieldAlert className="h-4 w-4 text-red-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Critical Today</p>
              <p className="text-lg font-bold text-red-500">{todayStats.critical}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filterType} onValueChange={(v) => { setFilterType(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue placeholder="Filter by action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {ALL_ACTION_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                <span className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${SEVERITY_CONFIG[getSeverity(t)].dot}`} />
                  {t.replace(/_/g, " ")}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="space-y-3">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : logs.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No logs found</p>
          ) : (
            <>
              {/* Mobile card view */}
              <div className="flex flex-col gap-3 md:hidden">
                {logs.map((log) => {
                  const severity = getSeverity(log.action_type);
                  const config = SEVERITY_CONFIG[severity];
                  return (
                    <div key={log.id} className="rounded-xl border bg-card p-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block h-2.5 w-2.5 rounded-full ${config.dot}`} />
                          <span className="font-medium text-sm">{log.user_name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString("en-US", {
                            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_COLORS[log.action_type] || "bg-muted text-muted-foreground"}`}>
                        {log.action_type.replace(/_/g, " ")}
                      </span>
                      <p className="text-sm text-muted-foreground">{log.description}</p>
                    </div>
                  );
                })}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]"></TableHead>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => {
                      const severity = getSeverity(log.action_type);
                      const config = SEVERITY_CONFIG[severity];
                      return (
                        <TableRow key={log.id}>
                          <TableCell className="pr-0">
                            <span className={`inline-block h-2.5 w-2.5 rounded-full ${config.dot}`} title={severity} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {new Date(log.created_at).toLocaleString("en-US", {
                              month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                            })}
                          </TableCell>
                          <TableCell className="font-medium">{log.user_name}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_COLORS[log.action_type] || "bg-muted text-muted-foreground"}`}>
                              {log.action_type.replace(/_/g, " ")}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[400px] truncate">{log.description}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <TablePagination
                totalItems={totalCount}
                pageSize={pageSize}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
