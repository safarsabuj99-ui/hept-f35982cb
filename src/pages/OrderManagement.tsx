import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { debounce } from "@/lib/debounce";
import { useDeepLinkAction } from "@/hooks/useDeepLinkAction";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Play, CheckCircle2, XCircle, Eye, Megaphone, ExternalLink, Package, Search, X as XIcon, ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TablePagination } from "@/components/TablePagination";
import { DataPageSkeleton } from "@/components/ui/premium-skeletons";

const PLATFORM_LABELS: Record<string, string> = { meta: "Meta", tiktok: "TikTok", google: "Google" };

const STATUS_BADGE: Record<string, { className: string; label: string }> = {
  pending: { className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30", label: "Pending" },
  processing: { className: "bg-blue-500/10 text-blue-600 border-blue-500/30", label: "Processing" },
  completed: { className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30", label: "Completed" },
  rejected: { className: "bg-destructive/10 text-destructive border-destructive/30", label: "Rejected" },
};

function getTaskProgress(tasks: any[]) {
  if (!tasks.length) return { completed: 0, total: 0, percent: 0, color: "bg-yellow-500" };
  const completed = tasks.filter(t => t.status === "completed").length;
  const total = tasks.length;
  const percent = Math.round((completed / total) * 100);
  const allDone = completed === total;
  const allPending = tasks.every(t => t.status === "pending");
  const color = allDone ? "bg-emerald-500" : allPending ? "bg-yellow-500" : "bg-blue-500";
  return { completed, total, percent, color };
}

export default function OrderManagement() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canManageCampaigns = hasPermission("can_manage_campaigns");
  const { highlightId } = useDeepLinkAction();
  const deepLinkHandled = useRef(false);

  const [requests, setRequests] = useState<any[]>([]);
  const [tasksByRequest, setTasksByRequest] = useState<Record<string, any[]>>({});
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [tab, setTab] = useState("pending");

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectIsTask, setRejectIsTask] = useState(false);
  const [rejectParentId, setRejectParentId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const fetchAll = useCallback(async () => {
    const [{ data: reqs }, { data: profs }, { data: allTasks }] = await Promise.all([
      supabase.from("campaign_requests" as any).select("*").order("created_at", { ascending: false }) as any,
      supabase.from("profiles").select("user_id, full_name, business_name, email"),
      supabase.from("campaign_tasks" as any).select("*").order("created_at", { ascending: true }) as any,
    ]);
    setRequests(reqs ?? []);
    const profileMap: Record<string, any> = {};
    (profs ?? []).forEach((p: any) => { profileMap[p.user_id] = p; });
    setProfiles(profileMap);
    const grouped: Record<string, any[]> = {};
    (allTasks ?? []).forEach((t: any) => {
      if (!grouped[t.request_id]) grouped[t.request_id] = [];
      grouped[t.request_id].push(t);
    });
    setTasksByRequest(grouped);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!highlightId || loading || deepLinkHandled.current) return;
    deepLinkHandled.current = true;
    const target = requests.find((r: any) => r.id === highlightId);
    if (target) {
      setTab(target.status === "all" ? "all" : target.status);
      setSelectedRequest(target);
      setDetailOpen(true);
      setTimeout(() => {
        document.getElementById(`order-row-${highlightId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    }
  }, [highlightId, loading, requests]);

  useEffect(() => {
    const debounced = debounce(() => fetchAll(), 1500);
    const channel = supabase
      .channel("admin-campaign-requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_requests" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_tasks" }, debounced)
      .subscribe();
    return () => { debounced.cancel(); supabase.removeChannel(channel); };
  }, [fetchAll]);

  const updateRequestStatus = async (id: string, status: string, rejectionReason?: string) => {
    setActionLoading(id);
    const update: any = { status };
    if (rejectionReason) update.rejection_reason = rejectionReason;
    const { error } = await (supabase.from("campaign_requests" as any).update(update).eq("id", id) as any);
    if (!error) {
      const taskStatus = status === "processing" ? "processing" : status === "completed" ? "completed" : status === "rejected" ? "rejected" : "pending";
      const taskUpdate: any = { status: taskStatus };
      if (rejectionReason && status === "rejected") taskUpdate.rejection_reason = rejectionReason;
      await (supabase.from("campaign_tasks" as any).update(taskUpdate).eq("request_id", id) as any);
    }
    setActionLoading(null);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      const labels: Record<string, string> = { processing: "Started processing", completed: "Marked as completed", rejected: "Request rejected" };
      toast({ title: labels[status] || "Updated", description: `Campaign request status → ${status}` });
      fetchAll();
    }
  };

  const updateTaskStatus = async (taskId: string, requestId: string, status: string, rejectionReason?: string) => {
    setActionLoading(taskId);
    const update: any = { status };
    if (rejectionReason) update.rejection_reason = rejectionReason;
    await (supabase.from("campaign_tasks" as any).update(update).eq("id", taskId) as any);
    setActionLoading(null);

    const tasks = tasksByRequest[requestId] || [];
    const updatedTasks = tasks.map(t => t.id === taskId ? { ...t, status } : t);
    const allCompleted = updatedTasks.every(t => t.status === "completed");
    const allRejected = updatedTasks.every(t => t.status === "rejected");
    const anyProcessing = updatedTasks.some(t => t.status === "processing");
    const parentStatus = allCompleted ? "completed" : allRejected ? "rejected" : anyProcessing ? "processing" : "pending";
    await (supabase.from("campaign_requests" as any).update({ status: parentStatus }).eq("id", requestId) as any);

    toast({ title: "Task updated" });
    fetchAll();
  };

  const handleReject = () => {
    if (!rejectId || !rejectReason.trim()) return;
    if (rejectIsTask && rejectParentId) {
      updateTaskStatus(rejectId, rejectParentId, "rejected", rejectReason.trim());
    } else {
      updateRequestStatus(rejectId, "rejected", rejectReason.trim());
    }
    setRejectOpen(false);
    setRejectReason("");
    setRejectId(null);
    setRejectIsTask(false);
    setRejectParentId(null);
  };

  const openTaskReject = (taskId: string, parentId: string) => {
    setRejectId(taskId);
    setRejectIsTask(true);
    setRejectParentId(parentId);
    setRejectReason("");
    setRejectOpen(true);
  };

  const openRequestReject = (requestId: string) => {
    setRejectId(requestId);
    setRejectIsTask(false);
    setRejectParentId(null);
    setRejectReason("");
    setRejectOpen(true);
  };

  useEffect(() => { setCurrentPage(1); }, [tab, searchQuery]);

  const filtered = useMemo(() => {
    let result = requests.filter((r: any) => tab === "all" ? true : r.status === tab);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r: any) => {
        const client = profiles[r.client_id];
        const clientName = (client?.full_name || "").toLowerCase();
        const businessName = (client?.business_name || "").toLowerCase();
        const title = (r.title || "").toLowerCase();
        const platform = (r.platform || "").toLowerCase();
        return clientName.includes(q) || businessName.includes(q) || title.includes(q) || platform.includes(q);
      });
    }
    return result;
  }, [requests, tab, searchQuery, profiles]);
  const paginatedFiltered = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const counts = {
    pending: requests.filter((r: any) => r.status === "pending").length,
    processing: requests.filter((r: any) => r.status === "processing").length,
    completed: requests.filter((r: any) => r.status === "completed").length,
    rejected: requests.filter((r: any) => r.status === "rejected").length,
  };

  if (loading) return <DataPageSkeleton />;

  const selectedTasks = selectedRequest ? (tasksByRequest[selectedRequest.id] || []) : [];

  return (
    <div className="space-y-6">
      <div className="animate-slide-up-fade">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
          <Megaphone className="h-5 w-5 sm:h-6 sm:w-6 text-primary" /> Campaign Requests
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Manage incoming campaign requests from clients</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 opacity-0 animate-slide-up-fade stagger-2">
        {(["pending", "processing", "completed", "rejected"] as const).map((s) => {
          const badge = STATUS_BADGE[s];
          return (
            <Card key={s} className={cn("cursor-pointer transition-all hover:shadow-md", tab === s && "ring-2 ring-primary")} onClick={() => setTab(s)}>
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-2xl font-bold font-mono">{counts[s]}</p>
                <Badge variant="outline" className={cn("mt-1", badge.className)}>{badge.label}</Badge>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
        <Input
          placeholder="Search client, request title, platform..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2">
            <XIcon className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex w-full overflow-x-auto scrollbar-hide justify-start">
          <TabsTrigger value="pending" className="flex-shrink-0">Pending ({counts.pending})</TabsTrigger>
          <TabsTrigger value="processing" className="flex-shrink-0">Processing ({counts.processing})</TabsTrigger>
          <TabsTrigger value="completed" className="flex-shrink-0">Completed ({counts.completed})</TabsTrigger>
          <TabsTrigger value="rejected" className="flex-shrink-0">Rejected ({counts.rejected})</TabsTrigger>
          <TabsTrigger value="all" className="flex-shrink-0">All ({requests.length})</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <Card>
            <CardContent className="pt-4">
              {filtered.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No requests in this category</p>
              ) : (
                <>
                {/* Mobile card view */}
                <div className="flex flex-col gap-3 md:hidden">
                  {paginatedFiltered.map((r: any) => {
                    const client = profiles[r.client_id];
                    const badge = STATUS_BADGE[r.status] || STATUS_BADGE.pending;
                    const tasks = tasksByRequest[r.id] || [];
                    const displayTitle = r.title || r.platform || "Untitled";
                    const isMultiTask = tasks.length > 1;
                    const progress = getTaskProgress(tasks);
                    const isExpanded = expandedRows.has(r.id);

                    return (
                      <Collapsible key={r.id} open={isExpanded} onOpenChange={() => isMultiTask && toggleRow(r.id)}>
                        <div id={`order-row-${r.id}`} className={cn("rounded-xl border bg-card p-4 space-y-3", highlightId === r.id && "deep-link-highlight")}>
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium text-sm">{client?.full_name || "Unknown"}</p>
                              {client?.business_name && <p className="text-xs text-muted-foreground">{client.business_name}</p>}
                            </div>
                            <Badge variant="outline" className={cn("text-xs shrink-0", badge.className)}>{badge.label}</Badge>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <Package className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium">{displayTitle}</span>
                            {isMultiTask && (
                              <span className="text-xs text-muted-foreground">{progress.completed}/{progress.total} done</span>
                            )}
                          </div>

                          {/* Progress bar for multi-task */}
                          {isMultiTask && (
                            <div className="space-y-1">
                              <Progress value={progress.percent} className={cn("h-1.5", `[&>div]:${progress.color}`)} />
                            </div>
                          )}

                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">
                              {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                            <span className="font-mono font-semibold text-sm">${Number(r.total_budget_usd || r.budget_usd || 0).toFixed(2)}</span>
                          </div>

                          <div className="flex gap-2 pt-1">
                            {isMultiTask && (
                              <CollapsibleTrigger asChild>
                                <Button size="sm" variant="outline" className="flex-1 text-xs">
                                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5 mr-1" /> : <ChevronRight className="h-3.5 w-3.5 mr-1" />}
                                  {isExpanded ? "Hide" : "View"} Tasks
                                </Button>
                              </CollapsibleTrigger>
                            )}
                            <Button size="sm" variant="outline" className={cn("text-xs", !isMultiTask && "flex-1")} onClick={() => { setSelectedRequest(r); setDetailOpen(true); }}>
                              <Eye className="h-3.5 w-3.5 mr-1" /> Details
                            </Button>
                            {canManageCampaigns && r.status === "pending" && (
                              <>
                                <Button size="sm" variant="default" className="flex-1 text-xs" disabled={actionLoading === r.id} onClick={() => updateRequestStatus(r.id, "processing")}>
                                  {actionLoading === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1" />} Start All
                                </Button>
                                <Button size="sm" variant="destructive" className="text-xs" onClick={() => openRequestReject(r.id)}>
                                  <XCircle className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            {canManageCampaigns && r.status === "processing" && (
                              <Button size="sm" variant="default" className="flex-1 text-xs" disabled={actionLoading === r.id} onClick={() => updateRequestStatus(r.id, "completed")}>
                                {actionLoading === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />} Complete All
                              </Button>
                            )}
                          </div>

                          {/* Expanded tasks inline (mobile) */}
                          <CollapsibleContent>
                            <div className="space-y-2 pt-2 border-t mt-2">
                              {tasks.map((task: any, idx: number) => (
                                <InlineTaskCard
                                  key={task.id}
                                  task={task}
                                  idx={idx}
                                  requestId={r.id}
                                  canManage={canManageCampaigns}
                                  actionLoading={actionLoading}
                                  onStart={() => updateTaskStatus(task.id, r.id, "processing")}
                                  onComplete={() => updateTaskStatus(task.id, r.id, "completed")}
                                  onReject={() => openTaskReject(task.id, r.id)}
                                />
                              ))}
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    );
                  })}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8 text-[11px] uppercase tracking-widest text-muted-foreground/60"></TableHead>
                        <TableHead className="text-[11px] uppercase tracking-widest text-muted-foreground/60">Client</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-widest text-muted-foreground/60">Request</TableHead>
                        <TableHead className="text-center text-[11px] uppercase tracking-widest text-muted-foreground/60">Progress</TableHead>
                        <TableHead className="text-right text-[11px] uppercase tracking-widest text-muted-foreground/60">Budget</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-widest text-muted-foreground/60">Status</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-widest text-muted-foreground/60">Date</TableHead>
                        <TableHead className="text-right text-[11px] uppercase tracking-widest text-muted-foreground/60">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedFiltered.map((r: any) => {
                        const client = profiles[r.client_id];
                        const badge = STATUS_BADGE[r.status] || STATUS_BADGE.pending;
                        const tasks = tasksByRequest[r.id] || [];
                        const displayTitle = r.title || r.platform || "Untitled";
                        const isMultiTask = tasks.length > 1;
                        const progress = getTaskProgress(tasks);
                        const isExpanded = expandedRows.has(r.id);

                        return (
                          <>
                            <TableRow
                              key={r.id}
                              id={`order-row-${r.id}`}
                              className={cn(
                                highlightId === r.id && "deep-link-highlight",
                                isMultiTask && "cursor-pointer",
                                isExpanded && "border-b-0"
                              )}
                              onClick={() => isMultiTask && toggleRow(r.id)}
                            >
                              <TableCell className="w-8 px-2">
                                {isMultiTask && (
                                  isExpanded
                                    ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                    : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                              </TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-medium text-sm">{client?.full_name || "Unknown"}</p>
                                  <p className="text-xs text-muted-foreground">{client?.business_name || ""}</p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  <span className="text-sm font-medium truncate max-w-[200px]">{displayTitle}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                {isMultiTask ? (
                                  <div className="flex items-center gap-2 justify-center min-w-[100px]">
                                    <Progress value={progress.percent} className={cn("h-1.5 w-16", `[&>div]:${progress.color}`)} />
                                    <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">{progress.completed}/{progress.total}</span>
                                  </div>
                                ) : (
                                  <Badge variant="secondary" className="text-xs">{tasks.length || 1}</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-mono">${Number(r.total_budget_usd || r.budget_usd || 0).toFixed(2)}</TableCell>
                              <TableCell><Badge variant="outline" className={badge.className}>{badge.label}</Badge></TableCell>
                              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                                {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
                                  <Button size="sm" variant="ghost" onClick={() => { setSelectedRequest(r); setDetailOpen(true); }}>
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  {canManageCampaigns && r.status === "pending" && (
                                    <>
                                      <Button size="sm" variant="outline" disabled={actionLoading === r.id} onClick={() => updateRequestStatus(r.id, "processing")}>
                                        {actionLoading === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                                      </Button>
                                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => openRequestReject(r.id)}>
                                        <XCircle className="h-3.5 w-3.5" />
                                      </Button>
                                    </>
                                  )}
                                  {canManageCampaigns && r.status === "processing" && (
                                    <Button size="sm" variant="default" disabled={actionLoading === r.id} onClick={() => updateRequestStatus(r.id, "completed")}>
                                      {actionLoading === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                                      Complete
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>

                            {/* Expanded task sub-rows */}
                            {isMultiTask && isExpanded && tasks.map((task: any, idx: number) => {
                              const taskBadge = STATUS_BADGE[task.status] || STATUS_BADGE.pending;
                              return (
                                <TableRow key={task.id} className="bg-muted/30 hover:bg-muted/50">
                                  <TableCell className="w-8 px-2" />
                                  <TableCell colSpan={2}>
                                    <div className="flex items-center gap-2 pl-2">
                                      <span className="text-xs text-muted-foreground font-mono">#{idx + 1}</span>
                                      <Badge variant="secondary" className="text-[10px]">{PLATFORM_LABELS[task.platform] || task.platform}</Badge>
                                      <span className="text-sm">{task.objective}</span>
                                      {task.quantity > 1 && <Badge variant="outline" className="text-[10px]">×{task.quantity}</Badge>}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {task.creative_link && (
                                      <a
                                        href={task.creative_link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                                        onClick={e => e.stopPropagation()}
                                      >
                                        <ExternalLink className="h-3 w-3" /> Creative
                                      </a>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-sm">${Number(task.budget_usd).toFixed(2)}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className={cn("text-[10px]", taskBadge.className)}>{taskBadge.label}</Badge>
                                  </TableCell>
                                  <TableCell />
                                  <TableCell className="text-right">
                                    <div className="flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
                                      {canManageCampaigns && task.status === "pending" && (
                                        <>
                                          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={actionLoading === task.id} onClick={() => updateTaskStatus(task.id, r.id, "processing")}>
                                            {actionLoading === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 mr-1" />} Start
                                          </Button>
                                          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => openTaskReject(task.id, r.id)}>
                                            <XCircle className="h-3 w-3" />
                                          </Button>
                                        </>
                                      )}
                                      {canManageCampaigns && task.status === "processing" && (
                                        <Button size="sm" variant="default" className="h-7 text-xs" disabled={actionLoading === task.id} onClick={() => updateTaskStatus(task.id, r.id, "completed")}>
                                          {actionLoading === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />} Done
                                        </Button>
                                      )}
                                      {task.rejection_reason && (
                                        <span className="text-[10px] text-destructive max-w-[120px] truncate" title={task.rejection_reason}>
                                          {task.rejection_reason}
                                        </span>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <TablePagination totalItems={filtered.length} pageSize={pageSize} currentPage={currentPage} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detail Modal with Tasks */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Campaign Request Details
            </DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={STATUS_BADGE[selectedRequest.status]?.className}>{STATUS_BADGE[selectedRequest.status]?.label}</Badge>
                <span className="text-sm font-medium">{selectedRequest.title || selectedRequest.platform || "Untitled"}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <DetailItem label="Client" value={profiles[selectedRequest.client_id]?.full_name || "Unknown"} />
                <DetailItem label="Total Budget" value={`$${Number(selectedRequest.total_budget_usd || selectedRequest.budget_usd || 0).toFixed(2)}`} />
                <DetailItem label="Submitted" value={new Date(selectedRequest.created_at).toLocaleDateString()} />
              </div>
              {selectedRequest.ad_caption && <DetailItem label="Notes" value={selectedRequest.ad_caption} />}

              {selectedTasks.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Tasks ({selectedTasks.length})</h3>
                    {selectedTasks.length > 1 && (() => {
                      const p = getTaskProgress(selectedTasks);
                      return (
                        <div className="flex items-center gap-2">
                          <Progress value={p.percent} className={cn("h-1.5 w-20", `[&>div]:${p.color}`)} />
                          <span className="text-xs text-muted-foreground font-mono">{p.completed}/{p.total}</span>
                        </div>
                      );
                    })()}
                  </div>
                  {selectedTasks.map((task: any, idx: number) => {
                    const taskBadge = STATUS_BADGE[task.status] || STATUS_BADGE.pending;
                    return (
                      <div key={task.id} className="rounded-lg border p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground font-mono">#{idx + 1}</span>
                            <Badge variant="secondary">{PLATFORM_LABELS[task.platform] || task.platform}</Badge>
                            <span className="text-sm">{task.objective}</span>
                            {task.quantity > 1 && <Badge variant="outline" className="text-[10px]">×{task.quantity}</Badge>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">${Number(task.budget_usd).toFixed(2)}</span>
                            <Badge variant="outline" className={cn("text-[10px]", taskBadge.className)}>{taskBadge.label}</Badge>
                          </div>
                        </div>
                        {task.creative_link && (
                          <a href={task.creative_link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1 truncate">
                            <ExternalLink className="h-3 w-3 shrink-0" /> {task.creative_link}
                          </a>
                        )}
                        {task.ad_caption && <p className="text-xs text-muted-foreground">{task.ad_caption}</p>}
                        {task.rejection_reason && (
                          <p className="text-xs text-destructive">Rejected: {task.rejection_reason}</p>
                        )}
                        {canManageCampaigns && task.status === "pending" && (
                          <div className="flex gap-2 pt-1">
                            <Button size="sm" variant="outline" className="text-xs h-7" disabled={actionLoading === task.id} onClick={() => updateTaskStatus(task.id, selectedRequest.id, "processing")}>
                              {actionLoading === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 mr-1" />} Start
                            </Button>
                            <Button size="sm" variant="outline" className="text-xs h-7 text-destructive" disabled={actionLoading === task.id} onClick={() => openTaskReject(task.id, selectedRequest.id)}>
                              <XCircle className="h-3 w-3 mr-1" /> Reject
                            </Button>
                          </div>
                        )}
                        {canManageCampaigns && task.status === "processing" && (
                          <Button size="sm" variant="default" className="text-xs h-7" disabled={actionLoading === task.id} onClick={() => updateTaskStatus(task.id, selectedRequest.id, "completed")}>
                            {actionLoading === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />} Complete
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <DetailItem label="Platform" value={PLATFORM_LABELS[selectedRequest.platform] || selectedRequest.platform} />
                  <DetailItem label="Objective" value={selectedRequest.objective} />
                  <DetailItem label="Budget" value={`$${Number(selectedRequest.budget_usd).toFixed(2)}`} />
                  <DetailItem label="Duration" value={`${selectedRequest.duration_days} days`} />
                  <DetailItem label="Start Date" value={selectedRequest.start_date} />
                  {selectedRequest.creative_link && <DetailItem label="Creative Link" value={selectedRequest.creative_link} isLink />}
                </div>
              )}

              {selectedRequest.rejection_reason && (
                <div className="rounded-lg bg-destructive/10 p-3 border border-destructive/20">
                  <p className="text-xs text-destructive font-medium mb-0.5">Rejection Reason</p>
                  <p className="text-sm">{selectedRequest.rejection_reason}</p>
                </div>
              )}

              {canManageCampaigns && selectedTasks.length > 0 && selectedRequest.status === "pending" && (
                <div className="flex gap-2 pt-2 border-t">
                  <Button size="sm" disabled={actionLoading === selectedRequest.id} onClick={() => updateRequestStatus(selectedRequest.id, "processing")}>
                    {actionLoading === selectedRequest.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Play className="h-3.5 w-3.5 mr-1" />} Start All
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => { openRequestReject(selectedRequest.id); setDetailOpen(false); }}>
                    <XCircle className="h-3.5 w-3.5 mr-1" /> Reject All
                  </Button>
                </div>
              )}
              {canManageCampaigns && selectedTasks.length > 0 && selectedRequest.status === "processing" && (
                <div className="flex gap-2 pt-2 border-t">
                  <Button size="sm" disabled={actionLoading === selectedRequest.id} onClick={() => updateRequestStatus(selectedRequest.id, "completed")}>
                    {actionLoading === selectedRequest.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />} Complete All
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Modal (works for both requests and individual tasks) */}
      <Dialog open={rejectOpen} onOpenChange={(o) => { setRejectOpen(o); if (!o) { setRejectReason(""); setRejectId(null); setRejectIsTask(false); setRejectParentId(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{rejectIsTask ? "Reject Task" : "Reject Campaign Request"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Reason for rejection *</Label>
            <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder={rejectIsTask ? "Explain why this task is being rejected..." : "Explain why this request is being rejected..."} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectOpen(false); setRejectReason(""); setRejectId(null); setRejectIsTask(false); setRejectParentId(null); }}>Cancel</Button>
            <Button variant="destructive" disabled={!rejectReason.trim() || actionLoading === rejectId} onClick={handleReject}>
              {actionLoading === rejectId && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {rejectIsTask ? "Reject Task" : "Reject Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* Inline task card for mobile expanded view */
function InlineTaskCard({ task, idx, canManage, actionLoading, onStart, onComplete, onReject }: {
  task: any; idx: number; requestId: string; canManage: boolean; actionLoading: string | null;
  onStart: () => void; onComplete: () => void; onReject: () => void;
}) {
  const taskBadge = STATUS_BADGE[task.status] || STATUS_BADGE.pending;
  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground font-mono">#{idx + 1}</span>
          <span className="text-xs font-semibold truncate max-w-[160px]">{task.product_name || "—"}</span>
          <Badge variant="secondary" className="text-[10px]">{PLATFORM_LABELS[task.platform] || task.platform}</Badge>
          <span className="text-xs">{task.objective}</span>
          {task.quantity > 1 && <Badge variant="outline" className="text-[10px]">×{task.quantity}</Badge>}
        </div>
        <Badge variant="outline" className={cn("text-[10px] shrink-0", taskBadge.className)}>{taskBadge.label}</Badge>
      </div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs">${Number(task.budget_usd).toFixed(2)}</span>
        {task.creative_link && (
          <a href={task.creative_link} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
            <ExternalLink className="h-2.5 w-2.5" /> Creative
          </a>
        )}
      </div>
      {task.ad_caption && <p className="text-[10px] text-muted-foreground">{task.ad_caption}</p>}
      {task.rejection_reason && <p className="text-[10px] text-destructive">Rejected: {task.rejection_reason}</p>}
      {canManage && task.status === "pending" && (
        <div className="flex gap-1.5 pt-1">
          <Button size="sm" variant="outline" className="text-[10px] h-6 px-2" disabled={actionLoading === task.id} onClick={onStart}>
            {actionLoading === task.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Play className="h-2.5 w-2.5 mr-0.5" />} Start
          </Button>
          <Button size="sm" variant="outline" className="text-[10px] h-6 px-2 text-destructive" disabled={actionLoading === task.id} onClick={onReject}>
            <XCircle className="h-2.5 w-2.5 mr-0.5" /> Reject
          </Button>
        </div>
      )}
      {canManage && task.status === "processing" && (
        <Button size="sm" variant="default" className="text-[10px] h-6 px-2" disabled={actionLoading === task.id} onClick={onComplete}>
          {actionLoading === task.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />} Done
        </Button>
      )}
    </div>
  );
}

function DetailItem({ label, value, isLink }: { label: string; value: string; isLink?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      {isLink ? (
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline break-all flex items-center gap-1">
          {value.length > 50 ? value.substring(0, 50) + "..." : value} <ExternalLink className="h-3 w-3 flex-shrink-0" />
        </a>
      ) : (
        <p className="text-sm font-medium break-words">{value}</p>
      )}
    </div>
  );
}
