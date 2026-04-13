import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Building2, Clock, AlertTriangle, XCircle, CheckCircle, ArrowRight, GitBranch, Loader2, Timer, RefreshCw, Check } from "lucide-react";

type OrgStatus = "trial" | "active" | "suspended" | "cancelled";
interface Org { id: string; name: string; slug: string; plan: string; status: OrgStatus; created_at: string; trial_ends_at: string | null; grace_period_days: number; status_changed_at: string; suspension_reason: string | null; max_clients: number; max_ad_accounts: number; max_managers: number; }

const STATUS_COLUMNS: { key: OrgStatus; label: string; icon: React.ReactNode; iconComp: any; color: string; borderColor: string }[] = [
  { key: "trial", label: "Trial", icon: <Clock className="h-4 w-4" />, iconComp: Clock, color: "text-blue-400", borderColor: "border-t-blue-500" },
  { key: "active", label: "Active", icon: <CheckCircle className="h-4 w-4" />, iconComp: CheckCircle, color: "text-success", borderColor: "border-t-success" },
  { key: "suspended", label: "Suspended", icon: <AlertTriangle className="h-4 w-4" />, iconComp: AlertTriangle, color: "text-warning", borderColor: "border-t-warning" },
  { key: "cancelled", label: "Cancelled", icon: <XCircle className="h-4 w-4" />, iconComp: XCircle, color: "text-destructive", borderColor: "border-t-destructive" },
];

function daysAgo(dateStr: string) { return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000); }
function daysUntil(dateStr: string | null) { if (!dateStr) return null; return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000); }

export default function TenantLifecycle() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ org: Org; targetStatus: OrgStatus } | null>(null);
  const [reason, setReason] = useState("");
  const [trialFilter, setTrialFilter] = useState<"all" | "expiring_soon" | "expired">("all");
  const navigate = useNavigate();
  const { toast } = useToast();

  const fetchOrgs = async () => { const { data } = await supabase.from("organizations").select("*").order("created_at", { ascending: false }); setOrgs((data as any[]) ?? []); setLoading(false); };
  useEffect(() => { fetchOrgs(); }, []);

  const grouped = STATUS_COLUMNS.map((col) => ({ ...col, orgs: orgs.filter((o) => o.status === col.key) }));

  const handleTransition = async () => {
    if (!confirmDialog) return;
    setTransitioning(confirmDialog.org.id);
    const update: any = { status: confirmDialog.targetStatus, status_changed_at: new Date().toISOString() };
    if (confirmDialog.targetStatus === "suspended" || confirmDialog.targetStatus === "cancelled") update.suspension_reason = reason || null;
    if (confirmDialog.targetStatus === "active") update.suspension_reason = null;
    const { error } = await supabase.from("organizations").update(update).eq("id", confirmDialog.org.id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else toast({ title: `Agency moved to ${confirmDialog.targetStatus}` });
    setTransitioning(null); setConfirmDialog(null); setReason(""); fetchOrgs();
  };

  const getNextStatuses = (current: OrgStatus): OrgStatus[] => {
    switch (current) { case "trial": return ["active", "suspended"]; case "active": return ["suspended", "cancelled"]; case "suspended": return ["active", "cancelled"]; case "cancelled": return ["active"]; default: return []; }
  };

  const accentColors = ["hsl(214, 80%, 52%)", "hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--destructive))"];

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-3 grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      <div className="grid gap-4 grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}</div>
    </div>
  );

  return (
    <div className="space-y-8">
      <PageHeader title="Tenant Lifecycle" subtitle="Visual pipeline of agency states with transition controls" icon={<GitBranch className="h-6 w-6 text-primary" />} />

      <div>
        <p className="section-label mb-3">Status Overview</p>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          {grouped.map((col, i) => <KpiCard key={col.key} title={col.label} value={String(col.orgs.length)} icon={col.iconComp} accentColor={accentColors[i]} staggerIndex={i} />)}
        </div>
      </div>

      <div>
        <p className="section-label mb-3">Pipeline</p>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
          {grouped.map((col, colIdx) => (
            <div key={col.key} className="space-y-3 animate-slide-up-fade" style={{ animationDelay: `${colIdx * 100}ms`, animationFillMode: "forwards" }}>
              <div className={`flex items-center gap-2 pb-2 border-b-2 ${col.borderColor}`}>
                <span className={col.color}>{col.icon}</span>
                <h3 className="font-semibold text-foreground">{col.label}</h3>
                <Badge variant="secondary" className="ml-auto">{col.orgs.length}</Badge>
              </div>

              <div className="space-y-2 min-h-[200px]">
                {col.orgs.map((org) => {
                  const trialDaysLeft = org.status === "trial" ? daysUntil(org.trial_ends_at) : null;
                  const daysInState = daysAgo(org.status_changed_at);
                  const nextStatuses = getNextStatuses(org.status);
                  return (
                    <div key={org.id} className="glass-card glow-border">
                      <Card className="border-0 bg-transparent shadow-none">
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-start justify-between">
                            <button onClick={() => navigate(`/platform/agencies/${org.id}`)} className="text-sm font-semibold text-foreground hover:text-primary text-left truncate max-w-[70%] transition-colors">{org.name}</button>
                            <Badge variant="outline" className="text-[10px] shrink-0 capitalize">{org.plan}</Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Building2 className="h-3 w-3" />
                            <span>{daysInState}d in state</span>
                            {trialDaysLeft !== null && (
                              <span className={`ml-auto font-medium ${trialDaysLeft <= 3 ? "text-destructive" : trialDaysLeft <= 7 ? "text-warning" : "text-muted-foreground"}`}>
                                {trialDaysLeft > 0 ? `${trialDaysLeft}d left` : "Expired"}
                              </span>
                            )}
                          </div>
                          {org.suspension_reason && <p className="text-xs text-destructive/80 truncate">{org.suspension_reason}</p>}
                          <div className="flex gap-1 pt-1">
                            {nextStatuses.map((target) => {
                              const targetCol = STATUS_COLUMNS.find((c) => c.key === target)!;
                              return (
                                <Button key={target} variant="ghost" size="sm" className="h-6 text-[10px] px-2 gap-1 press-effect" onClick={(e) => { e.stopPropagation(); setConfirmDialog({ org, targetStatus: target }); }}>
                                  <ArrowRight className="h-3 w-3" />{targetCol.label}
                                </Button>
                              );
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })}
                {col.orgs.length === 0 && <div className="text-center text-xs text-muted-foreground py-8 border border-dashed border-border/40 rounded-xl">No agencies</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={!!confirmDialog} onOpenChange={(o) => !o && setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Move "{confirmDialog?.org.name}" to {confirmDialog?.targetStatus}?</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">{confirmDialog?.org.status}</Badge>
              <ArrowRight className="h-4 w-4" /><Badge>{confirmDialog?.targetStatus}</Badge>
            </div>
            {(confirmDialog?.targetStatus === "suspended" || confirmDialog?.targetStatus === "cancelled") && (
              <div><Label>Reason (optional)</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Non-payment, Trial expired..." rows={2} /></div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmDialog(null)}>Cancel</Button>
              <Button className="flex-1" variant={confirmDialog?.targetStatus === "cancelled" ? "destructive" : "default"} onClick={handleTransition} disabled={!!transitioning}>
                {transitioning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
