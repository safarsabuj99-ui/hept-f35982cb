import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SpendTrendChart } from "@/components/SpendTrendChart";
import { ClientDateFilter, ClientDateRange, ClientDatePreset } from "@/components/ClientDateFilter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Wallet, Zap, TrendingDown, TrendingUp, Clock, Info,
  Eye, Activity, Shield, ArrowDown, ArrowUp, Minus,
  Image as ImageIcon, ExternalLink, ChevronLeft, ChevronRight,
  Plus, Loader2, Banknote
} from "lucide-react";
import { PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const PLATFORM_COLORS: Record<string, string> = {
  meta: "hsl(214, 80%, 52%)",
  tiktok: "hsl(340, 75%, 55%)",
  google: "hsl(142, 60%, 45%)",
};
const PLATFORM_LABELS: Record<string, string> = { meta: "Meta", tiktok: "TikTok", google: "Google" };

interface Transaction {
  id: string; type: "credit" | "debit"; amount: number; platform: string | null;
  description: string | null; date: string; created_at: string;
}

// Mock creative data since no real API connected yet
function generateMockCreatives(adAccounts: any[], adSpend: any[], today: string) {
  if (adAccounts.length === 0) return [];
  return adAccounts.map((acc: any, idx: number) => {
    const todaySpend = adSpend
      .filter((s: any) => s.ad_account_id === acc.id && s.date === today)
      .reduce((sum: number, s: any) => sum + Number(s.final_billable_usd), 0);
    return {
      id: acc.id,
      title: `Campaign ${idx + 1} – ${PLATFORM_LABELS[acc.platform_name] || acc.platform_name}`,
      platform: acc.platform_name,
      isActive: acc.is_active,
      spendToday: todaySpend,
      thumbnail: null,
      adLink: null,
    };
  });
}

function WalletHealthBar({ balance, avgDailySpend }: { balance: number; avgDailySpend: number }) {
  const runwayDays = avgDailySpend > 0 ? balance / avgDailySpend : balance > 0 ? 999 : 0;
  const maxDays = 30;
  const progressValue = Math.min((runwayDays / maxDays) * 100, 100);

  const state = runwayDays < 1 ? "critical" : runwayDays < 3 ? "warning" : "healthy";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Wallet Runway</span>
        <span className={cn(
          "text-sm font-bold font-mono",
          state === "critical" && "text-destructive animate-pulse",
          state === "warning" && "text-orange-500",
          state === "healthy" && "text-emerald-500"
        )}>
          {runwayDays >= 999 ? "∞ days" : `~${Math.floor(runwayDays)} days`}
        </span>
      </div>
      <div className="relative">
        <Progress
          value={progressValue}
          className={cn(
            "h-3 rounded-full",
            state === "critical" && "[&>div]:bg-destructive",
            state === "warning" && "[&>div]:bg-orange-500",
            state === "healthy" && "[&>div]:bg-emerald-500"
          )}
        />
      </div>
      {state === "critical" && (
        <p className="text-xs text-destructive font-medium animate-pulse flex items-center gap-1">
          <Shield className="h-3 w-3" /> Low Balance — Contact your agency to top up
        </p>
      )}
      {state === "warning" && (
        <p className="text-xs text-orange-500 font-medium flex items-center gap-1">
          <Shield className="h-3 w-3" /> Balance running low — Consider adding funds soon
        </p>
      )}
      {state === "healthy" && avgDailySpend > 0 && (
        <p className="text-xs text-muted-foreground">
          Based on ${avgDailySpend.toFixed(2)}/day average spend
        </p>
      )}
    </div>
  );
}

