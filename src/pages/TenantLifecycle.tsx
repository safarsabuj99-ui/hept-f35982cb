import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Building2, Clock, AlertTriangle, XCircle, CheckCircle, ArrowRight } from "lucide-react";

type OrgStatus = "trial" | "active" | "suspended" | "cancelled";

interface Org {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: OrgStatus;
  created_at: string;
  trial_ends_at: string | null;
  grace_period_days: number;
  status_changed_at: string;
  suspension_reason: string | null;
  max_clients: number;
  max_ad_accounts: number;
  max_managers: number;
}

const STATUS_COLUMNS: { key: OrgStatus; label: string; icon: React.ReactNode; color: string }[] = [
  { key: "trial", label: "Trial", icon: <Clock className="h-4 w-4" />, color: "text-blue-500" },
  { key: "active", label: "Active", icon: <CheckCircle className="h-4 w-4" />, color: "text-emerald-500" },
  { key: "suspended", label: "Suspended", icon: <AlertTriangle className="h-4 w-4" />, color: "text-amber-500" },
  { key: "cancelled", label: "Cancelled", icon: <XCircle className="h-4 w-4" />, color: "text-destructive" },
];

function daysAgo(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function daysUntil(dateStr: string | null) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export default function TenantLifecycle() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ org: Org; targetStatus: OrgStatus } | null>(null);
  const [reason, setReason] = useState("");
  const navigate = useNavigate();
  const { toast } = useToast();

  const fetchOrgs = async () => {
    const { data } = await supabase.from("organizations").select("*").order("created_at", { ascending: false });
    setOrgs((data as any[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchOrgs(); }, []);

  const grouped = STATUS_COLUMNS.map((col) => ({
    ...col,
    orgs: orgs.filter((o) => o.status === col.key),
  }));

  const handleTransition = async () => {
    if (!confirmDialog) return;
    setTransitioning(confirmDialog.org.id);
    const update: any = {
      status: confirmDialog.targetStatus,
      status_changed_at: new Date().toISOString(),
    };
    if (confirmDialog.targetStatus === "suspended" || confirmDialog.targetStatus === "cancelled") {
      update.suspension_reason = reason || null;
    }
    if (confirmDialog.targetStatus === "active") {
      update.suspension_reason = null;
    }
    const { error } = await supabase.from("organizations").update(update).eq("id", confirmDialog.org.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Agency moved to ${confirmDialog.targetStatus}` });
    }
    setTransitioning(null);
    setConfirmDialog(null);
    setReason("");
    fetchOrgs();
  };

  const getNextStatuses = (current: OrgStatus): OrgStatus[] => {
    switch (current) {
      case "trial": return ["active", "suspended"];
      case "active": return ["suspended", "cancelled"];
      case "suspended": return ["active", "cancelled"];
      case "cancelled": return ["active"];
      default: return [];
    }
  };

  const planBadgeVariant = (plan: string) => {
    if (plan === "agency_pro") return "default";
    if (plan === "growth") return "secondary";
    return "outline";
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tenant Lifecycle</h1>
        <p className="text-sm text-muted-foreground">Visual pipeline of agency states with transition controls</p>
      </div>

      {/* Summary KPIs */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {grouped.map((col) => (
          <Card key={col.key}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={col.color}>{col.icon}</div>
              <div>
                <p className="text-2xl font-bold text-foreground">{col.orgs.length}</p>
                <p className="text-xs text-muted-foreground">{col.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Kanban Columns */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
        {grouped.map((col) => (
          <div key={col.key} className="space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-border">
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
                  <Card key={org.id} className="cursor-pointer hover:shadow-md transition-shadow">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between">
                        <button
                          onClick={() => navigate(`/platform/agencies/${org.id}`)}
                          className="text-sm font-semibold text-foreground hover:text-primary text-left truncate max-w-[70%]"
                        >
                          {org.name}
                        </button>
                        <Badge variant={planBadgeVariant(org.plan)} className="text-[10px] shrink-0">
                          {org.plan}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Building2 className="h-3 w-3" />
                        <span>{daysInState}d in state</span>
                        {trialDaysLeft !== null && (
                          <span className={`ml-auto font-medium ${trialDaysLeft <= 3 ? "text-destructive" : trialDaysLeft <= 7 ? "text-amber-500" : "text-muted-foreground"}`}>
                            {trialDaysLeft > 0 ? `${trialDaysLeft}d left` : "Expired"}
                          </span>
                        )}
                      </div>

                      {org.suspension_reason && (
                        <p className="text-xs text-destructive/80 truncate">{org.suspension_reason}</p>
                      )}

                      <div className="flex gap-1 pt-1">
                        {nextStatuses.map((target) => {
                          const targetCol = STATUS_COLUMNS.find((c) => c.key === target)!;
                          return (
                            <Button
                              key={target}
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] px-2 gap-1"
                              onClick={(e) => { e.stopPropagation(); setConfirmDialog({ org, targetStatus: target }); }}
                            >
                              <ArrowRight className="h-3 w-3" />
                              {targetCol.label}
                            </Button>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {col.orgs.length === 0 && (
                <div className="text-center text-xs text-muted-foreground py-8 border border-dashed border-border rounded-lg">
                  No agencies
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Confirm Transition Dialog */}
      <Dialog open={!!confirmDialog} onOpenChange={(o) => !o && setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Move "{confirmDialog?.org.name}" to {confirmDialog?.targetStatus}?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">{confirmDialog?.org.status}</Badge>
              <ArrowRight className="h-4 w-4" />
              <Badge>{confirmDialog?.targetStatus}</Badge>
            </div>

            {(confirmDialog?.targetStatus === "suspended" || confirmDialog?.targetStatus === "cancelled") && (
              <div>
                <Label>Reason (optional)</Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Non-payment, Trial expired..."
                  rows={2}
                />
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmDialog(null)}>Cancel</Button>
              <Button
                className="flex-1"
                variant={confirmDialog?.targetStatus === "cancelled" ? "destructive" : "default"}
                onClick={handleTransition}
                disabled={!!transitioning}
              >
                {transitioning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
