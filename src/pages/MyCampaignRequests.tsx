import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useImpersonation } from "@/hooks/useImpersonation";
import { useDeepLinkAction } from "@/hooks/useDeepLinkAction";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Megaphone, Clock, Loader2, CheckCircle2, XCircle, ChevronDown, ExternalLink, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { TablePagination } from "@/components/TablePagination";

const STATUS_BADGE: Record<string, { className: string; label: string }> = {
  pending: { className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30", label: "Pending" },
  processing: { className: "bg-blue-500/10 text-blue-600 border-blue-500/30", label: "Processing" },
  completed: { className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30", label: "Completed" },
  rejected: { className: "bg-destructive/10 text-destructive border-destructive/30", label: "Rejected" },
};

const PLATFORM_LABELS: Record<string, string> = { meta: "Meta", tiktok: "TikTok", google: "Google" };

export default function MyCampaignRequests() {
  const { user } = useAuth();
  const { effectiveClientId } = useImpersonation();
  const { highlightId } = useDeepLinkAction();
  const [requests, setRequests] = useState<any[]>([]);
  const [tasksByRequest, setTasksByRequest] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    if (!highlightId || loading) return;
    setTimeout(() => {
      document.getElementById(`campaign-req-${highlightId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 500);
  }, [highlightId, loading]);

  const fetchRequests = useCallback(async () => {
    if (!effectiveClientId) return;
    const [{ data: reqs }, { data: allTasks }] = await Promise.all([
      supabase.from("campaign_requests" as any).select("*").eq("client_id", effectiveClientId).order("created_at", { ascending: true }) as any,
      supabase.from("campaign_tasks" as any).select("*").order("created_at", { ascending: true }) as any,
    ]);
    setRequests(reqs ?? []);
    const grouped: Record<string, any[]> = {};
    (allTasks ?? []).forEach((t: any) => {
      if (!grouped[t.request_id]) grouped[t.request_id] = [];
      grouped[t.request_id].push(t);
    });
    setTasksByRequest(grouped);
    setLoading(false);
  }, [effectiveClientId]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  useEffect(() => {
    if (!effectiveClientId) return;
    const channel = supabase
      .channel("my-campaign-requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_requests", filter: `client_id=eq.${effectiveClientId}` }, () => fetchRequests())
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_tasks" }, () => fetchRequests())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [effectiveClientId, fetchRequests]);

  const counts = {
    total: requests.length,
    pending: requests.filter(r => r.status === "pending").length,
    processing: requests.filter(r => r.status === "processing").length,
    completed: requests.filter(r => r.status === "completed").length,
  };

  return (
    <div className="space-y-4 md:space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
            <Megaphone className="h-5 w-5 md:h-6 md:w-6 text-primary shrink-0" />
            <span className="truncate">Campaign Requests</span>
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">Submit and track your campaign requests</p>
        </div>
        <Button asChild size="sm" className="shrink-0 h-9 md:h-10">
          <Link to="/dashboard/campaigns/new"><Plus className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">New Request</span><span className="sm:hidden">New</span></Link>
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>
      ) : (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3">
            <Card className="border-primary/20">
              <CardContent className="pt-3 pb-2 md:pt-4 md:pb-3 flex items-center gap-2 md:gap-3">
                <div className="flex h-8 w-8 md:h-9 md:w-9 items-center justify-center rounded-lg bg-primary/10">
                  <Megaphone className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
                </div>
                <div><p className="text-xl md:text-2xl font-bold">{counts.total}</p><p className="text-[10px] md:text-xs text-muted-foreground">Total</p></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3 pb-2 md:pt-4 md:pb-3 flex items-center gap-2 md:gap-3">
                <div className="flex h-8 w-8 md:h-9 md:w-9 items-center justify-center rounded-lg bg-yellow-500/10">
                  <Clock className="h-3.5 w-3.5 md:h-4 md:w-4 text-yellow-600" />
                </div>
                <div><p className="text-xl md:text-2xl font-bold">{counts.pending}</p><p className="text-[10px] md:text-xs text-muted-foreground">Pending</p></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3 pb-2 md:pt-4 md:pb-3 flex items-center gap-2 md:gap-3">
                <div className="flex h-8 w-8 md:h-9 md:w-9 items-center justify-center rounded-lg bg-blue-500/10">
                  <Loader2 className="h-3.5 w-3.5 md:h-4 md:w-4 text-blue-600" />
                </div>
                <div><p className="text-xl md:text-2xl font-bold">{counts.processing}</p><p className="text-[10px] md:text-xs text-muted-foreground">Processing</p></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3 pb-2 md:pt-4 md:pb-3 flex items-center gap-2 md:gap-3">
                <div className="flex h-8 w-8 md:h-9 md:w-9 items-center justify-center rounded-lg bg-emerald-500/10">
                  <CheckCircle2 className="h-3.5 w-3.5 md:h-4 md:w-4 text-emerald-600" />
                </div>
                <div><p className="text-xl md:text-2xl font-bold">{counts.completed}</p><p className="text-[10px] md:text-xs text-muted-foreground">Completed</p></div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-4 md:pt-6">
              {requests.length === 0 ? (
                <div className="py-12 text-center space-y-3">
                  <Megaphone className="h-10 w-10 text-muted-foreground/40 mx-auto" />
                  <p className="text-muted-foreground">No campaign requests yet</p>
                  <Button asChild variant="outline"><Link to="/dashboard/campaigns/new">Submit your first request</Link></Button>
                </div>
              ) : (
                <>
                <div className="space-y-2">
                  {requests.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((r: any) => {
                    const badge = STATUS_BADGE[r.status] || STATUS_BADGE.pending;
                    const tasks = tasksByRequest[r.id] || [];
                    const isLegacy = tasks.length === 0;
                    const displayTitle = r.title || r.platform || "Untitled";

                    return (
                      <Collapsible key={r.id}>
                        <CollapsibleTrigger className="w-full" id={`campaign-req-${r.id}`}>
                          <div className={cn("flex items-center justify-between p-2.5 sm:p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left gap-2", highlightId === r.id && "deep-link-highlight")}>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs md:text-sm text-muted-foreground whitespace-nowrap">
                                  {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                </span>
                                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                              </div>
                              <span className="text-xs md:text-sm font-medium truncate">{displayTitle}</span>
                              {!isLegacy && (
                                <span className="text-[10px] text-muted-foreground">{tasks.length} task{tasks.length > 1 ? "s" : ""}</span>
                              )}
                              {isLegacy && (
                                <Badge variant="secondary" className="shrink-0 text-[10px] md:text-xs">{PLATFORM_LABELS[r.platform] || r.platform}</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 md:gap-3 shrink-0">
                              <span className="font-mono text-xs md:text-sm font-medium">${Number(r.total_budget_usd || r.budget_usd || 0).toFixed(2)}</span>
                              <Badge variant="outline" className={`text-[10px] md:text-xs ${badge.className}`}>{badge.label}</Badge>
                              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mx-2 sm:mx-3 mb-2 p-2 sm:p-3 md:p-4 rounded-lg border border-dashed bg-muted/30 space-y-2 sm:space-y-3">
                            {r.ad_caption && (
                              <p className="text-xs md:text-sm text-muted-foreground">{r.ad_caption}</p>
                            )}

                            {/* Child tasks */}
                            {tasks.length > 0 ? (
                              <div className="space-y-2">
                                {tasks.map((task: any, idx: number) => {
                                  const taskBadge = STATUS_BADGE[task.status] || STATUS_BADGE.pending;
                                  return (
                                    <div key={task.id} className="flex items-center justify-between p-2 sm:p-2.5 rounded-md border bg-background gap-1.5 sm:gap-2">
                                      <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                                        <span className="text-[10px] text-muted-foreground font-mono">#{idx + 1}</span>
                                        <span className="text-xs font-semibold truncate max-w-[140px]">{task.product_name || "—"}</span>
                                        <Badge variant="secondary" className="text-[10px]">{PLATFORM_LABELS[task.platform] || task.platform}</Badge>
                                        <span className="text-xs text-muted-foreground truncate">{task.objective}</span>
                                        {task.quantity > 1 && <span className="text-[10px] text-muted-foreground">×{task.quantity}</span>}
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <span className="font-mono text-xs">${Number(task.budget_usd).toFixed(2)}</span>
                                        <Badge variant="outline" className={cn("text-[10px]", taskBadge.className)}>{taskBadge.label}</Badge>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              /* Legacy single-task display */
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                <div>
                                  <p className="text-[10px] md:text-xs text-muted-foreground">Objective</p>
                                  <p className="text-xs md:text-sm">{r.objective}</p>
                                </div>
                                {r.creative_link && (
                                  <div className="min-w-0">
                                    <p className="text-[10px] md:text-xs text-muted-foreground">Creative Link</p>
                                    <a href={r.creative_link} target="_blank" rel="noopener noreferrer" className="text-xs md:text-sm text-primary hover:underline truncate block">{r.creative_link}</a>
                                  </div>
                                )}
                              </div>
                            )}

                            {r.status === "rejected" && r.rejection_reason && (
                              <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                                <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                                <div>
                                  <p className="text-[10px] md:text-xs font-medium text-destructive">Rejection Reason</p>
                                  <p className="text-xs md:text-sm">{r.rejection_reason}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </div>
                <TablePagination totalItems={requests.length} pageSize={pageSize} currentPage={currentPage} onPageChange={setCurrentPage} onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }} />
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
