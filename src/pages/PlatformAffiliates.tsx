import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, Edit, Loader2, Users, Wallet } from "lucide-react";

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary", active: "default", suspended: "destructive",
  qualified: "default", paid: "outline", rejected: "destructive",
  approved: "default",
};

export default function PlatformAffiliates() {
  const { toast } = useToast();
  const [affiliates, setAffiliates] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editAffiliate, setEditAffiliate] = useState<any>(null);
  const [editRate, setEditRate] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [{ data: affs }, { data: pays }] = await Promise.all([
      supabase.from("affiliates").select("*").order("created_at", { ascending: false }),
      supabase.from("affiliate_payouts").select("*, affiliates(full_name, email)").order("requested_at", { ascending: false }),
    ]);
    setAffiliates(affs || []);
    setPayouts(pays || []);
    setLoading(false);
  };

  const openEdit = (aff: any) => {
    setEditAffiliate(aff);
    setEditRate(String(aff.commission_rate));
    setEditStatus(aff.status);
  };

  const saveEdit = async () => {
    if (!editAffiliate) return;
    setSaving(true);
    const { error } = await supabase.from("affiliates").update({
      commission_rate: Number(editRate) || 10,
      status: editStatus,
    }).eq("id", editAffiliate.id);

    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Updated!" }); setEditAffiliate(null); loadData(); }
    setSaving(false);
  };

  const handlePayoutAction = async (payoutId: string, action: "approved" | "rejected", note?: string) => {
    const { error } = await supabase.from("affiliate_payouts").update({
      status: action, admin_note: note || null, processed_at: new Date().toISOString(),
    }).eq("id", payoutId);

    if (!error && action === "approved") {
      // Update affiliate total_paid_bdt
      const payout = payouts.find(p => p.id === payoutId);
      if (payout) {
        const aff = affiliates.find(a => a.id === payout.affiliate_id);
        if (aff) {
          await supabase.from("affiliates").update({
            total_paid_bdt: Number(aff.total_paid_bdt || 0) + Number(payout.amount_bdt),
          }).eq("id", aff.id);
        }
      }
    }

    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else { toast({ title: `Payout ${action}!` }); loadData(); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  const totalAffiliates = affiliates.length;
  const activeAffiliates = affiliates.filter(a => a.status === "active").length;
  const totalCommissions = affiliates.reduce((s, a) => s + Number(a.total_earnings_bdt || 0), 0);
  const pendingPayouts = payouts.filter(p => p.status === "pending").length;

  return (
    <div className="space-y-6">
      <PageHeader title="Affiliate Management" subtitle="Manage affiliates, set commission rates, and approve payouts" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><div className="flex items-center gap-2 mb-1"><Users className="h-4 w-4 text-blue-500" /><span className="text-xs text-muted-foreground">Total Affiliates</span></div><p className="text-xl font-bold">{totalAffiliates}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="flex items-center gap-2 mb-1"><Users className="h-4 w-4 text-emerald-500" /><span className="text-xs text-muted-foreground">Active</span></div><p className="text-xl font-bold">{activeAffiliates}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="flex items-center gap-2 mb-1"><DollarSign className="h-4 w-4 text-amber-500" /><span className="text-xs text-muted-foreground">Total Commissions</span></div><p className="text-xl font-bold">৳{totalCommissions.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="flex items-center gap-2 mb-1"><Wallet className="h-4 w-4 text-rose-500" /><span className="text-xs text-muted-foreground">Pending Payouts</span></div><p className="text-xl font-bold">{pendingPayouts}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="affiliates">
        <TabsList>
          <TabsTrigger value="affiliates">Affiliates</TabsTrigger>
          <TabsTrigger value="payouts">Payouts {pendingPayouts > 0 && <Badge variant="destructive" className="ml-1 text-[10px] h-5">{pendingPayouts}</Badge>}</TabsTrigger>
        </TabsList>

        <TabsContent value="affiliates">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-center">Rate</TableHead>
                    <TableHead className="text-center">Earned</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {affiliates.map((aff) => (
                    <TableRow key={aff.id}>
                      <TableCell className="font-medium">{aff.full_name}</TableCell>
                      <TableCell className="text-muted-foreground">{aff.email}</TableCell>
                      <TableCell className="text-center">{aff.commission_rate}%</TableCell>
                      <TableCell className="text-center font-semibold">৳{Number(aff.total_earnings_bdt || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-center"><Badge variant={statusColors[aff.status] || "secondary"} className="capitalize">{aff.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(aff)}><Edit className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payouts">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Affiliate</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{(p as any).affiliates?.full_name || "—"}</TableCell>
                      <TableCell className="font-semibold">৳{Number(p.amount_bdt).toLocaleString()}</TableCell>
                      <TableCell className="capitalize">{p.payment_method || "—"}</TableCell>
                      <TableCell>{new Date(p.requested_at).toLocaleDateString()}</TableCell>
                      <TableCell><Badge variant={statusColors[p.status] || "secondary"} className="capitalize">{p.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        {p.status === "pending" && (
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="default" onClick={() => handlePayoutAction(p.id, "approved")}>Approve</Button>
                            <Button size="sm" variant="destructive" onClick={() => handlePayoutAction(p.id, "rejected")}>Reject</Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Affiliate Dialog */}
      <Dialog open={!!editAffiliate} onOpenChange={(open) => !open && setEditAffiliate(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Affiliate: {editAffiliate?.full_name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Commission Rate (%)</Label>
              <Input type="number" value={editRate} onChange={(e) => setEditRate(e.target.value)} min={0} max={100} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={saveEdit} disabled={saving} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
