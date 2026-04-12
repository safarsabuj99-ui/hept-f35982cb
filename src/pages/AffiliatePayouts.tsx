import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Wallet } from "lucide-react";

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  approved: "default",
  paid: "outline",
  rejected: "destructive",
};

export default function AffiliatePayouts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [affiliate, setAffiliate] = useState<any>(null);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [availableBalance, setAvailableBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [requestAmount, setRequestAmount] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    const { data: aff } = await supabase.from("affiliates").select("*").eq("user_id", user!.id).single();
    if (!aff) { setLoading(false); return; }
    setAffiliate(aff);

    // Calculate available balance: total qualified commissions - total paid/approved payouts
    const { data: conversions } = await supabase.from("affiliate_conversions")
      .select("commission_bdt, status").eq("affiliate_id", aff.id).in("status", ["qualified", "paid"]);
    const totalEarned = conversions?.reduce((s, c) => s + Number(c.commission_bdt || 0), 0) || 0;

    const { data: payoutData } = await supabase.from("affiliate_payouts")
      .select("*").eq("affiliate_id", aff.id).order("requested_at", { ascending: false });
    const totalPaidOut = payoutData?.filter(p => ["approved", "paid"].includes(p.status)).reduce((s, p) => s + Number(p.amount_bdt || 0), 0) || 0;
    const totalPending = payoutData?.filter(p => p.status === "pending").reduce((s, p) => s + Number(p.amount_bdt || 0), 0) || 0;

    setAvailableBalance(totalEarned - totalPaidOut - totalPending);
    setPayouts(payoutData || []);
    setLoading(false);
  };

  const handleRequest = async () => {
    if (!affiliate) return;
    const amount = Number(requestAmount);
    if (!amount || amount <= 0 || amount > availableBalance) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }
    setRequesting(true);
    const { error } = await supabase.from("affiliate_payouts").insert({
      affiliate_id: affiliate.id,
      amount_bdt: amount,
      payment_method: affiliate.payment_method,
      payment_details: affiliate.payment_details,
    });
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Payout requested!" });
      setRequestAmount("");
      setDialogOpen(false);
      loadData();
    }
    setRequesting(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Payouts" subtitle="Request withdrawals and track payout history" actions={
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={availableBalance <= 0}><Wallet className="h-4 w-4 mr-1" /> Request Payout</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Request Payout</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Available balance: <span className="font-bold text-foreground">৳{availableBalance.toLocaleString()}</span></p>
              <div className="space-y-2">
                <Label>Amount (BDT)</Label>
                <Input type="number" value={requestAmount} onChange={(e) => setRequestAmount(e.target.value)} placeholder="Enter amount" max={availableBalance} />
              </div>
              <p className="text-xs text-muted-foreground">
                Payment via: <span className="font-medium capitalize">{affiliate?.payment_method}</span>
              </p>
              <Button onClick={handleRequest} disabled={requesting} className="w-full">
                {requesting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Submit Request
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      } />
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Available</p><p className="text-xl font-bold text-emerald-600">৳{availableBalance.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total Paid</p><p className="text-xl font-bold">৳{Number(affiliate?.total_paid_bdt || 0).toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total Earned</p><p className="text-xl font-bold">৳{Number(affiliate?.total_earnings_bdt || 0).toLocaleString()}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payouts.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No payout requests yet</TableCell></TableRow>
              ) : payouts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{new Date(p.requested_at).toLocaleDateString()}</TableCell>
                  <TableCell className="font-semibold">৳{Number(p.amount_bdt).toLocaleString()}</TableCell>
                  <TableCell className="capitalize">{p.payment_method || "—"}</TableCell>
                  <TableCell><Badge variant={statusColors[p.status] || "secondary"} className="capitalize">{p.status}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.admin_note || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
