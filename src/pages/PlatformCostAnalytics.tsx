import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Plus, Calculator, DollarSign, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { format, parseISO } from "date-fns";

const CATEGORIES = ["edge_functions", "storage", "bandwidth", "other"] as const;

export default function PlatformCostAnalytics() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState(format(new Date(), "yyyy-MM-dd"));
  const [category, setCategory] = useState<string>("other");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const { data: costs = [] } = useQuery({ queryKey: ["platform-costs"], queryFn: async () => { const { data } = await supabase.from("platform_costs").select("*").order("period", { ascending: false }); return data || []; } });
  const { data: subs = [] } = useQuery({ queryKey: ["cost-subs"], queryFn: async () => { const { data } = await supabase.from("organization_subscriptions").select("amount_bdt, billing_cycle, payment_status"); return data || []; } });
  const { data: orgs = [] } = useQuery({ queryKey: ["cost-orgs"], queryFn: async () => { const { data } = await supabase.from("organizations").select("id, status"); return data || []; } });

  const totalRevenue = subs.filter((s) => s.payment_status === "paid").reduce((sum, s) => sum + (s.billing_cycle === "yearly" ? s.amount_bdt / 12 : s.amount_bdt), 0);
  const totalCosts = costs.reduce((sum, c) => sum + Number(c.amount_bdt), 0);
  const activeOrgs = orgs.filter((o) => o.status === "active").length;
  const costPerTenant = activeOrgs > 0 ? totalCosts / activeOrgs : 0;
  const grossMargin = totalRevenue > 0 ? ((totalRevenue - totalCosts) / totalRevenue) * 100 : 0;

  const chartData = useMemo(() => {
    const byMonth = new Map<string, { revenue: number; cost: number }>();
    costs.forEach((c) => { const m = format(parseISO(c.period), "MMM yy"); const existing = byMonth.get(m) || { revenue: 0, cost: 0 }; existing.cost += Number(c.amount_bdt); byMonth.set(m, existing); });
    return Array.from(byMonth.entries()).map(([month, d]) => ({ month, cost: d.cost, revenue: totalRevenue }));
  }, [costs, totalRevenue]);

  const handleAdd = async () => {
    const { error } = await supabase.from("platform_costs").insert({ period, category, amount_bdt: Number(amount), notes: notes || null });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Cost entry added" }); queryClient.invalidateQueries({ queryKey: ["platform-costs"] }); setOpen(false); setAmount(""); setNotes(""); }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between animate-slide-up-fade" style={{ animationFillMode: "forwards" }}>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cost Analytics</h1>
          <p className="text-muted-foreground">Track infrastructure costs and unit economics</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Add Cost</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Cost Entry</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Period</Label><Input type="date" value={period} onChange={(e) => setPeriod(e.target.value)} /></div>
              <div><Label>Category</Label><Select value={category} onValueChange={setCategory}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Amount (৳)</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></div>
              <div><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></div>
              <Button onClick={handleAdd} disabled={!amount} className="w-full">Save</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div>
        <p className="section-label mb-3">Unit Economics</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <KpiCard title="Total Costs" value={`৳${Math.round(totalCosts).toLocaleString()}`} icon={Calculator} staggerIndex={0} />
          <KpiCard title="Cost per Tenant" value={`৳${Math.round(costPerTenant).toLocaleString()}`} icon={DollarSign} staggerIndex={1} />
          <KpiCard title="Monthly Revenue" value={`৳${Math.round(totalRevenue).toLocaleString()}`} icon={TrendingUp} accentColor="hsl(var(--success))" staggerIndex={2} />
          <KpiCard title="Gross Margin" value={`${grossMargin.toFixed(1)}%`} icon={TrendingUp} accentColor={grossMargin >= 50 ? "hsl(var(--success))" : grossMargin >= 20 ? "hsl(var(--warning))" : "hsl(var(--destructive))"} staggerIndex={3} />
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="glass-card glow-border animate-slide-up-fade" style={{ animationDelay: "200ms", animationFillMode: "forwards" }}>
          <Card className="border-0 bg-transparent shadow-none">
            <CardHeader><CardTitle>Revenue vs Cost</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" /><YAxis />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" name="Revenue" />
                  <Bar dataKey="cost" fill="hsl(var(--destructive))" name="Cost" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="glass-card glow-border animate-slide-up-fade" style={{ animationDelay: "300ms", animationFillMode: "forwards" }}>
        <Card className="border-0 bg-transparent shadow-none">
          <CardHeader><CardTitle>Cost Entries</CardTitle></CardHeader>
          <CardContent>
            {costs.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No cost entries yet</p>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Amount (৳)</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
                <TableBody>
                  {costs.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{format(parseISO(c.period), "MMM yyyy")}</TableCell>
                      <TableCell className="capitalize">{c.category.replace("_", " ")}</TableCell>
                      <TableCell className="text-right font-mono">৳{Number(c.amount_bdt).toLocaleString()}</TableCell>
                      <TableCell className="text-muted-foreground">{c.notes || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
