import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Download, TrendingUp, TrendingDown, DollarSign, Users } from "lucide-react";
import { format } from "date-fns";

export default function PlatformFinancialReports() {
  const { data: snapshots = [] } = useQuery({
    queryKey: ["mrr-waterfall"],
    queryFn: async () => {
      const { data } = await supabase.from("mrr_snapshots").select("*").order("snapshot_month", { ascending: true }).limit(24);
      return data || [];
    },
  });

  const { data: costs = [] } = useQuery({
    queryKey: ["acquisition-costs"],
    queryFn: async () => {
      const { data } = await supabase.from("acquisition_costs").select("*, organizations(name)").order("date", { ascending: false });
      return data || [];
    },
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["aging-invoices"],
    queryFn: async () => {
      const { data } = await supabase.from("platform_invoices")
        .select("*, organizations(name)").in("status", ["sent", "overdue"]).order("due_date");
      return data || [];
    },
  });

  // Waterfall chart data
  const waterfallData = snapshots.map((s: any) => ({
    month: s.snapshot_month?.slice(0, 7),
    "New MRR": s.new_mrr || 0,
    "Expansion": s.upgrade_mrr || s.expansion_mrr || 0,
    "Reactivation": s.reactivation_mrr || 0,
    "Contraction": -(s.downgrade_mrr || s.contraction_mrr || 0),
    "Churned": -(s.churned_mrr || 0),
    "Total MRR": s.total_mrr || 0,
  }));

  // LTV/CAC calculations
  const totalRevenue = snapshots.reduce((s: number, snap: any) => s + (snap.total_mrr || 0), 0);
  const avgLTV = snapshots.length ? Math.round(totalRevenue / Math.max(1, snapshots[snapshots.length - 1]?.active_count || 1)) : 0;
  const totalCAC = costs.reduce((s: number, c: any) => s + (c.amount_bdt || 0), 0);
  const avgCAC = costs.length ? Math.round(totalCAC / costs.length) : 0;
  const ltvCacRatio = avgCAC ? (avgLTV / avgCAC).toFixed(1) : "—";

  const exportCSV = (data: any[], filename: string) => {
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const csv = [headers.join(","), ...data.map(row => headers.map(h => JSON.stringify(row[h] ?? "")).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Financial Reports" subtitle="MRR waterfall, LTV/CAC, and revenue analytics" />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-green-500" /><div><div className="text-2xl font-bold">৳{avgLTV.toLocaleString()}</div><p className="text-sm text-muted-foreground">Avg LTV</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><DollarSign className="h-5 w-5 text-blue-500" /><div><div className="text-2xl font-bold">৳{avgCAC.toLocaleString()}</div><p className="text-sm text-muted-foreground">Avg CAC</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /><div><div className="text-2xl font-bold">{ltvCacRatio}x</div><p className="text-sm text-muted-foreground">LTV:CAC Ratio</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><TrendingDown className="h-5 w-5 text-red-500" /><div><div className="text-2xl font-bold">৳{invoices.reduce((s: number, i: any) => s + i.amount_bdt, 0).toLocaleString()}</div><p className="text-sm text-muted-foreground">Outstanding</p></div></div></CardContent></Card>
      </div>

      <Tabs defaultValue="waterfall">
        <TabsList>
          <TabsTrigger value="waterfall">MRR Waterfall</TabsTrigger>
          <TabsTrigger value="aging">Aging Receivables</TabsTrigger>
          <TabsTrigger value="cac">Acquisition Costs</TabsTrigger>
        </TabsList>

        <TabsContent value="waterfall">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>MRR Waterfall</CardTitle>
              <Button size="sm" variant="outline" onClick={() => exportCSV(waterfallData, "mrr-waterfall.csv")}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={waterfallData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="New MRR" fill="hsl(var(--primary))" stackId="a" />
                    <Bar dataKey="Expansion" fill="#22c55e" stackId="a" />
                    <Bar dataKey="Reactivation" fill="#3b82f6" stackId="a" />
                    <Bar dataKey="Contraction" fill="#f59e0b" stackId="a" />
                    <Bar dataKey="Churned" fill="#ef4444" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="aging">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Aging Receivables</CardTitle>
              <Button size="sm" variant="outline" onClick={() => exportCSV(invoices.map((i: any) => ({ agency: i.organizations?.name, invoice: i.invoice_number, amount: i.amount_bdt, due: i.due_date, status: i.status })), "aging.csv")}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Agency</TableHead><TableHead>Invoice</TableHead><TableHead>Amount</TableHead><TableHead>Due Date</TableHead><TableHead>Status</TableHead><TableHead>Days Overdue</TableHead></TableRow></TableHeader>
                <TableBody>
                  {invoices.map((inv: any) => {
                    const daysOverdue = inv.due_date ? Math.max(0, Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000)) : 0;
                    return (
                      <TableRow key={inv.id}>
                        <TableCell>{inv.organizations?.name}</TableCell>
                        <TableCell className="font-mono text-sm">{inv.invoice_number}</TableCell>
                        <TableCell>৳{inv.amount_bdt?.toLocaleString()}</TableCell>
                        <TableCell>{inv.due_date ? format(new Date(inv.due_date), "dd MMM yyyy") : "—"}</TableCell>
                        <TableCell><Badge variant={inv.status === "overdue" ? "destructive" : "outline"}>{inv.status}</Badge></TableCell>
                        <TableCell className={daysOverdue > 7 ? "text-red-600 font-semibold" : ""}>{daysOverdue > 0 ? `${daysOverdue} days` : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cac">
          <Card>
            <CardHeader><CardTitle>Acquisition Costs</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Agency</TableHead><TableHead>Type</TableHead><TableHead>Amount</TableHead><TableHead>Description</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                <TableBody>
                  {costs.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.organizations?.name || "Platform"}</TableCell>
                      <TableCell><Badge variant="outline">{c.cost_type}</Badge></TableCell>
                      <TableCell>৳{c.amount_bdt?.toLocaleString()}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{c.description || "—"}</TableCell>
                      <TableCell>{format(new Date(c.date), "dd MMM yyyy")}</TableCell>
                    </TableRow>
                  ))}
                  {!costs.length && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No acquisition costs recorded</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
