import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

export default function PlatformAudit() {
  const [logs, setLogs] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgFilter, setOrgFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");

  useEffect(() => {
    const fetch = async () => {
      const [{ data: logData }, { data: orgData }] = await Promise.all([
        supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("organizations").select("id, name"),
      ]);
      setLogs(logData ?? []);
      setOrgs(orgData ?? []);
      setLoading(false);
    };
    fetch();
  }, []);

  const actionTypes = [...new Set(logs.map((l) => l.action_type))];
  const orgMap = new Map(orgs.map((o) => [o.id, o.name]));

  const filtered = logs.filter((l) => {
    if (orgFilter !== "all" && l.org_id !== orgFilter) return false;
    if (actionFilter !== "all" && l.action_type !== actionFilter) return false;
    return true;
  });

  const severityColor = (action: string) => {
    if (["payment_rejected", "ad_guard_pause", "ad_guard_window_expired"].includes(action)) return "destructive";
    if (["payment_approved", "funds_added", "ad_guard_resume"].includes(action)) return "default";
    if (["exchange_rate_changed", "client_password_reset"].includes(action)) return "outline";
    return "secondary";
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Platform Audit Logs</h1>
        <p className="text-sm text-muted-foreground">Cross-organization activity monitoring</p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Select value={orgFilter} onValueChange={setOrgFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All Organizations" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Organizations</SelectItem>
            {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All Actions" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {actionTypes.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="self-center">{filtered.length} records</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-sm">{orgMap.get(log.org_id) || "—"}</TableCell>
                  <TableCell><Badge variant={severityColor(log.action_type) as any}>{log.action_type}</Badge></TableCell>
                  <TableCell className="text-sm max-w-xs truncate">{log.description}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No logs found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
