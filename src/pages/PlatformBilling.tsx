import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

export default function PlatformBilling() {
  const [subs, setSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("organization_subscriptions")
        .select("*, organizations(name)")
        .order("created_at", { ascending: false });
      setSubs(data ?? []);
      setLoading(false);
    };
    fetch();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const statusColor: Record<string, string> = {
    paid: "bg-success/10 text-success",
    pending: "bg-warning/10 text-warning",
    overdue: "bg-destructive/10 text-destructive",
    cancelled: "bg-muted text-muted-foreground",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Billing</h1>
        <p className="text-sm text-muted-foreground">Subscription payments across all agencies</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agency</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Amount (BDT)</TableHead>
                <TableHead>Cycle</TableHead>
                <TableHead>Period End</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subs.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{(s.organizations as any)?.name ?? "—"}</TableCell>
                  <TableCell className="capitalize">{s.plan}</TableCell>
                  <TableCell>৳{s.amount_bdt.toLocaleString()}</TableCell>
                  <TableCell className="capitalize">{s.billing_cycle}</TableCell>
                  <TableCell>{new Date(s.current_period_end).toLocaleDateString()}</TableCell>
                  <TableCell><Badge className={statusColor[s.payment_status] ?? ""}>{s.payment_status}</Badge></TableCell>
                </TableRow>
              ))}
              {subs.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No subscriptions yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
