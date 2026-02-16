import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Loader2, FileText } from "lucide-react";
import { DateRangeFilter, DateRange, DatePreset } from "@/components/DateRangeFilter";
import { TablePagination } from "@/components/TablePagination";

export default function SpendReport() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [spendData, setSpendData] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [platformFilter, setPlatformFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    const fetch = async () => {
      const [{ data: spend }, { data: accs }, { data: roles }, { data: profiles }] = await Promise.all([
        supabase.from("daily_ad_spend" as any).select("*").order("date", { ascending: false }) as any,
        supabase.from("ad_accounts" as any).select("*") as any,
        supabase.from("user_roles").select("user_id").eq("role", "client"),
        supabase.from("profiles").select("user_id, full_name"),
      ]);
      setSpendData(spend ?? []);
      setAccounts(accs ?? []);
      const clientIds = new Set(roles?.map((r: any) => r.user_id) ?? []);
      setClients((profiles ?? []).filter((p: any) => clientIds.has(p.user_id)));
      setLoading(false);
    };
    fetch();
  }, []);

  // Reset page on filter change
  useEffect(() => { setCurrentPage(1); }, [platformFilter, clientFilter, dateRange]);

  const getAccount = (id: string) => accounts.find((a: any) => a.id === id);
  const getClientName = (accId: string) => {
    const acc = getAccount(accId);
    return clients.find((c: any) => c.user_id === acc?.client_id)?.full_name ?? "—";
  };

  const filtered = spendData.filter((s: any) => {
    const acc = getAccount(s.ad_account_id);
    if (platformFilter !== "all" && acc?.platform_name !== platformFilter) return false;
    if (clientFilter !== "all" && acc?.client_id !== clientFilter) return false;
    if (dateRange) {
      const d = new Date(s.date);
      if (d < dateRange.from || d > dateRange.to) return false;
    }
    return true;
  });

  const fmt = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const totalBillable = filtered.reduce((s: number, r: any) => s + Number(r.final_billable_usd), 0);

  const paginatedData = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Spend Report</h1>
        <p className="text-muted-foreground">Detailed daily ad spend breakdown</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap gap-4 pt-6">
          <div className="space-y-1">
            <Label className="text-xs">Platform</Label>
            <Select value={platformFilter} onValueChange={setPlatformFilter}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="meta">Meta</SelectItem>
                <SelectItem value="tiktok">TikTok</SelectItem>
                <SelectItem value="google">Google</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isAdmin && (
            <div className="space-y-1">
              <Label className="text-xs">Client</Label>
              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  {clients.map((c: any) => <SelectItem key={c.user_id} value={c.user_id}>{c.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Date Range</Label>
            <DateRangeFilter onRangeChange={(range) => setDateRange(range)} />
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Billable (USD)</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{fmt(totalBillable)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Records</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{filtered.length}</p></CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <FileText className="h-10 w-10" />
              <p>No spend data. Run a sync from Integrations.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead>Campaign</TableHead>
                      {isAdmin && <TableHead className="text-right">Raw Amount</TableHead>}
                      {isAdmin && <TableHead>Currency</TableHead>}
                      {isAdmin && <TableHead className="text-right">Rate</TableHead>}
                      <TableHead className="text-right">Billable (USD)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedData.map((s: any) => {
                      const acc = getAccount(s.ad_account_id);
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="whitespace-nowrap">{new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</TableCell>
                          <TableCell>{getClientName(s.ad_account_id)}</TableCell>
                          <TableCell><Badge variant="secondary" className="capitalize">{acc?.platform_name}</Badge></TableCell>
                          <TableCell className="max-w-[200px] truncate">{s.campaign_name}</TableCell>
                          {isAdmin && <TableCell className="text-right font-mono">{Number(s.raw_spend_amount).toFixed(2)}</TableCell>}
                          {isAdmin && <TableCell><Badge variant="outline">{s.raw_currency}</Badge></TableCell>}
                          {isAdmin && <TableCell className="text-right font-mono">{Number(s.exchange_rate_used).toFixed(2)}</TableCell>}
                          <TableCell className="text-right font-mono font-medium">{fmt(Number(s.final_billable_usd))}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <TablePagination
                totalItems={filtered.length}
                pageSize={pageSize}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