function GrowthIndicator({ label, current, previous, invertBetter = false }: {
  label: string; current: number; previous: number; invertBetter?: boolean;
}) {
  if (previous === 0 && current === 0) return null;
  const pctChange = previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? 100 : 0;
  const isUp = pctChange > 0;
  // For CPR: lower is better (invertBetter=true). For Clicks: higher is better.
  const isPositive = invertBetter ? !isUp : isUp;
  const isNeutral = Math.abs(pctChange) < 1;

  return (
    <div className={cn(
      "flex items-center gap-1 text-xs font-medium mt-1",
      isNeutral ? "text-muted-foreground" : isPositive ? "text-emerald-500" : "text-muted-foreground"
    )}>
      {isNeutral ? (
        <><Minus className="h-3 w-3" /> No change</>
      ) : isUp ? (
        <><ArrowUp className="h-3 w-3" /> {Math.abs(pctChange).toFixed(0)}% {invertBetter ? "" : "Growth"}</>
      ) : (
        <><ArrowDown className="h-3 w-3" /> {Math.abs(pctChange).toFixed(0)}% {invertBetter ? "Better" : ""}</>
      )}
      <span className="text-muted-foreground/60 ml-1">vs last 30d</span>
    </div>
  );
}

function LiveCreativeGallery({ creatives, fmt }: { creatives: any[]; fmt: (n: number) => string }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedCreative, setSelectedCreative] = useState<any>(null);
  const [mobileIndex, setMobileIndex] = useState(0);

  if (creatives.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <ImageIcon className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No active ad creatives yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Creatives will appear here once campaigns are running</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" /> My Live Ads
          </h2>
          <Badge variant="secondary" className="text-xs">{creatives.length} Active</Badge>
        </div>

        {/* Desktop Masonry Grid */}
        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {creatives.map((c) => (
            <Card
              key={c.id}
              className="group cursor-pointer overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5"
              onClick={() => { setSelectedCreative(c); setPreviewOpen(true); }}
            >
              <div className="relative aspect-video bg-muted/50 flex items-center justify-center">
                {c.thumbnail ? (
                  <img src={c.thumbnail} alt={c.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground/40">
                    <ImageIcon className="h-8 w-8" />
                    <span className="text-xs">{PLATFORM_LABELS[c.platform] || c.platform}</span>
                  </div>
                )}
                {/* Overlay badges */}
                <div className="absolute top-2 left-2 flex gap-1.5">
                  {c.isActive && (
                    <Badge className="bg-emerald-500/90 text-white text-[10px] px-1.5 py-0.5 gap-1 border-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                      Active
                    </Badge>
                  )}
                </div>
                <div className="absolute bottom-2 right-2">
                  <Badge variant="secondary" className="bg-black/60 text-white text-[10px] px-1.5 py-0.5 border-0 font-mono">
                    Spend: {fmt(c.spendToday)}
                  </Badge>
                </div>
              </div>
              <CardContent className="p-3">
                <p className="text-sm font-medium truncate">{c.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{PLATFORM_LABELS[c.platform] || c.platform}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Mobile Carousel */}
        <div className="md:hidden">
          <Card className="overflow-hidden">
            <div className="relative aspect-video bg-muted/50 flex items-center justify-center">
              {creatives[mobileIndex]?.thumbnail ? (
                <img src={creatives[mobileIndex].thumbnail} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground/40">
                  <ImageIcon className="h-8 w-8" />
                  <span className="text-xs">{PLATFORM_LABELS[creatives[mobileIndex]?.platform] || ""}</span>
                </div>
              )}
              <div className="absolute top-2 left-2 flex gap-1.5">
                {creatives[mobileIndex]?.isActive && (
                  <Badge className="bg-emerald-500/90 text-white text-[10px] px-1.5 py-0.5 gap-1 border-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                    Active
                  </Badge>
                )}
              </div>
              <div className="absolute bottom-2 right-2">
                <Badge variant="secondary" className="bg-black/60 text-white text-[10px] px-1.5 py-0.5 border-0 font-mono">
                  Spend: {fmt(creatives[mobileIndex]?.spendToday || 0)}
                </Badge>
              </div>
              {creatives.length > 1 && (
                <>
                  <Button
                    variant="ghost" size="icon"
                    className="absolute left-1 top-1/2 -translate-y-1/2 h-8 w-8 bg-black/30 text-white hover:bg-black/50"
                    onClick={(e) => { e.stopPropagation(); setMobileIndex((i) => (i - 1 + creatives.length) % creatives.length); }}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 bg-black/30 text-white hover:bg-black/50"
                    onClick={(e) => { e.stopPropagation(); setMobileIndex((i) => (i + 1) % creatives.length); }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
            <CardContent
              className="p-3 cursor-pointer"
              onClick={() => { setSelectedCreative(creatives[mobileIndex]); setPreviewOpen(true); }}
            >
              <p className="text-sm font-medium truncate">{creatives[mobileIndex]?.title}</p>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-muted-foreground">{PLATFORM_LABELS[creatives[mobileIndex]?.platform] || ""}</p>
                <span className="text-xs text-muted-foreground">{mobileIndex + 1}/{creatives.length}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Preview Modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">{selectedCreative?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="aspect-video bg-muted/50 rounded-lg flex items-center justify-center overflow-hidden">
              {selectedCreative?.thumbnail ? (
                <img src={selectedCreative.thumbnail} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground/40">
                  <ImageIcon className="h-12 w-12" />
                  <span className="text-sm">Preview unavailable</span>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Platform</p>
                <p className="font-medium text-sm">{PLATFORM_LABELS[selectedCreative?.platform] || selectedCreative?.platform}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="font-medium text-sm flex items-center gap-1">
                  {selectedCreative?.isActive ? (
                    <><span className="h-2 w-2 rounded-full bg-emerald-500" /> Active</>
                  ) : (
                    <><span className="h-2 w-2 rounded-full bg-muted-foreground" /> Paused</>
                  )}
                </p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Today's Spend</p>
                <p className="font-medium text-sm font-mono">{fmt(selectedCreative?.spendToday || 0)}</p>
              </div>
            </div>
            {selectedCreative?.adLink && (
              <a
                href={selectedCreative.adLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-4 w-4" /> View Live Ad
              </a>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function ClientDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [adSpend, setAdSpend] = useState<any[]>([]);
  const [adAccounts, setAdAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  // Deposit modal state
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositBdt, setDepositBdt] = useState("");
  const [depositMethod, setDepositMethod] = useState("");
  const [depositTrxId, setDepositTrxId] = useState("");
  const [depositSubmitting, setDepositSubmitting] = useState(false);
  const [paymentRequests, setPaymentRequests] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState<ClientDateRange | null>(null);
  const [datePreset, setDatePreset] = useState<ClientDatePreset>("all_time");

  const today = new Date().toISOString().split("T")[0];

  const fetchAll = useCallback(async () => {
    if (!user) return;
    const [{ data: txData }, { data: accounts }] = await Promise.all([
      supabase.from("transactions").select("*").eq("client_id", user.id).order("date", { ascending: false }),
      supabase.from("ad_accounts" as any).select("*").eq("client_id", user.id) as any,
    ]);
    setTransactions((txData as Transaction[]) ?? []);
    setAdAccounts(accounts ?? []);

    const accIds = accounts?.map((a: any) => a.id) ?? [];
    if (accIds.length > 0) {
      const { data: spend } = await (supabase.from("daily_ad_spend" as any).select("*").in("ad_account_id", accIds).order("date", { ascending: false }) as any);
      setAdSpend(spend ?? []);
      if (spend?.[0]?.synced_at) setLastSynced(new Date(spend[0].synced_at).toLocaleString());
    }
    // Fetch payment requests
    const { data: prs } = await (supabase.from("payment_requests" as any).select("*").eq("client_id", user.id).order("created_at", { ascending: false }) as any);
    setPaymentRequests(prs ?? []);

    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!depositBdt || Number(depositBdt) <= 0 || !depositMethod || !user) return;
    setDepositSubmitting(true);
    const { error } = await (supabase.from("payment_requests" as any).insert({
      client_id: user.id,
      amount_bdt: Number(depositBdt),
      payment_method: depositMethod,
      transaction_id: depositTrxId || null,
    }) as any);
    setDepositSubmitting(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Request Submitted", description: "Your payment will be reviewed by the admin shortly." });
      setDepositOpen(false);
      setDepositBdt("");
      setDepositMethod("");
      setDepositTrxId("");
      fetchAll();
    }
  };

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('client-dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_ad_spend' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_requests' }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchAll]);

  // Balance always uses ALL transactions (unfiltered)
  const credits = transactions.filter((t) => t.type === "credit").reduce((s, t) => s + Number(t.amount), 0);
  const debits = transactions.filter((t) => t.type === "debit").reduce((s, t) => s + Number(t.amount), 0);
  const balance = credits - debits;
  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleDateChange = (range: ClientDateRange | null, p: ClientDatePreset) => {
    setDateRange(range);
    setDatePreset(p);
  };

  // Apply date filter to data
  const filterByDate = useCallback((items: any[], dateField: string) => {
    if (!dateRange) return items;
    return items.filter((item) => {
      const d = new Date(item[dateField]);
      return d >= dateRange.from && d <= dateRange.to;
    });
  }, [dateRange]);

  const filteredTransactions = useMemo(() => filterByDate(transactions, "date"), [transactions, filterByDate]);
  const filteredAdSpend = useMemo(() => filterByDate(adSpend, "date"), [adSpend, filterByDate]);
  const filteredPaymentRequests = useMemo(() => filterByDate(paymentRequests, "created_at"), [paymentRequests, filterByDate]);

  const todaySpend = adSpend
    .filter((s: any) => s.date === today)
    .reduce((sum: number, s: any) => sum + Number(s.final_billable_usd), 0);

  // 7-day avg spend (always unfiltered for wallet health)
  const last7 = adSpend.filter((s: any) => {
    const daysAgo = (Date.now() - new Date(s.date).getTime()) / 86400000;
    return daysAgo <= 7;
  });
  const avgDailySpend = last7.length > 0
    ? last7.reduce((s: number, r: any) => s + Number(r.final_billable_usd), 0) / 7
    : 0;

  // Filtered period spend for KPI cards
  const currentTotalSpend = filteredAdSpend.reduce((s: number, r: any) => s + Number(r.final_billable_usd), 0);

  // MoM comparison: current 30d vs previous 30d (always uses unfiltered for comparison)
  const now = Date.now();
  const current30d = adSpend.filter((s: any) => (now - new Date(s.date).getTime()) / 86400000 <= 30);
  const prev30d = adSpend.filter((s: any) => {
    const daysAgo = (now - new Date(s.date).getTime()) / 86400000;
    return daysAgo > 30 && daysAgo <= 60;
  });
  const prevTotalSpend = prev30d.reduce((s: number, r: any) => s + Number(r.final_billable_usd), 0);

  // Simulated clicks/CPR from filtered spend data
  const currentClicks = filteredAdSpend.length * 47;
  const prevClicks = prev30d.length * 47;
  const currentCPR = currentClicks > 0 ? currentTotalSpend / currentClicks : 0;
  const prevCPR = prevClicks > 0 ? prevTotalSpend / prevClicks : 0;

  // Platform breakdown (filtered)
  const platformSpend: Record<string, number> = {};
  for (const row of filteredAdSpend) {
    const acc = adAccounts.find((a: any) => a.id === row.ad_account_id);
    const platform = acc?.platform_name || "unknown";
    platformSpend[platform] = (platformSpend[platform] || 0) + Number(row.final_billable_usd);
  }
  const platformData = Object.entries(platformSpend)
    .map(([platform, value]) => ({ name: PLATFORM_LABELS[platform] || platform, value, platform }))
    .sort((a, b) => b.value - a.value);

  const creatives = useMemo(() => generateMockCreatives(adAccounts, adSpend, today), [adAccounts, adSpend, today]);

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}</div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">My Dashboard</h1>
          <p className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
            <Shield className="h-3.5 w-3.5" /> Read-only performance overview
            {lastSynced && (
              <span className="inline-flex items-center gap-1 text-xs ml-2">
                <Clock className="h-3 w-3" /> {lastSynced}
              </span>
            )}
          </p>
        </div>
        <Button onClick={() => setDepositOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Add Funds
        </Button>
      </div>

      {/* Date Filter */}
      <ClientDateFilter onRangeChange={handleDateChange} activePreset={datePreset} />

      {/* Smart Growth Indicators - KPI Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        {/* Balance + Wallet Health */}
        <Card className="relative overflow-hidden border-primary/20 sm:col-span-1">
          <div className="absolute inset-x-0 top-0 h-1 bg-primary rounded-t-lg" />
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Balance</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-3xl md:text-4xl font-bold font-mono text-primary">{fmt(balance)}</p>
            <WalletHealthBar balance={balance} avgDailySpend={avgDailySpend} />
          </CardContent>
        </Card>

        {/* Total Spend with MoM */}
        <Card className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-muted-foreground/30 rounded-t-lg" />
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted">
              <Zap className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{dateRange ? "Spend (Filtered)" : "Spend (30d)"}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl md:text-4xl font-bold font-mono">{fmt(currentTotalSpend)}</p>
            <GrowthIndicator label="Spend" current={currentTotalSpend} previous={prevTotalSpend} />
            <p className="text-xs text-muted-foreground mt-2">Today: {fmt(todaySpend)}</p>
          </CardContent>
        </Card>

        {/* CPR with MoM */}
        <Card className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-muted-foreground/30 rounded-t-lg" />
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted">
              <Activity className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cost Per Result</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl md:text-4xl font-bold font-mono">
              {currentCPR > 0 ? fmt(currentCPR) : "—"}
            </p>
            <GrowthIndicator label="CPR" current={currentCPR} previous={prevCPR} invertBetter />
            <p className="text-xs text-muted-foreground mt-2">
              ~{currentClicks.toLocaleString()} estimated actions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Live Creative Gallery */}
      <LiveCreativeGallery creatives={creatives} fmt={fmt} />

      {/* Platform Donut */}
      {platformData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Platform Spend Split</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={platformData} cx="50%" cy="50%" innerRadius={65} outerRadius={100} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {platformData.map((entry) => <Cell key={entry.platform} fill={PLATFORM_COLORS[entry.platform] || "#888"} />)}
                </Pie>
                <RTooltip formatter={(value: number) => fmt(value)} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Spend Trend */}
      {user && <SpendTrendChart clientId={user.id} />}

      {/* Transaction History (Read-Only) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            Transaction History
            <Badge variant="secondary" className="text-[10px] font-normal">View Only</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredTransactions.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No transactions for this period</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="hidden sm:table-cell">Platform</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="whitespace-nowrap">{new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</TableCell>
                      <TableCell>
                        <Badge variant={t.type === "credit" ? "default" : "destructive"} className="capitalize">
                          {t.type === "credit" ? "Deposit" : "Spend"}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{t.platform ? PLATFORM_LABELS[t.platform] : "—"}</TableCell>
                      <TableCell className="hidden md:table-cell">{t.description || "—"}</TableCell>
                      <TableCell className="text-right font-mono">
                        <span className={t.type === "credit" ? "text-emerald-500" : "text-destructive"}>
                          {t.type === "credit" ? "+" : "-"}{fmt(Number(t.amount))}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Requests History */}
      {filteredPaymentRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Banknote className="h-5 w-5" /> Payment Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount (BDT)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell text-right">Credited (USD)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPaymentRequests.map((pr: any) => (
                    <TableRow key={pr.id}>
                      <TableCell className="whitespace-nowrap">{new Date(pr.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</TableCell>
                      <TableCell><Badge variant="secondary">{pr.payment_method}</Badge></TableCell>
                      <TableCell className="text-right font-mono">৳{Number(pr.amount_bdt).toLocaleString("en-US", { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell>
                        {pr.status === "pending" && <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">Pending</Badge>}
                        {pr.status === "approved" && <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">Approved</Badge>}
                        {pr.status === "rejected" && <Badge variant="destructive">Rejected</Badge>}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-right font-mono">
                        {pr.final_amount_usd ? `$${Number(pr.final_amount_usd).toFixed(2)}` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deposit Modal */}
      <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-primary" /> Deposit Funds
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleDeposit} className="space-y-4">
            <div className="space-y-2">
              <Label>Amount (BDT)</Label>
              <Input
                type="number" step="0.01" min="1"
                value={depositBdt} onChange={(e) => setDepositBdt(e.target.value)}
                placeholder="৳ 0.00" required
              />
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={depositMethod} onValueChange={setDepositMethod} required>
                <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Bank">Bank Transfer</SelectItem>
                  <SelectItem value="bKash">bKash</SelectItem>
                  <SelectItem value="Nagad">Nagad</SelectItem>
                  <SelectItem value="Cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Transaction ID / Note (optional)</Label>
              <Input
                value={depositTrxId} onChange={(e) => setDepositTrxId(e.target.value)}
                placeholder="e.g. TrxID or reference"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDepositOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={depositSubmitting || !depositMethod || !depositBdt}>
                {depositSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Request
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
