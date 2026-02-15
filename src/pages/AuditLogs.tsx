import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollText } from "lucide-react";

interface AuditLog {
  id: string;
  user_id: string;
  action_type: string;
  description: string;
  created_at: string;
  user_name?: string;
}

const ACTION_COLORS: Record<string, string> = {
  funds_added: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  spend_logged: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  client_created: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  exchange_rate_changed: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  transaction_completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  transaction_rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      const { data } = await supabase
        .from("audit_logs" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (!data || data.length === 0) {
        setLogs([]);
        setLoading(false);
        return;
      }

      const userIds = [...new Set((data as any[]).map((l) => l.user_id))];
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
      const nameMap = Object.fromEntries((profiles ?? []).map((p) => [p.user_id, p.full_name]));

      setLogs(
        (data as any[]).map((l) => ({
          ...l,
          user_name: nameMap[l.user_id] || "System",
        }))
      );
      setLoading(false);
    };
    fetchLogs();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ScrollText className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Logs</h1>
          <p className="text-muted-foreground">Comprehensive audit trail of all system actions</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="space-y-3">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : logs.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No audit logs yet</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
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
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{log.description}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
