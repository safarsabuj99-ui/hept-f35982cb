import { useState, useEffect, useCallback } from "react";
import { getPlatformRates } from "@/lib/pricing";
import { supabase } from "@/integrations/supabase/client";
import { Link, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Users, ChevronRight, Plus, TrendingUp, TrendingDown, Minus, ArrowUpDown, ArrowUp, ArrowDown, Save } from "lucide-react";
import { DepositFundsDialog } from "@/components/DepositFundsDialog";
import { TablePagination } from "@/components/TablePagination";
import { DataPageSkeleton } from "@/components/ui/premium-skeletons";
import { usePermissions } from "@/hooks/usePermissions";
import { usePresetPreferences } from "@/hooks/usePresetPreferences";

type SortKey = "name" | "business" | "email" | "pricing" | "margin" | "balance";

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
  const { hasPermission } = usePermissions();
  const canViewProfit = hasPermission("can_view_profit");
  const { loading: prefsLoading, getUiPref, setUiPref } = usePresetPreferences();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositClientId, setDepositClientId] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [margins, setMargins] = useState<Record<string, MarginData>>({});
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [bdtBalances, setBdtBalances] = useState<Record<string, number>>({});
  const [sortKey, setSortKey] = useState<SortKey>("balance");
  const [sortAsc, setSortAsc] = useState(false);
  const [sortInitialized, setSortInitialized] = useState(false);
  const location = useLocation();

  // Load saved sort preference
  useEffect(() => {
    if (prefsLoading || sortInitialized) return;
    const saved = getUiPref("clientListSort");
    if (saved && saved.key && typeof saved.asc === "boolean") {
      setSortKey(saved.key);
      setSortAsc(saved.asc);
    }
    setSortInitialized(true);
  }, [prefsLoading, sortInitialized, getUiPref]);

  const load = useCallback(async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "client");

      if (!roles?.length) { setLoading(false); return; }

      const ids = roles.map((r) => r.user_id);
      const [profilesRes, purchasesRes, campaignsRes, metricsRes, accClientsRes, txnsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, full_name, email, business_name, custom_exchange_rate, pricing_config")
          .in("user_id", ids),
        supabase.from("usd_purchases").select("bdt_amount_paid, usd_received"),
        supabase.from("campaigns").select("id, ad_account_id, platform"),
        supabase.from("daily_metrics").select("campaign_id, spend"),
        supabase.from("ad_account_clients").select("ad_account_id, client_id"),
        supabase.from("transactions").select("client_id, type, amount, platform").eq("status", "completed"),
      ]);

      setClients(profilesRes.data || []);

      // WAC
      let totalBdt = 0, totalUsd = 0;
      for (const p of (purchasesRes.data ?? []) as any[]) {
        totalBdt += Number(p.bdt_amount_paid);
        totalUsd += Number(p.usd_received);
      }
      const wac = totalUsd > 0 ? totalBdt / totalUsd : 128;

      // Mappings
      const campaignMap: Record<string, { ad_account_id: string; platform: string }> = {};
      for (const c of (campaignsRes.data ?? []) as any[]) {
        campaignMap[c.id] = { ad_account_id: c.ad_account_id, platform: c.platform };
      }
      const accToClients: Record<string, string[]> = {};
      for (const ac of (accClientsRes.data ?? []) as any[]) {
        if (!accToClients[ac.ad_account_id]) accToClients[ac.ad_account_id] = [];
        accToClients[ac.ad_account_id].push(ac.client_id);
      }
      const profileMap: Record<string, any> = {};
      for (const pr of (profilesRes.data ?? []) as any[]) profileMap[pr.user_id] = pr;

      // Aggregate spend per client per platform
      const clientPlatformSpend: Record<string, Record<string, number>> = {};
      for (const m of (metricsRes.data ?? []) as any[]) {
        const camp = campaignMap[m.campaign_id];
        if (!camp) continue;
        const clients = accToClients[camp.ad_account_id] || [];
        for (const cid of clients) {
          if (!ids.includes(cid)) continue;
          if (!clientPlatformSpend[cid]) clientPlatformSpend[cid] = {};
          clientPlatformSpend[cid][camp.platform] = (clientPlatformSpend[cid][camp.platform] || 0) + Number(m.spend);
        }
      }

      // Calculate margin using gap method
      const marginMap: Record<string, MarginData> = {};
      for (const [cid, platformSpends] of Object.entries(clientPlatformSpend)) {
        const profile = profileMap[cid];
        if (!profile) continue;
        const pricingConfig = profile.pricing_config as any;
        const rates = getPlatformRates(pricingConfig);

        let revenueBdt = 0, cogsBdt = 0;
        for (const [platform, spendUsd] of Object.entries(platformSpends)) {
          const rate = Number(rates[platform] || 120);
          revenueBdt += (spendUsd as number) * rate;
          cogsBdt += (spendUsd as number) * wac;
        }
        const profitBdt = revenueBdt - cogsBdt;
        marginMap[cid] = {
          billedUsd: Math.round(revenueBdt * 100) / 100,
          rawBdt: Math.round(cogsBdt * 100) / 100,
          margin: revenueBdt > 0 ? Math.round((profitBdt / revenueBdt) * 1000) / 10 : 0,
        };
      }
      setMargins(marginMap);

      // Compute balances (total + per-platform)
      const balMap: Record<string, number> = {};
      const platformBalMap: Record<string, Record<string, number>> = {};
      const knownPlatforms = ["meta", "tiktok", "google"];
      for (const t of (txnsRes.data ?? []) as any[]) {
        const amt = Number(t.amount) || 0;
        const delta = t.type === "credit" ? amt : -amt;
        balMap[t.client_id] = (balMap[t.client_id] || 0) + delta;
        // Only track known platforms (matching Client Dashboard logic)
        if (t.platform && knownPlatforms.includes(t.platform)) {
          if (!platformBalMap[t.client_id]) platformBalMap[t.client_id] = {};
          platformBalMap[t.client_id][t.platform] = (platformBalMap[t.client_id][t.platform] || 0) + delta;
        }
      }
      setBalances(balMap);

      // Compute BDT for negative balances matching Client Dashboard logic exactly
      const bdtMap: Record<string, number> = {};
      for (const [cid, totalBal] of Object.entries(balMap)) {
        if (totalBal >= 0) continue;
        const profile = profileMap[cid];
        const pConfig = profile?.pricing_config as any;
        const rates = getPlatformRates(pConfig);
        const platBals = platformBalMap[cid] || {};
        let bdtTotal = 0;
        // Only iterate known platforms, same as Client Dashboard
        for (const p of knownPlatforms) {
          const platBal = platBals[p] || 0;
          if (platBal < 0) {
            const rate = Number(rates[p] || 120);
            bdtTotal += Math.abs(platBal) * rate;
          }
        }
        bdtMap[cid] = bdtTotal;
      }
      setBdtBalances(bdtMap);

      setLoading(false);
  }, []);

  useEffect(() => { load(); }, [location.key, load]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("client-list-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_ad_spend" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const getPricingLabel = (config: any) => {
    const pr = config?.flat_rates || config?.platform_rates;
    if (!pr) return "Not Set";
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

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === "name" || key === "business" || key === "email"); }
    setCurrentPage(1);
  };

  const saveDefaultSort = () => {
    setUiPref("clientListSort", { key: sortKey, asc: sortAsc });
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    return sortAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const SortBtn = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => (
    <button
      onClick={() => handleSort(k)}
      className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${sortKey === k ? "text-foreground font-semibold" : ""} ${className || ""}`}
    >
      {label} <SortIcon k={k} />
    </button>
  );

  const filtered = clients.filter(
    (c) =>
      c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (c.business_name || "").toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    const mul = sortAsc ? 1 : -1;
    switch (sortKey) {
      case "name": return mul * a.full_name.localeCompare(b.full_name);
      case "business": return mul * (a.business_name || "").localeCompare(b.business_name || "");
      case "email": return mul * a.email.localeCompare(b.email);
      case "pricing": return mul * getPricingLabel(a.pricing_config).localeCompare(getPricingLabel(b.pricing_config));
      case "margin": return mul * ((margins[a.user_id]?.margin ?? 0) - (margins[b.user_id]?.margin ?? 0));
      case "balance": return mul * ((balances[a.user_id] ?? 0) - (balances[b.user_id] ?? 0));
      default: return 0;
    }
  });

  const paginatedData = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-slide-up-fade">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Client List</h1>
          <p className="text-sm text-muted-foreground">Manage client configurations, pricing, and history</p>
        </div>
        <Badge variant="secondary" className="gap-1 self-start">
          <Users className="h-3 w-3" /> {clients.length} clients
        </Badge>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, business, or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs shrink-0 self-start" onClick={saveDefaultSort}>
          <Save className="h-3 w-3" /> Set Default Sort
        </Button>
      </div>

      <div className="glass-card glow-border opacity-0 animate-slide-up-fade stagger-2">
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
              {/* Mobile card view */}
               <div className="flex flex-col gap-2 md:hidden">
                {paginatedData.map((c) => {
                  const bal = balances[c.user_id] ?? 0;
                  const isPositive = bal >= 0;
                  return (
                    <div key={c.user_id} className="rounded-xl border bg-card p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <Link to={`/admin/clients/${c.user_id}`} className="font-medium text-sm text-primary hover:underline truncate block">
                            {c.full_name}
                          </Link>
                          {c.business_name && <p className="text-[11px] text-muted-foreground truncate">{c.business_name}</p>}
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0 h-5">
                          {getPricingLabel(c.pricing_config)}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-muted-foreground">Bal:</span>
                          {isPositive ? (
                            <span className="inline-flex px-1.5 py-0.5 rounded-full text-[11px] font-semibold font-mono bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20">
                              ${bal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className="inline-flex px-1.5 py-0.5 rounded-full text-[11px] font-semibold font-mono bg-destructive/10 text-destructive dark:bg-destructive/20">
                              -৳{(bdtBalances[c.user_id] ?? Math.abs(bal) * 120).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>
                        {canViewProfit && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-muted-foreground">Margin:</span>
                            <MarginIndicator clientId={c.user_id} />
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-1 text-xs h-7"
                          onClick={() => { setDepositClientId(c.user_id); setDepositOpen(true); }}
                        >
                          <Plus className="h-3 w-3" /> Add Funds
                        </Button>
                        <Button size="sm" variant="default" className="flex-1 gap-1 text-xs h-7" asChild>
                          <Link to={`/admin/clients/${c.user_id}`}>
                            View <ChevronRight className="h-3 w-3" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead><SortBtn k="name" label="Name" /></TableHead>
                      <TableHead><SortBtn k="business" label="Business" /></TableHead>
                      <TableHead><SortBtn k="email" label="Email" /></TableHead>
                      <TableHead><SortBtn k="pricing" label="Pricing" /></TableHead>
                      {canViewProfit && <TableHead className="text-right"><SortBtn k="margin" label="Margin" className="justify-end" /></TableHead>}
                      <TableHead className="text-right"><SortBtn k="balance" label="Balance" className="justify-end" /></TableHead>
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
                        <TableCell className="text-muted-foreground">
                          {c.business_name || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {c.email}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {getPricingLabel(c.pricing_config)}
                          </Badge>
                        </TableCell>
                        {canViewProfit && (
                          <TableCell className="text-right">
                            <MarginIndicator clientId={c.user_id} />
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          {(() => {
                            const bal = balances[c.user_id] ?? 0;
                            const isPositive = bal >= 0;
                            if (isPositive) {
                              return (
                                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold font-mono bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20">
                                  ${bal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              );
                            }
                            const bdtAmt = bdtBalances[c.user_id] ?? Math.abs(bal) * 120;
                            return (
                              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold font-mono bg-destructive/10 text-destructive dark:bg-destructive/20">
                                -৳{bdtAmt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            );
                          })()}
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
                totalItems={sorted.length}
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
        isAdmin
      />
    </div>
  );
}