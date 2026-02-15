import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Megaphone, Clock, Loader2, CheckCircle2, XCircle, ChevronDown, ExternalLink, Target, FileText } from "lucide-react";

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

  const counts = {
    total: requests.length,
    pending: requests.filter(r => r.status === "pending").length,
    processing: requests.filter(r => r.status === "processing").length,
    completed: requests.filter(r => r.status === "completed").length,
    rejected: requests.filter(r => r.status === "rejected").length,
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Megaphone className="h-6 w-6 text-primary" /> My Campaign Requests</h1>
          <p className="text-sm text-muted-foreground mt-1">Track the status of your ad orders</p>
        </div>
        <Button asChild><Link to="/dashboard/campaigns/new"><Plus className="h-4 w-4 mr-1" /> New Campaign</Link></Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-primary/20">
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10"><Megaphone className="h-4 w-4 text-primary" /></div>
            <div><p className="text-2xl font-bold">{counts.total}</p><p className="text-xs text-muted-foreground">Total</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-yellow-500/10"><Clock className="h-4 w-4 text-yellow-600" /></div>
            <div><p className="text-2xl font-bold">{counts.pending}</p><p className="text-xs text-muted-foreground">Pending</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10"><Loader2 className="h-4 w-4 text-blue-600" /></div>
            <div><p className="text-2xl font-bold">{counts.processing}</p><p className="text-xs text-muted-foreground">Processing</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10"><CheckCircle2 className="h-4 w-4 text-emerald-600" /></div>
            <div><p className="text-2xl font-bold">{counts.completed}</p><p className="text-xs text-muted-foreground">Completed</p></div>
          </CardContent>
        </Card>
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
            <div className="space-y-2">
              {requests.map((r: any) => {
                const badge = STATUS_BADGE[r.status] || STATUS_BADGE.pending;
                return (
                  <Collapsible key={r.id}>
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="text-sm text-muted-foreground whitespace-nowrap">
                            {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                          <Badge variant="secondary" className="shrink-0">{PLATFORM_LABELS[r.platform] || r.platform}</Badge>
                          <span className="text-sm truncate">{r.objective}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-mono text-sm font-medium">${Number(r.budget_usd).toFixed(2)}</span>
                          <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
                          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mx-3 mb-2 p-4 rounded-lg border border-dashed bg-muted/30 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                          <div className="flex items-start gap-2">
                            <Target className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-muted-foreground">Target Audience</p>
                              <p>{r.target_audience_note || "Not specified"}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-muted-foreground">Ad Caption</p>
                              <p className="line-clamp-2">{r.ad_caption || "Not specified"}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <ExternalLink className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-muted-foreground">Creative Link</p>
                              <a href={r.creative_link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate block">{r.creative_link}</a>
                            </div>
                          </div>
                          {r.landing_page_url && (
                            <div className="flex items-start gap-2">
                              <ExternalLink className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                              <div>
                                <p className="text-xs text-muted-foreground">Landing Page</p>
                                <a href={r.landing_page_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate block">{r.landing_page_url}</a>
                              </div>
                            </div>
                          )}
                          <div>
                            <p className="text-xs text-muted-foreground">Schedule</p>
                            <p className="text-sm">{r.duration_days} days from {r.start_date}</p>
                          </div>
                        </div>
                        {r.status === "rejected" && r.rejection_reason && (
                          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                            <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs font-medium text-destructive">Rejection Reason</p>
                              <p className="text-sm">{r.rejection_reason}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
