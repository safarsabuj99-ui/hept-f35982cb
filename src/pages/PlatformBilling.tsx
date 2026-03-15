import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, CheckCircle, Download } from "lucide-react";

interface Invoice {
  id: string;
  org_id: string;
  invoice_number: string;
  amount_bdt: number;
  period_start: string;
  period_end: string;
  status: string;
  payment_date: string | null;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
  org_name?: string;
}

export default function PlatformBilling() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [recordingInvoice, setRecordingInvoice] = useState<Invoice | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("Bank");
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [newInvoice, setNewInvoice] = useState({ org_id: "", amount_bdt: 0, period_start: "", period_end: "" });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchData = async () => {
    const [{ data: invData }, { data: orgData }] = await Promise.all([
      supabase.from("platform_invoices" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("organizations").select("id, name"),
    ]);
    const orgMap = new Map((orgData ?? []).map((o) => [o.id, o.name]));
    setInvoices(((invData as any[]) ?? []).map((inv: any) => ({ ...inv, org_name: orgMap.get(inv.org_id) || "Unknown" })));
    setOrgs(orgData ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = statusFilter === "all" ? invoices : invoices.filter((i) => i.status === statusFilter);

  const totalCollected = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount_bdt, 0);
  const totalOutstanding = invoices.filter((i) => ["draft", "sent"].includes(i.status)).reduce((s, i) => s + i.amount_bdt, 0);
  const overdueCount = invoices.filter((i) => i.status === "overdue").length;

  const recordPayment = async () => {
    if (!recordingInvoice) return;
    setSaving(true);
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from("platform_invoices" as any).update({ status: "paid", payment_date: today, payment_method: paymentMethod } as any).eq("id", recordingInvoice.id);
    toast({ title: "Payment recorded" });
    setSaving(false);
    setRecordingInvoice(null);
    fetchData();
  };

  const createInvoice = async () => {
    setSaving(true);
    const invNum = `INV-${new Date().getFullYear()}-${String(invoices.length + 1).padStart(3, "0")}`;
    const { error } = await supabase.from("platform_invoices" as any).insert({
      ...newInvoice, invoice_number: invNum, status: "draft",
    } as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Invoice created" }); }
    setSaving(false);
    setCreatingInvoice(false);
    fetchData();
  };

  const autoGenerate = async () => {
    const { data: subs } = await supabase.from("organization_subscriptions").select("*").eq("payment_status", "paid");
    if (!subs?.length) { toast({ title: "No active subscriptions to invoice" }); return; }
    setSaving(true);
    let count = 0;
    for (const sub of subs) {
      const periodStart = sub.current_period_end;
      const periodEnd = sub.billing_cycle === "yearly"
        ? new Date(new Date(periodStart).setFullYear(new Date(periodStart).getFullYear() + 1)).toISOString().slice(0, 10)
        : new Date(new Date(periodStart).setMonth(new Date(periodStart).getMonth() + 1)).toISOString().slice(0, 10);
      const invNum = `INV-${new Date().getFullYear()}-${String(invoices.length + count + 1).padStart(3, "0")}`;
      await supabase.from("platform_invoices" as any).insert({
        org_id: sub.org_id, invoice_number: invNum, amount_bdt: sub.amount_bdt,
        period_start: periodStart, period_end: periodEnd, status: "sent",
      } as any);
      count++;
    }
    toast({ title: `${count} invoice(s) generated` });
    setSaving(false);
    fetchData();
  };

  const exportCSV = () => {
    const headers = ["Invoice #", "Agency", "Amount (BDT)", "Period Start", "Period End", "Status", "Payment Date", "Payment Method"];
    const rows = filtered.map((i) => [i.invoice_number, i.org_name, i.amount_bdt, i.period_start, i.period_end, i.status, i.payment_date || "", i.payment_method || ""]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = { draft: "secondary", sent: "outline", paid: "default", overdue: "destructive", void: "secondary" };
    return <Badge variant={map[status] as any || "secondary"}>{status}</Badge>;
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Revenue & Invoicing</h1>
          <p className="text-sm text-muted-foreground">Manage platform billing and payments</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={autoGenerate} disabled={saving}>Auto-Generate</Button>
          <Button onClick={() => setCreatingInvoice(true)} className="gap-2"><Plus className="h-4 w-4" /> New Invoice</Button>
        </div>
      </div>

      {/* Revenue Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Collected</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-success">৳{totalCollected.toLocaleString()}</p></CardContent>
        </Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Outstanding</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-warning">৳{totalOutstanding.toLocaleString()}</p></CardContent>
        </Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Overdue</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-destructive">{overdueCount}</p></CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="void">Void</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2 ml-auto"><Download className="h-4 w-4" /> Export CSV</Button>
      </div>

      {/* Invoice Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Agency</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Paid On</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-sm">{inv.invoice_number}</TableCell>
                  <TableCell>{inv.org_name}</TableCell>
                  <TableCell className="font-medium">৳{inv.amount_bdt.toLocaleString()}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{inv.period_start} → {inv.period_end}</TableCell>
                  <TableCell>{statusBadge(inv.status)}</TableCell>
                  <TableCell className="text-sm">{inv.payment_date || "—"}</TableCell>
                  <TableCell>
                    {inv.status !== "paid" && inv.status !== "void" && (
                      <Button variant="ghost" size="sm" onClick={() => { setRecordingInvoice(inv); setPaymentMethod("Bank"); }}>
                        <CheckCircle className="h-4 w-4 mr-1" /> Record
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No invoices found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Record Payment Dialog */}
      <Dialog open={!!recordingInvoice} onOpenChange={(o) => !o && setRecordingInvoice(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Payment — {recordingInvoice?.invoice_number}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-foreground">Amount: <strong>৳{recordingInvoice?.amount_bdt.toLocaleString()}</strong></p>
            <div><Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Bank">Bank Transfer</SelectItem>
                  <SelectItem value="bKash">bKash</SelectItem>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Nagad">Nagad</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={recordPayment} disabled={saving} className="w-full">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirm Payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Invoice Dialog */}
      <Dialog open={creatingInvoice} onOpenChange={(o) => !o && setCreatingInvoice(false)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Invoice</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Agency</Label>
              <Select value={newInvoice.org_id} onValueChange={(v) => setNewInvoice({ ...newInvoice, org_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select agency" /></SelectTrigger>
                <SelectContent>{orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Amount (BDT)</Label><Input type="number" value={newInvoice.amount_bdt} onChange={(e) => setNewInvoice({ ...newInvoice, amount_bdt: +e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Period Start</Label><Input type="date" value={newInvoice.period_start} onChange={(e) => setNewInvoice({ ...newInvoice, period_start: e.target.value })} /></div>
              <div><Label>Period End</Label><Input type="date" value={newInvoice.period_end} onChange={(e) => setNewInvoice({ ...newInvoice, period_end: e.target.value })} /></div>
            </div>
            <Button onClick={createInvoice} disabled={saving || !newInvoice.org_id} className="w-full">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create Invoice
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
