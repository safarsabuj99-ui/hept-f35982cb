import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Megaphone } from "lucide-react";

const STATUS_BADGE: Record<string, { className: string; label: string }> = {
  pending: { className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30", label: "Pending" },
  processing: { className: "bg-blue-500/10 text-blue-600 border-blue-500/30", label: "Processing" },
  completed: { className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30", label: "Completed" },
  rejected: { className: "bg-destructive/10 text-destructive border-destructive/30", label: "Rejected" },
};

const PLATFORM_LABELS: Record<string, string> = { meta: "Meta", tiktok: "TikTok", google: "Google" };

export default function MyCampaignRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = useCallback(async () => {
    if (!user) return;
    const { data } = await (supabase.from("campaign_requests" as any).select("*").eq("client_id", user.id).order("created_at", { ascending: false }) as any);
    setRequests(data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("my-campaign-requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_requests", filter: `client_id=eq.${user.id}` }, () => fetchRequests())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchRequests]);

  if (loading) return <div className="space-y-4 max-w-4xl mx-auto"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Megaphone className="h-6 w-6 text-primary" /> My Campaign Requests</h1>
          <p className="text-sm text-muted-foreground mt-1">Track the status of your ad orders</p>
        </div>
        <Button asChild><Link to="/dashboard/campaigns/new"><Plus className="h-4 w-4 mr-1" /> New Campaign</Link></Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {requests.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <Megaphone className="h-10 w-10 text-muted-foreground/40 mx-auto" />
              <p className="text-muted-foreground">No campaign requests yet</p>
              <Button asChild variant="outline"><Link to="/dashboard/campaigns/new">Submit your first request</Link></Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Objective</TableHead>
                    <TableHead className="text-right">Budget</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((r: any) => {
                    const badge = STATUS_BADGE[r.status] || STATUS_BADGE.pending;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</TableCell>
                        <TableCell><Badge variant="secondary">{PLATFORM_LABELS[r.platform] || r.platform}</Badge></TableCell>
                        <TableCell className="text-sm">{r.objective}</TableCell>
                        <TableCell className="text-right font-mono">${Number(r.budget_usd).toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
                          {r.status === "rejected" && r.rejection_reason && (
                            <p className="text-xs text-destructive mt-1 max-w-[200px] truncate" title={r.rejection_reason}>{r.rejection_reason}</p>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">{r.duration_days}d from {r.start_date}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
