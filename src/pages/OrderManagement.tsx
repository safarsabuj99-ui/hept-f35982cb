import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Play, CheckCircle2, XCircle, Eye, Megaphone, ExternalLink } from "lucide-react";
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

export default function OrderManagement() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canManageCampaigns = hasPermission("can_manage_campaigns");

  const [requests, setRequests] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [tab, setTab] = useState("pending");

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const fetchAll = useCallback(async () => {
    const [{ data: reqs }, { data: profs }] = await Promise.all([
      supabase.from("campaign_requests" as any).select("*").order("created_at", { ascending: false }) as any,
      supabase.from("profiles").select("user_id, full_name, business_name, email"),
    ]);
    setRequests(reqs ?? []);
    const profileMap: Record<string, any> = {};
    (profs ?? []).forEach((p: any) => { profileMap[p.user_id] = p; });
    setProfiles(profileMap);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const channel = supabase
      .channel("admin-campaign-requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_requests" }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);

  const updateStatus = async (id: string, status: string, rejectionReason?: string) => {
    setActionLoading(id);
    const update: any = { status };
    if (rejectionReason) update.rejection_reason = rejectionReason;
    const { error } = await (supabase.from("campaign_requests" as any).update(update).eq("id", id) as any);
    setActionLoading(null);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      const labels: Record<string, string> = { processing: "Started processing", completed: "Marked as completed", rejected: "Request rejected" };
      toast({ title: labels[status] || "Updated", description: `Campaign request status → ${status}` });
      fetchAll();
    }
  };

  const handleReject = () => {
    if (!rejectId || !rejectReason.trim()) return;
    updateStatus(rejectId, "rejected", rejectReason.trim());
    setRejectOpen(false);
    setRejectReason("");
    setRejectId(null);
  };

  useEffect(() => { setCurrentPage(1); }, [tab]);

  const filtered = requests.filter((r: any) => {
    if (tab === "all") return true;
    return r.status === tab;
  });

  const paginatedFiltered = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const counts = {
    pending: requests.filter((r: any) => r.status === "pending").length,
    processing: requests.filter((r: any) => r.status === "processing").length,
    completed: requests.filter((r: any) => r.status === "completed").length,
    rejected: requests.filter((r: any) => r.status === "rejected").length,
  };

  if (loading) return <DataPageSkeleton />;

  return (
    <div className="space-y-6">
      <div className="animate-slide-up-fade">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
          <Megaphone className="h-5 w-5 sm:h-6 sm:w-6 text-primary" /> Order Management
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

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">Pending ({counts.pending})</TabsTrigger>
          <TabsTrigger value="processing">Processing ({counts.processing})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({counts.completed})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({counts.rejected})</TabsTrigger>
          <TabsTrigger value="all">All ({requests.length})</TabsTrigger>
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
                    return (
                      <div key={r.id} className="rounded-xl border bg-card p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-sm">{client?.full_name || "Unknown"}</p>
                            {client?.business_name && <p className="text-xs text-muted-foreground">{client.business_name}</p>}
                          </div>
                          <Badge variant="outline" className={cn("text-xs shrink-0", badge.className)}>{badge.label}</Badge>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary">{PLATFORM_LABELS[r.platform] || r.platform}</Badge>
                          <span className="text-xs text-muted-foreground">{r.objective}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                          <span className="font-mono font-semibold text-sm">${Number(r.budget_usd).toFixed(2)}</span>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => { setSelectedRequest(r); setDetailOpen(true); }}>
                            <Eye className="h-3.5 w-3.5 mr-1" /> Details
                          </Button>
                          {canManageCampaigns && r.status === "pending" && (
                            <>
                              <Button size="sm" variant="default" className="flex-1 text-xs" disabled={actionLoading === r.id} onClick={() => updateStatus(r.id, "processing")}>
                                {actionLoading === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1" />} Start
                              </Button>
                              <Button size="sm" variant="destructive" className="text-xs" onClick={() => { setRejectId(r.id); setRejectOpen(true); }}>
                                <XCircle className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          {canManageCampaigns && r.status === "processing" && (
                            <Button size="sm" variant="default" className="flex-1 text-xs" disabled={actionLoading === r.id} onClick={() => updateStatus(r.id, "completed")}>
                              {actionLoading === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />} Complete
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[11px] uppercase tracking-widest text-muted-foreground/60">Client</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-widest text-muted-foreground/60">Platform</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-widest text-muted-foreground/60">Objective</TableHead>
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
                        return (
                          <TableRow key={r.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm">{client?.full_name || "Unknown"}</p>
                                <p className="text-xs text-muted-foreground">{client?.business_name || ""}</p>
                              </div>
                            </TableCell>
                            <TableCell><Badge variant="secondary">{PLATFORM_LABELS[r.platform] || r.platform}</Badge></TableCell>
                            <TableCell className="text-sm">{r.objective}</TableCell>
                            <TableCell className="text-right font-mono">${Number(r.budget_usd).toFixed(2)}</TableCell>
                            <TableCell><Badge variant="outline" className={badge.className}>{badge.label}</Badge></TableCell>
                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                              {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center gap-1 justify-end">
                                <Button size="sm" variant="ghost" onClick={() => { setSelectedRequest(r); setDetailOpen(true); }}>
                                  <Eye className="h-4 w-4" />
                                </Button>
                                {canManageCampaigns && r.status === "pending" && (
                                  <>
                                    <Button size="sm" variant="outline" disabled={actionLoading === r.id} onClick={() => updateStatus(r.id, "processing")}>
                                      {actionLoading === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                                    </Button>
                                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setRejectId(r.id); setRejectOpen(true); }}>
                                      <XCircle className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                )}
                                {canManageCampaigns && r.status === "processing" && (
                                  <Button size="sm" variant="default" disabled={actionLoading === r.id} onClick={() => updateStatus(r.id, "completed")}>
                                    {actionLoading === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                                    Complete
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <TablePagination
                  totalItems={filtered.length}
                  pageSize={pageSize}
                  currentPage={currentPage}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={setPageSize}
                />
              </>
            )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detail Modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Campaign Request Details</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{PLATFORM_LABELS[selectedRequest.platform] || selectedRequest.platform}</Badge>
                <Badge variant="outline" className={STATUS_BADGE[selectedRequest.status]?.className}>{STATUS_BADGE[selectedRequest.status]?.label}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <DetailItem label="Client" value={profiles[selectedRequest.client_id]?.full_name || "Unknown"} />
                <DetailItem label="Objective" value={selectedRequest.objective} />
                <DetailItem label="Budget" value={`$${Number(selectedRequest.budget_usd).toFixed(2)}`} />
                <DetailItem label="Duration" value={`${selectedRequest.duration_days} days`} />
                <DetailItem label="Start Date" value={selectedRequest.start_date} />
                <DetailItem label="Submitted" value={new Date(selectedRequest.created_at).toLocaleDateString()} />
              </div>
              <DetailItem label="Creative Link" value={selectedRequest.creative_link} isLink />
              {selectedRequest.landing_page_url && <DetailItem label="Landing Page" value={selectedRequest.landing_page_url} isLink />}
              {selectedRequest.ad_caption && <DetailItem label="Ad Caption" value={selectedRequest.ad_caption} />}
              {selectedRequest.target_audience_note && <DetailItem label="Target Audience" value={selectedRequest.target_audience_note} />}
              {selectedRequest.rejection_reason && (
                <div className="rounded-lg bg-destructive/10 p-3 border border-destructive/20">
                  <p className="text-xs text-destructive font-medium mb-0.5">Rejection Reason</p>
                  <p className="text-sm">{selectedRequest.rejection_reason}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Modal */}
      <Dialog open={rejectOpen} onOpenChange={(o) => { setRejectOpen(o); if (!o) { setRejectReason(""); setRejectId(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Campaign Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Reason for rejection *</Label>
            <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Explain why this request is being rejected..." rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectOpen(false); setRejectReason(""); setRejectId(null); }}>Cancel</Button>
            <Button variant="destructive" disabled={!rejectReason.trim() || actionLoading === rejectId} onClick={handleReject}>
              {actionLoading === rejectId && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reject Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
