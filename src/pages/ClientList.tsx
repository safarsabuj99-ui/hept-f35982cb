import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Users, ChevronRight, Plus, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { DepositFundsDialog } from "@/components/DepositFundsDialog";
import { TablePagination } from "@/components/TablePagination";
import { DataPageSkeleton } from "@/components/ui/premium-skeletons";

interface ClientRow {
  user_id: string;
  full_name: string;
  email: string;
  business_name: string | null;
  custom_exchange_rate: number | null;
  pricing_config: any;
}

interface MarginData {
  margin: number;
  billedUsd: number;
  rawBdt: number;
}

export default function ClientList() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositClientId, setDepositClientId] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [margins, setMargins] = useState<Record<string, MarginData>>({});
  const location = useLocation();

  useEffect(() => {
    async function load() {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "client");

      if (!roles?.length) { setLoading(false); return; }

      const ids = roles.map((r) => r.user_id);
      const [profilesRes, spendRes, accRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, full_name, email, business_name, custom_exchange_rate, pricing_config")
          .in("user_id", ids),
        supabase.from("daily_ad_spend").select("ad_account_id, raw_spend_amount, raw_currency, exchange_rate_used, final_billable_usd"),
        supabase.from("ad_accounts").select("id, client_id"),
      ]);

      setClients(profilesRes.data || []);

      // Build margin map
      const accToClient: Record<string, string> = {};
      for (const a of (accRes.data ?? []) as any[]) if (a.client_id) accToClient[a.id] = a.client_id;

      const agg: Record<string, { rawBdt: number; billedUsd: number; rateSum: number; count: number }> = {};
      for (const s of (spendRes.data ?? []) as any[]) {
        const clientId = accToClient[s.ad_account_id];
        if (!clientId) continue;
        if (!agg[clientId]) agg[clientId] = { rawBdt: 0, billedUsd: 0, rateSum: 0, count: 0 };
        if (s.raw_currency === "BDT") {
          agg[clientId].rawBdt += Number(s.raw_spend_amount);
        } else {
          agg[clientId].rawBdt += Number(s.raw_spend_amount) * Number(s.exchange_rate_used);
        }
        agg[clientId].billedUsd += Number(s.final_billable_usd);
        agg[clientId].rateSum += Number(s.exchange_rate_used);
        agg[clientId].count++;
      }

      const marginMap: Record<string, MarginData> = {};
      for (const [cid, data] of Object.entries(agg)) {
        const avgRate = data.count > 0 ? data.rateSum / data.count : 1;
        marginMap[cid] = {
          billedUsd: Math.round(data.billedUsd * 100) / 100,
          rawBdt: Math.round(data.rawBdt * 100) / 100,
          margin: data.rawBdt > 0
            ? Math.round(((data.billedUsd * avgRate - data.rawBdt) / data.rawBdt) * 10000) / 100
            : 0,
        };
      }
      setMargins(marginMap);
      setLoading(false);
    }
    load();
  }, [location.key]);

  useEffect(() => { setCurrentPage(1); }, [search]);

  const getPricingLabel = (config: any) => {
    if (!config?.platform_rates) return "Not Set";
    const pr = config.platform_rates;
    const parts = [];
    if (pr.meta) parts.push(`M:${pr.meta}`);
    if (pr.tiktok) parts.push(`T:${pr.tiktok}`);
    if (pr.google) parts.push(`G:${pr.google}`);
    let label = parts.join(" ");
    if (config.percentage && config.percentage > 0) label += ` +${config.percentage}%`;
    return label || "Default";
  };

  const MarginIndicator = ({ clientId }: { clientId: string }) => {
    const data = margins[clientId];
    if (!data || data.billedUsd === 0) {
      return <span className="text-xs text-muted-foreground">—</span>;
    }
    const m = data.margin;
    const isPositive = m > 0;
    const isNegative = m < 0;
    const Icon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;

    return (
      <div className="flex items-center justify-end gap-1.5">
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold transition-all ${
          isPositive
            ? "bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20"
            : isNegative
            ? "bg-destructive/10 text-destructive dark:bg-destructive/20"
            : "bg-muted text-muted-foreground"
        }`}>
          <Icon className="h-3 w-3" />
          <span className="font-mono">{m >= 0 ? "+" : ""}{m.toFixed(1)}%</span>
        </div>
      </div>
    );
  };

  const filtered = clients.filter(
    (c) =>
      c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (c.business_name || "").toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase())
  );

  const paginatedData = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Client List</h1>
          <p className="text-sm text-muted-foreground">Manage client configurations, pricing, and history</p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <Users className="h-3 w-3" /> {clients.length} clients
        </Badge>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name, business, or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">All Clients</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <DataPageSkeleton title={false} />
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {search ? "No clients match your search." : "No clients found."}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden sm:table-cell">Business</TableHead>
                      <TableHead className="hidden md:table-cell">Email</TableHead>
                      <TableHead>Pricing</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedData.map((c) => (
                      <TableRow key={c.user_id} className="group cursor-pointer hover:bg-muted/50">
                        <TableCell className="font-medium">
                          <Link to={`/admin/clients/${c.user_id}`} className="hover:underline">
                            {c.full_name}
                          </Link>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground">
                          {c.business_name || "—"}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                          {c.email}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {getPricingLabel(c.pricing_config)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <MarginIndicator clientId={c.user_id} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 h-7 px-2 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDepositClientId(c.user_id);
                                setDepositOpen(true);
                              }}
                            >
                              <Plus className="h-3 w-3" /> Funds
                            </Button>
                            <Link
                              to={`/admin/clients/${c.user_id}`}
                              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                            >
                              View <ChevronRight className="h-3 w-3" />
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
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

      <DepositFundsDialog
        open={depositOpen}
        onOpenChange={setDepositOpen}
        clientId={depositClientId}
      />
    </div>
  );
}