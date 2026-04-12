import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownLeft, ArrowUpRight, Wallet, Clock, Plus, ArrowLeftRight, Landmark, Banknote, Smartphone } from "lucide-react";
import { format, subMonths, startOfMonth, differenceInDays } from "date-fns";
import { toast } from "sonner";
import { adjustPlatformAccountBalance } from "@/lib/adjustPlatformAccountBalance";
import { TablePagination } from "@/components/TablePagination";

interface PlatformAccount { id: string; name: string; type: string; account_number: string | null; current_balance_bdt: number; is_active: boolean; }
interface Transfer { id: string; from_account_id: string; to_account_id: string; amount_bdt: number; note: string | null; created_at: string; }

const ACCOUNT_TYPES = ["Bank", "MFS", "Cash"];
const typeIcon = (type: string) => {
  switch (type) {
    case "Bank": return <Landmark className="h-5 w-5 text-primary" />;
    case "MFS": return <Smartphone className="h-5 w-5 text-primary" />;
    default: return <Banknote className="h-5 w-5 text-primary" />;
  }
};

export default function PlatformCashFlowTab() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [subs, setSubs] = useState<any[]>([]);

  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [accForm, setAccForm] = useState({ name: "", type: "Bank", account_number: "" });
  const [tfForm, setTfForm] = useState({ from: "", to: "", amount: "", note: "" });

  const [actPage, setActPage] = useState(1);
  const [actPageSize, setActPageSize] = useState(20);

  const fetchAll = async () => {
    const [{ data: accData }, { data: tfData }, { data: invData }, { data: expData }, { data: subData }] = await Promise.all([
      supabase.from("platform_accounts").select("*").order("name"),
      supabase.from("platform_fund_transfers").select("*").order("created_at", { ascending: false }),
      supabase.from("platform_invoices").select("*"),
      supabase.from("platform_expenses" as any).select("*"),
      supabase.from("organization_subscriptions").select("*, organizations(name)"),
    ]);
    setAccounts((accData ?? []) as PlatformAccount[]);
    setTransfers((tfData ?? []) as Transfer[]);
    setInvoices(invData ?? []);
    setExpenses(((expData as any[]) ?? []));
    setSubs(subData ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // Add account
  const handleAddAccount = async () => {
    if (!accForm.name) { toast.error("Account name required"); return; }
    const { error } = await supabase.from("platform_accounts").insert({
      name: accForm.name, type: accForm.type, account_number: accForm.account_number || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Account added");
    setAccForm({ name: "", type: "Bank", account_number: "" });
    setAddAccountOpen(false);
    fetchAll();
  };

  // Transfer
  const handleTransfer = async () => {
    const amount = Number(tfForm.amount);
    if (!tfForm.from || !tfForm.to || tfForm.from === tfForm.to || amount <= 0) {
      toast.error("Invalid transfer"); return;
    }
    const ok1 = await adjustPlatformAccountBalance(tfForm.from, -amount);
    const ok2 = await adjustPlatformAccountBalance(tfForm.to, amount);
    if (!ok1 || !ok2) { toast.error("Balance update failed"); return; }

    const { error } = await supabase.from("platform_fund_transfers").insert({
      from_account_id: tfForm.from, to_account_id: tfForm.to, amount_bdt: amount,
      note: tfForm.note || null, created_by: user?.id!,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Transfer completed");
    setTfForm({ from: "", to: "", amount: "", note: "" });
    setTransferOpen(false);
    fetchAll();
  };

  const metrics = useMemo(() => {
    const paidInvoices = invoices.filter((i: any) => i.status === "paid");
    const totalCollected = paidInvoices.reduce((s: number, i: any) => s + Number(i.amount_bdt || 0), 0);
    const totalExpenses = expenses.reduce((s: number, e: any) => s + Number(e.amount_bdt || 0), 0);
    const netCashFlow = totalCollected - totalExpenses;

    const unpaidInvoices = invoices.filter((i: any) => i.status !== "paid" && i.status !== "cancelled");
    const totalOutstanding = unpaidInvoices.reduce((s: number, i: any) => s + Number(i.amount_bdt || 0), 0);

    const aging: Record<string, number> = { "0-30": 0, "31-60": 0, "60+": 0 };
    unpaidInvoices.forEach((inv: any) => {
      const days = differenceInDays(new Date(), new Date(inv.created_at));
      if (days <= 30) aging["0-30"] += Number(inv.amount_bdt || 0);
      else if (days <= 60) aging["31-60"] += Number(inv.amount_bdt || 0);
      else aging["60+"] += Number(inv.amount_bdt || 0);
    });

    const monthly: { month: string; inflow: number; outflow: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const mStart = startOfMonth(d);
      const mEnd = startOfMonth(subMonths(d, -1));
      const inflow = paidInvoices.filter((inv: any) => { const pd = new Date(inv.paid_at || inv.created_at); return pd >= mStart && pd < mEnd; }).reduce((s: number, inv: any) => s + Number(inv.amount_bdt || 0), 0);
      const outflow = expenses.filter((e: any) => { const ed = new Date(e.date); return ed >= mStart && ed < mEnd; }).reduce((s: number, e: any) => s + Number(e.amount_bdt || 0), 0);
      monthly.push({ month: format(d, "MMM yy"), inflow: Math.round(inflow), outflow: Math.round(outflow) });
    }

    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 86400000);
    const upcomingRenewals = subs.filter((s: any) => {
      const end = new Date(s.current_period_end);
      return s.auto_renew && end >= now && end <= in30;
    }).map((s: any) => ({ org: (s as any).organizations?.name || "Unknown", plan: s.plan, amount: Number(s.amount_bdt || 0), date: s.current_period_end }));

    return { totalCollected, totalExpenses, netCashFlow, totalOutstanding, aging, monthly, upcomingRenewals };
  }, [invoices, expenses, subs]);

  // Unified activity feed
  const activityFeed = useMemo(() => {
    const items: { id: string; type: string; date: string; description: string; amount: number; direction: "in" | "out" | "transfer" }[] = [];

    invoices.filter((i: any) => i.status === "paid").forEach((i: any) => {
      items.push({ id: i.id, type: "Collection", date: i.paid_at || i.created_at, description: `Invoice #${i.invoice_number || i.id.slice(0, 8)}`, amount: Number(i.amount_bdt || 0), direction: "in" });
    });

    expenses.forEach((e: any) => {
      items.push({ id: e.id, type: "Expense", date: e.date, description: `${(e.category || "").replace(/_/g, " ")} — ${e.description || "No note"}`, amount: Number(e.amount_bdt || 0), direction: "out" });
    });

    transfers.forEach((t) => {
      const fromName = accounts.find(a => a.id === t.from_account_id)?.name || "?";
      const toName = accounts.find(a => a.id === t.to_account_id)?.name || "?";
      items.push({ id: t.id, type: "Transfer", date: t.created_at, description: `${fromName} → ${toName}${t.note ? ` (${t.note})` : ""}`, amount: Number(t.amount_bdt), direction: "transfer" });
    });

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items;
  }, [invoices, expenses, transfers, accounts]);

  const paginatedFeed = useMemo(() => {
    const start = (actPage - 1) * actPageSize;
    return activityFeed.slice(start, start + actPageSize);
  }, [activityFeed, actPage, actPageSize]);

  const totalAccountBalance = accounts.filter(a => a.is_active).reduce((s, a) => s + Number(a.current_balance_bdt), 0);

  if (loading) return (
    <div className="space-y-6 mt-4">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
    </div>
  );

  return (
    <div className="space-y-8 mt-4">
      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Total Collected" value={`৳${Math.round(metrics.totalCollected).toLocaleString()}`} icon={ArrowDownLeft} accentColor="hsl(142, 76%, 36%)" staggerIndex={0} />
        <KpiCard title="Total Outflow" value={`৳${Math.round(metrics.totalExpenses).toLocaleString()}`} icon={ArrowUpRight} accentColor="hsl(var(--destructive))" staggerIndex={1} />
        <KpiCard title="Net Cash Flow" value={`৳${Math.round(metrics.netCashFlow).toLocaleString()}`} icon={Wallet} accentColor={metrics.netCashFlow >= 0 ? "hsl(142, 76%, 36%)" : "hsl(var(--destructive))"} staggerIndex={2} />
        <KpiCard title="Outstanding" value={`৳${Math.round(metrics.totalOutstanding).toLocaleString()}`} icon={Clock} accentColor="hsl(45, 93%, 47%)" staggerIndex={3} />
      </div>

      {/* Platform Accounts */}
      <div className="glass-card glow-border animate-slide-up-fade">
        <Card className="border-0 bg-transparent shadow-none">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Platform Accounts</CardTitle>
            <div className="flex gap-2">
              <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline"><ArrowLeftRight className="h-4 w-4 mr-1" />Transfer</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Transfer Funds</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>From Account</Label>
                      <Select value={tfForm.from} onValueChange={(v) => setTfForm(f => ({ ...f, from: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>{accounts.filter(a => a.is_active).map(a => <SelectItem key={a.id} value={a.id}>{a.name} (৳{Number(a.current_balance_bdt).toLocaleString()})</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>To Account</Label>
                      <Select value={tfForm.to} onValueChange={(v) => setTfForm(f => ({ ...f, to: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>{accounts.filter(a => a.is_active).map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Amount (BDT)</Label><Input type="number" value={tfForm.amount} onChange={e => setTfForm(f => ({ ...f, amount: e.target.value }))} /></div>
                    <div><Label>Note</Label><Input value={tfForm.note} onChange={e => setTfForm(f => ({ ...f, note: e.target.value }))} placeholder="Optional" /></div>
                    <Button onClick={handleTransfer} className="w-full">Transfer</Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={addAccountOpen} onOpenChange={setAddAccountOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 mr-1" />Add Account</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Account</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div><Label>Name</Label><Input value={accForm.name} onChange={e => setAccForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. DBBL Main" /></div>
                    <div>
                      <Label>Type</Label>
                      <Select value={accForm.type} onValueChange={(v) => setAccForm(f => ({ ...f, type: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{ACCOUNT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Account Number</Label><Input value={accForm.account_number} onChange={e => setAccForm(f => ({ ...f, account_number: e.target.value }))} placeholder="Optional" /></div>
                    <Button onClick={handleAddAccount} className="w-full">Save Account</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {accounts.length > 0 ? (
              <>
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {accounts.filter(a => a.is_active).map(a => (
                    <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                      {typeIcon(a.type)}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{a.name}</p>
                        <p className="text-xs text-muted-foreground">{a.type}{a.account_number ? ` • ${a.account_number}` : ""}</p>
                      </div>
                      <p className="font-mono font-semibold text-sm">৳{Number(a.current_balance_bdt).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-right">
                  <span className="text-sm text-muted-foreground">Total Balance: </span>
                  <span className="font-mono font-bold text-primary">৳{Math.round(totalAccountBalance).toLocaleString()}</span>
                </div>
              </>
            ) : (
              <p className="text-center py-6 text-sm text-muted-foreground">No accounts yet. Add your first platform account.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly Cash Flow Chart */}
      <div className="glass-card glow-border animate-slide-up-fade" style={{ animationDelay: "200ms", animationFillMode: "forwards" }}>
        <Card className="border-0 bg-transparent shadow-none">
          <CardHeader><CardTitle className="text-sm">Monthly Cash Flow</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={{ inflow: { label: "Inflow", color: "hsl(142, 76%, 36%)" }, outflow: { label: "Outflow", color: "hsl(var(--destructive))" } }} className="h-[260px]">
              <BarChart data={metrics.monthly}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="inflow" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="outflow" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Activity Feed */}
      <div className="glass-card glow-border animate-slide-up-fade" style={{ animationDelay: "300ms", animationFillMode: "forwards" }}>
        <Card className="border-0 bg-transparent shadow-none">
          <CardHeader><CardTitle className="text-sm">Activity Feed</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedFeed.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">{format(new Date(item.date), "dd MMM yyyy")}</TableCell>
                    <TableCell>
                      <Badge variant={item.direction === "in" ? "default" : item.direction === "out" ? "destructive" : "outline"}>
                        {item.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{item.description}</TableCell>
                    <TableCell className={`text-right font-mono font-medium ${item.direction === "in" ? "text-emerald-600 dark:text-emerald-400" : item.direction === "out" ? "text-destructive" : "text-primary"}`}>
                      {item.direction === "in" ? "+" : item.direction === "out" ? "-" : "↔"}৳{Math.round(item.amount).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
                {paginatedFeed.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No activity yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
            <div className="px-4 pb-4">
              <TablePagination totalItems={activityFeed.length} pageSize={actPageSize} currentPage={actPage} onPageChange={setActPage} onPageSizeChange={setActPageSize} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Aging & Renewals */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-card glow-border animate-slide-up-fade" style={{ animationDelay: "400ms", animationFillMode: "forwards" }}>
          <Card className="border-0 bg-transparent shadow-none">
            <CardHeader><CardTitle className="text-sm">Receivable Aging</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(metrics.aging).map(([bucket, amount]) => (
                  <div key={bucket} className="flex items-center justify-between">
                    <Badge variant={bucket === "60+" ? "destructive" : "outline"}>{bucket} days</Badge>
                    <span className="font-mono font-medium">৳{Math.round(amount).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="glass-card glow-border animate-slide-up-fade" style={{ animationDelay: "500ms", animationFillMode: "forwards" }}>
          <Card className="border-0 bg-transparent shadow-none">
            <CardHeader><CardTitle className="text-sm">Upcoming Renewals (30 days)</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agency</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Renewal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.upcomingRenewals.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.org}</TableCell>
                      <TableCell><Badge variant="outline">{r.plan}</Badge></TableCell>
                      <TableCell className="text-right font-mono">৳{Math.round(r.amount).toLocaleString()}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{format(new Date(r.date), "dd MMM")}</TableCell>
                    </TableRow>
                  ))}
                  {metrics.upcomingRenewals.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No renewals in next 30 days</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
