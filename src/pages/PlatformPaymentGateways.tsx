import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Loader2, Pencil, Trash2, CheckCircle, XCircle, Beaker, CreditCard } from "lucide-react";
import { GatewayDialog, GATEWAY_DEFS, type GatewayRow } from "@/components/platform/GatewayDialog";

export default function PlatformPaymentGateways() {
  const [rows, setRows] = useState<GatewayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GatewayRow | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("platform_payment_gateways" as any)
      .select("*")
      .order("priority");
    if (error) toast.error(error.message);
    setRows((data || []) as any);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function toggleEnabled(row: GatewayRow, enabled: boolean) {
    const { error } = await supabase
      .from("platform_payment_gateways" as any)
      .update({ is_enabled: enabled })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success(enabled ? `${row.display_name} enabled` : `${row.display_name} disabled`);
    load();
  }

  async function remove(row: GatewayRow) {
    if (!confirm(`Delete ${row.display_name}? Existing transactions will keep working but no new payments can be initiated.`)) return;
    const { error } = await supabase
      .from("platform_payment_gateways" as any)
      .delete()
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Gateway removed");
    load();
  }

  async function test(row: GatewayRow) {
    setTestingId(row.id);
    try {
      const { data, error } = await supabase.functions.invoke("payment-gateway-test", {
        body: { gateway_id: row.id },
      });
      if (error) throw error;
      if (data?.ok) toast.success(`${row.display_name}: connection OK`);
      else toast.error(`${row.display_name}: ${data?.error || "Failed"}`);
      load();
    } catch (err: any) {
      toast.error(err.message || "Test failed");
    } finally {
      setTestingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payment Gateways"
        subtitle="Configure the providers your customers can pay with"
        actions={
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> Add Gateway
          </Button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-3">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
              <CreditCard className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No payment gateways yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Add at least one gateway (SSLCommerz, Stripe, etc.) so your tenants can pay subscription invoices.
            </p>
            <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-2 mt-2">
              <Plus className="h-4 w-4" /> Add Your First Gateway
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((row) => {
            const def = GATEWAY_DEFS[row.gateway];
            const Icon = def?.icon || CreditCard;
            return (
              <Card key={row.id} className={row.is_enabled ? "" : "opacity-70"}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{row.display_name}</CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant={row.mode === "live" ? "default" : "secondary"} className="text-[10px] uppercase">
                            {row.mode}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Priority {row.priority}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Switch
                      checked={row.is_enabled}
                      onCheckedChange={(v) => toggleEnabled(row, v)}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {row.supported_currencies.map((c) => (
                      <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                    ))}
                  </div>

                  {row.last_tested_at && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {row.last_test_status === "ok" ? (
                        <CheckCircle className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-destructive" />
                      )}
                      Last test: {new Date(row.last_tested_at).toLocaleString()}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => test(row)}
                      disabled={testingId === row.id}
                      className="gap-1.5"
                    >
                      {testingId === row.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Beaker className="h-3.5 w-3.5" />
                      )}
                      Test
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setEditing(row); setDialogOpen(true); }}
                      className="gap-1.5"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove(row)}
                      className="gap-1.5 text-destructive hover:text-destructive ml-auto"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <GatewayDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSaved={load}
      />
    </div>
  );
}
