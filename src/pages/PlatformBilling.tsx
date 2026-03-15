import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, CheckCircle, Download, Clock, AlertTriangle } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

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
  due_date: string | null;
  org_name?: string;
}

function daysSince(dateStr: string | null) {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export default function PlatformBilling() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [recordingInvoice, setRecordingInvoice] = useState<Invoice | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("Bank");
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [newInvoice, setNewInvoice] = useState({ org_id: "", amount_bdt: 0, period_start: "", period_end: "", due_date: "" });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("invoices");
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

  // Aging bucket calculations
  const agingBuckets = useMemo(() => {
    const unpaid = invoices.filter((i) => ["draft", "sent", "overdue"].includes(i.status));
    const current: Invoice[] = [];
    const days30: Invoice[] = [];
    const days60: Invoice[] = [];
    const days90: Invoice[] = [];

    unpaid.forEach((inv) => {
      const age = daysSince(inv.due_date || inv.period_end);
      if (age === null || age <= 0) current.push(inv);
      else if (age <= 30) days30.push(inv);
      else if (age <= 60) days60.push(inv);
      else days90.push(inv);
    });

    return { current, days30, days60, days90 };
  }, [invoices]);

  // Payment timeline (last 6 months)
  const paymentTimeline = useMemo(() => {
    const months: Record<string, { billed: number; collected: number }> = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months[key] = { billed: 0, collected: 0 };
    }
    invoices.forEach((inv) => {
      const createdMonth = inv.created_at.slice(0, 7);
      if (months[createdMonth]) months[createdMonth].billed += inv.amount_bdt;
      if (inv.payment_date) {
        const paidMonth = inv.payment_date.slice(0, 7);
        if (months[paidMonth]) months[paidMonth].collected += inv.amount_bdt;
      }
    });
    return Object.entries(months).map(([month, data]) => ({ month, ...data }));
  }, [invoices]);

  // Agency payment health
  const agencyHealth = useMemo(() => {
    const orgMap = new Map<string, { name: string; billed: number; paid: number; outstanding: number; lastPayment: string | null }>();
    invoices.forEach((inv) => {
      if (!orgMap.has(inv.org_id)) {
        orgMap.set(inv.org_id, { name: inv.org_name || "Unknown", billed: 0, paid: 0, outstanding: 0, lastPayment: null });
      }
      const entry = orgMap.get(inv.org_id)!;
      entry.billed += inv.amount_bdt;
      if (inv.status === "paid") {
        entry.paid += inv.amount_bdt;
        if (!entry.lastPayment || inv.payment_date! > entry.lastPayment) {
          entry.lastPayment = inv.payment_date;
        }
      } else if (inv.status !== "void") {
        entry.outstanding += inv.amount_bdt;
      }
    });
    return Array.from(orgMap.entries()).map(([id, data]) => ({ id, ...data }));
  }, [invoices]);

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
    const payload: any = { ...newInvoice, invoice_number: invNum, status: "draft" };
    if (!payload.due_date) delete payload.due_date;
    const { error } = await supabase.from("platform_invoices" as any).insert(payload as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Invoice created" }); }
    setSaving(false);
    setCreatingInvoice(false);
    setNewInvoice({ org_id: "", amount_bdt: 0, period_start: "", period_end: "", due_date: "" });
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
      const dueDate = new Date(new Date(periodStart).setDate(new Date(periodStart).getDate() + 15)).toISOString().slice(0, 10);
      const invNum = `INV-${new Date().getFullYear()}-${String(invoices.length + count + 1).padStart(3, "0")}`;
      await supabase.from("platform_invoices" as any).insert({
        org_id: sub.org_id, invoice_number: invNum, amount_bdt: sub.amount_bdt,
        period_start: periodStart, period_end: periodEnd, status: "sent", due_date: dueDate,
      } as any);
      count++;
    }
    toast({ title: `${count} invoice(s) generated` });
    setSaving(false);
    fetchData();
  };

  const exportCSV = () => {
    const headers = ["Invoice #", "Agency", "Amount (BDT)", "Period Start", "Period End", "Due Date", "Status", "Payment Date", "Payment Method"];
    const rows = filtered.map((i) => [i.invoice_number, i.org_name, i.amount_bdt, i.period_start, i.period_end, i.due_date || "", i.status, i.payment_date || "", i.payment_method || ""]);
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
          <p className="text-sm text-muted-foreground">Manage platform billing, payments, and collection health</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={autoGenerate} disabled={saving}>Auto-Generate</Button>
          <Button onClick={() => setCreatingInvoice(true)} className="gap-2"><Plus className="h-4 w-4" /> New Invoice</Button>
        </div>
      </div>

      {/* Revenue Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Collected</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-emerald-500">৳{totalCollected.toLocaleString()}</p></CardContent>
        </Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Outstanding</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-amber-500">৳{totalOutstanding.toLocaleString()}</p></CardContent>
        </Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Overdue</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-destructive">{overdueCount}</p></CardContent>
        </Card>
      </div>

      {/* Aging Buckets */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <Card className="border-emerald-500/30">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Current</p>
            <p className="text-lg font-bold text-emerald-500">৳{agingBuckets.current.reduce((s, i) => s + i.amount_bdt, 0).toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">{agingBuckets.current.length} invoices</p>
          </CardContent>
        </Card>
        <Card className="border-amber-500/30">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">30 Days</p>
            <p className="text-lg font-bold text-amber-500">৳{agingBuckets.days30.reduce((s, i) => s + i.amount_bdt, 0).toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">{agingBuckets.days30.length} invoices</p>
          </CardContent>
        </Card>
        <Card className="border-orange-500/30">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">60 Days</p>
            <p className="text-lg font-bold text-orange-500">৳{agingBuckets.days60.reduce((s, i) => s + i.amount_bdt, 0).toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">{agingBuckets.days60.length} invoices</p>
          </CardContent>
        </Card>
        <Card className="border-destructive/30">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">90+ Days</p>
            <p className="text-lg font-bold text-destructive">৳{agingBuckets.days90.reduce((s, i) => s + i.amount_bdt, 0).toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">{agingBuckets.days90.length} invoices</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="timeline">Payment Timeline</TabsTrigger>
          <TabsTrigger value="health">Agency Health</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="space-y-4">
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

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Agency</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Due Date</TableHead>
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
                      <TableCell className="text-sm">
                        {inv.due_date ? (
                          <span className={daysSince(inv.due_date)! > 0 && inv.status !== "paid" ? "text-destructive" : ""}>
                            {inv.due_date}
                          </span>
                        ) : "—"}
                      </TableCell>
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
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No invoices found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline">
          <Card>
            <CardHeader><CardTitle className="text-sm">Billed vs Collected (Last 6 Months)</CardTitle></CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  billed: { label: "Billed", color: "hsl(var(--muted-foreground))" },
                  collected: { label: "Collected", color: "hsl(var(--primary))" },
                }}
                className="h-[300px]"
              >
                <BarChart data={paymentTimeline}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="billed" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="collected" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="health">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agency</TableHead>
                    <TableHead>Total Billed</TableHead>
                    <TableHead>Total Paid</TableHead>
                    <TableHead>Outstanding</TableHead>
                    <TableHead>Last Payment</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agencyHealth.map((agency) => {
                    const daysSincePayment = daysSince(agency.lastPayment);
                    let healthStatus: "good" | "warning" | "critical" = "good";
                    if (!agency.lastPayment) healthStatus = "critical";
                    else if (daysSincePayment! > 60) healthStatus = "critical";
                    else if (daysSincePayment! > 30) healthStatus = "warning";

                    return (
                      <TableRow key={agency.id}>
                        <TableCell className="font-medium">{agency.name}</TableCell>
                        <TableCell>৳{agency.billed.toLocaleString()}</TableCell>
                        <TableCell className="text-emerald-500">৳{agency.paid.toLocaleString()}</TableCell>
                        <TableCell className={agency.outstanding > 0 ? "text-destructive font-medium" : ""}>
                          ৳{agency.outstanding.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {agency.lastPayment || "Never"}
                          {daysSincePayment !== null && <span className="ml-1 text-xs">({daysSincePayment}d ago)</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant={healthStatus === "good" ? "default" : healthStatus === "warning" ? "secondary" : "destructive"}>
                            {healthStatus === "good" ? "Healthy" : healthStatus === "warning" ? "At Risk" : "Critical"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {agencyHealth.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No billing data</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
            <div><Label>Due Date</Label><Input type="date" value={newInvoice.due_date} onChange={(e) => setNewInvoice({ ...newInvoice, due_date: e.target.value })} /></div>
            <Button onClick={createInvoice} disabled={saving || !newInvoice.org_id} className="w-full">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create Invoice
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
