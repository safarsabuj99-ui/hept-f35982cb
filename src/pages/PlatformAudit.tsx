import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield } from "lucide-react";

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
      setLogs(logData ?? []); setOrgs(orgData ?? []); setLoading(false);
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
    if (["payment_rejected", "ad_guard_pause", "ad_guard_window_expired"].includes(action)) return "bg-destructive/15 text-destructive border-destructive/20";
    if (["payment_approved", "funds_added", "ad_guard_resume"].includes(action)) return "bg-success/15 text-success border-success/20";
    if (["exchange_rate_changed", "client_password_reset"].includes(action)) return "bg-blue-500/15 text-blue-400 border-blue-500/20";
    return "bg-muted text-muted-foreground";
  };

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );

  return (
    <div className="space-y-8">
      <PageHeader title="Platform Audit Logs" subtitle="Cross-organization activity monitoring" icon={<Shield className="h-6 w-6 text-primary" />} />

      <div className="flex gap-3 flex-wrap items-center animate-slide-up-fade" style={{ animationDelay: "100ms", animationFillMode: "forwards" }}>
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

      <div className="glass-card glow-border animate-slide-up-fade" style={{ animationDelay: "200ms", animationFillMode: "forwards" }}>
        <Card className="border-0 bg-transparent shadow-none">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Time</TableHead><TableHead>Organization</TableHead><TableHead>Action</TableHead><TableHead>Description</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((log) => (
                  <TableRow key={log.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-sm">{orgMap.get(log.org_id) || "—"}</TableCell>
                    <TableCell><Badge className={severityColor(log.action_type)}>{log.action_type}</Badge></TableCell>
                    <TableCell className="text-sm max-w-xs truncate">{log.description}</TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No logs found</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
