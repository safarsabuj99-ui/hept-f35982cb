import { useEffect, useState, useCallback, useMemo } from "react";
import { useDeepLinkAction } from "@/hooks/useDeepLinkAction";
import { format } from "date-fns";
import { getPlatformRate } from "@/lib/pricing";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useImpersonation } from "@/hooks/useImpersonation";
import { useToast } from "@/hooks/use-toast";
import { ClientDateFilter, ClientDateRange, ClientDatePreset, getLocalTodayClient } from "@/components/ClientDateFilter";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardSkeleton } from "@/components/ui/premium-skeletons";
import { DepositFundsDialog } from "@/components/DepositFundsDialog";
import { cn } from "@/lib/utils";
import { debounce } from "@/lib/debounce";
import {
  Wallet, Plus, ArrowDown, ArrowUp, Banknote
} from "lucide-react";

const PLATFORM_COLORS: Record<string, string> = {
  meta: "hsl(var(--chart-meta))",
  tiktok: "hsl(var(--chart-tiktok))",
  google: "hsl(var(--chart-google))",
};
const PLATFORM_LABELS: Record<string, string> = { meta: "Meta", tiktok: "TikTok", google: "Google" };

interface Transaction {
  id: string; type: "credit" | "debit"; amount: number; platform: string | null;
  description: string | null; date: string; created_at: string;
}

export default function ClientWallet() {
  const { user } = useAuth();
  const { effectiveClientId } = useImpersonation();
  const { highlightId } = useDeepLinkAction();
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [paymentRequests, setPaymentRequests] = useState<any[]>([]);
  const [pricingConfig, setPricingConfig] = useState<any>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [depositOpen, setDepositOpen] = useState(false);
  const [dateRange, setDateRange] = useState<ClientDateRange | null>(() => { const t = getLocalTodayClient(); return { from: t, to: t }; });
  const [datePreset, setDatePreset] = useState<ClientDatePreset>("today");

  useEffect(() => {
    if (!effectiveClientId) return;
    supabase.from("profiles").select("pricing_config").eq("user_id", effectiveClientId).single()
      .then(({ data }) => { if (data?.pricing_config) setPricingConfig(data.pricing_config as any); });
  }, [effectiveClientId]);

  const fetchAll = useCallback(async () => {
    if (!effectiveClientId) return;
    const [{ data: txData }, { data: prs }] = await Promise.all([
      supabase.from("transactions").select("*").eq("client_id", effectiveClientId).order("date", { ascending: false }),
      supabase.from("payment_requests" as any).select("*").eq("client_id", effectiveClientId).order("created_at", { ascending: false }) as any,
    ]);
    setTransactions((txData as Transaction[]) ?? []);
    setPaymentRequests(prs ?? []);
    setInitialLoading(false);
  }, [effectiveClientId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Deep-link: show guard toast or highlight payment request
  useEffect(() => {
    if (!highlightId || initialLoading) return;
    if (highlightId === "guard") {
      toast({ title: "⚠️ Campaigns Paused", description: "Your campaigns were paused due to low balance. Add funds to resume." });
    } else {
      setTimeout(() => {
        document.getElementById(`wallet-pr-${highlightId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 500);
    }
  }, [highlightId, initialLoading]);

  // Filtered + debounced realtime — only this client's data, max once per 1.5s.
  useEffect(() => {
    if (!effectiveClientId) return;
    const debounced = debounce(() => fetchAll(), 1500);
    const channel = supabase
      .channel('client-wallet-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `client_id=eq.${effectiveClientId}` }, debounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_requests', filter: `client_id=eq.${effectiveClientId}` }, debounced)
      .subscribe();
    return () => { debounced.cancel(); supabase.removeChannel(channel); };
  }, [effectiveClientId, fetchAll]);

  const wallet = useMemo(() => computeWalletBalance(transactions), [transactions]);
  const balance = wallet.total;

  const platformBalances = useMemo(() => {
    const platforms = ["meta", "tiktok", "google"] as const;
    return platforms.map((p) => ({
      platform: p,
      label: PLATFORM_LABELS[p],
      balance: wallet.platforms[p],
      color: PLATFORM_COLORS[p],
    }));
  }, [wallet]);

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtBdt = (n: number) => `৳${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const getRate = (platform: string) => getPlatformRate(pricingConfig, platform);

  const handleDateChange = (range: ClientDateRange | null, p: ClientDatePreset) => {
    setDateRange(range);
    setDatePreset(p);
  };

  const filterByDate = useCallback((items: any[], dateField: string) => {
    if (!dateRange) return items;
    const fromStr = format(dateRange.from, "yyyy-MM-dd");
    const toStr = format(dateRange.to, "yyyy-MM-dd");
    return items.filter((item) => {
      const d = item[dateField]?.substring(0, 10);
      return d >= fromStr && d <= toStr;
    });
  }, [dateRange]);

  const visibleTransactions = useMemo(() => transactions.filter(t => !t.description?.startsWith("auto_spend:")), [transactions]);
  const filteredTransactions = useMemo(() => filterByDate(visibleTransactions, "date"), [visibleTransactions, filterByDate]);
  const filteredPaymentRequests = useMemo(() => {
    if (!dateRange) return paymentRequests;
    const fromStr = format(dateRange.from, "yyyy-MM-dd");
    const toStr = format(dateRange.to, "yyyy-MM-dd");
    return paymentRequests.filter((pr: any) => {
      const d = (pr.payment_date || pr.created_at)?.substring(0, 10);
      return d >= fromStr && d <= toStr;
    });
  }, [paymentRequests, dateRange]);

  const totalNegativeBdt = useMemo(() => {
    if (balance >= 0) return 0;
    return platformBalances.reduce((sum, pb) => {
      if (pb.balance < 0) return sum + Math.abs(pb.balance) * getRate(pb.platform);
      return sum;
    }, 0);
  }, [platformBalances, balance, pricingConfig]);

  if (initialLoading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6 md:space-y-8 max-w-5xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" /> Wallet
          </h1>
          <p className="text-sm text-muted-foreground">Manage your balances, transactions & payment requests</p>
        </div>
        <Button onClick={() => setDepositOpen(true)} className="gap-2 h-11 px-6 shadow-lg shadow-primary/20 press-effect w-full sm:w-auto" size="lg">
          <Plus className="h-4 w-4" /> Add Funds
        </Button>
      </div>

      {/* Main balance + platform balances */}
      <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2">
        <div className="glass-card glow-border p-5 md:p-6 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground sm:col-span-2 md:col-span-1">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-foreground/15 backdrop-blur-sm">
              <Wallet className="h-5 w-5" />
            </div>
            <p className="text-xs font-medium uppercase tracking-wider text-primary-foreground/70">Available Balance</p>
          </div>
          <p className="text-3xl md:text-5xl font-bold font-mono count-up">{fmt(balance)}</p>
          {balance < 0 && totalNegativeBdt > 0 && (
            <p className="text-base font-bold font-mono text-red-300 mt-1">-{fmtBdt(totalNegativeBdt)}</p>
          )}
        </div>

        <div className="sm:col-span-2 md:col-span-1">
          <div className="grid grid-cols-3 gap-3 h-full">
            {platformBalances.map((pb) => {
              const bdtAmount = pb.balance < 0 ? Math.abs(pb.balance) * getRate(pb.platform) : 0;
              return (
                <div key={pb.platform} className="glass-card glow-border p-3 md:p-4 flex flex-col items-center justify-center text-center">
                  <span className="h-2.5 w-2.5 rounded-full mb-1.5" style={{ background: pb.color }} />
                  <p className="text-[10px] md:text-xs font-medium text-muted-foreground uppercase tracking-wider">{pb.label}</p>
                  <p className={cn("text-base md:text-xl font-bold font-mono mt-1", pb.balance < 0 ? "text-destructive" : "")}>
                    {fmt(pb.balance)}
                  </p>
                  {pb.balance < 0 && (
                    <p className="text-[10px] font-bold font-mono text-destructive mt-0.5">-{fmtBdt(bdtAmount)}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Date Filter */}
      <ClientDateFilter onRangeChange={handleDateChange} activePreset={datePreset} />

      {/* Transaction History */}
      <div className="glass-card glow-border overflow-hidden">
        <div className="p-4 md:p-6 pb-0 flex items-center justify-between">
          <h3 className="font-semibold text-sm md:text-base flex items-center gap-2">
            Transaction History
            <Badge variant="secondary" className="text-[10px] font-normal">View Only</Badge>
          </h3>
        </div>
        <div className="p-4 md:p-6">
          {filteredTransactions.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground text-sm">No transactions for this period</p>
          ) : (
            <>
              {/* Mobile card view */}
              <div className="flex flex-col gap-2 md:hidden">
                {filteredTransactions.map((t) => (
                  <div key={t.id} className="mobile-card flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
                        t.type === "credit" ? "bg-emerald-500/10" : "bg-destructive/10"
                      )}>
                        {t.type === "credit" ? <ArrowDown className="h-4 w-4 text-emerald-500" /> : <ArrowUp className="h-4 w-4 text-destructive" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium capitalize">{t.type === "credit" ? "Deposit" : "Spend"}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          {t.platform ? ` · ${PLATFORM_LABELS[t.platform]}` : ""}
                        </p>
                      </div>
                    </div>
                    <span className={cn("font-mono text-sm font-medium shrink-0", t.type === "credit" ? "text-emerald-500" : "text-destructive")}>
                      {t.type === "credit" ? "+" : "-"}{fmt(Number(t.amount))}
                    </span>
                  </div>
                ))}
              </div>
              {/* Desktop table view */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50">
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.map((t) => (
                      <TableRow key={t.id} className="border-border/30 hover:bg-accent/50 transition-colors">
                        <TableCell className="whitespace-nowrap">{new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</TableCell>
                        <TableCell>
                          <Badge variant={t.type === "credit" ? "default" : "destructive"} className="capitalize">
                            {t.type === "credit" ? "Deposit" : "Spend"}
                          </Badge>
                        </TableCell>
                        <TableCell>{t.platform ? PLATFORM_LABELS[t.platform] : "—"}</TableCell>
                        <TableCell>{t.description || "—"}</TableCell>
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
            </>
          )}
        </div>
      </div>

      {/* Payment Requests */}
      {filteredPaymentRequests.length > 0 && (
        <div className="glass-card glow-border overflow-hidden">
          <div className="p-4 md:p-6 pb-0">
            <h3 className="font-semibold text-sm md:text-base flex items-center gap-2">
              <Banknote className="h-4 w-4 md:h-5 md:w-5 text-primary" /> Payment Requests
            </h3>
          </div>
          <div className="p-4 md:p-6">
            {/* Mobile card view */}
            <div className="flex flex-col gap-2 md:hidden">
              {filteredPaymentRequests.map((pr: any) => (
                <div key={pr.id} id={`wallet-pr-${pr.id}`} className={cn("mobile-card flex items-center justify-between gap-3", highlightId === pr.id && "deep-link-highlight")}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">{pr.payment_method}</Badge>
                      {pr.status === "pending" && <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/30">Pending</Badge>}
                      {pr.status === "approved" && <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/30">Approved</Badge>}
                      {pr.status === "rejected" && <Badge variant="destructive" className="text-[10px]">Rejected</Badge>}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(pr.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                    {pr.transaction_id && (
                      <p className="text-[10px] font-mono text-muted-foreground">TrxID: <span className="text-foreground">{pr.transaction_id}</span></p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-sm font-medium">৳{Number(pr.amount_bdt).toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
                    {pr.final_amount_usd && <p className="text-[10px] text-muted-foreground font-mono">${Number(pr.final_amount_usd).toFixed(2)}</p>}
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table view */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead>Date</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount (BDT)</TableHead>
                    <TableHead>TrxID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Credited (USD)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPaymentRequests.map((pr: any) => (
                    <TableRow key={pr.id} id={`wallet-pr-${pr.id}`} className={cn("border-border/30 hover:bg-accent/50 transition-colors", highlightId === pr.id && "deep-link-highlight")}>
                      <TableCell className="whitespace-nowrap">{new Date(pr.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</TableCell>
                      <TableCell><Badge variant="secondary">{pr.payment_method}</Badge></TableCell>
                      <TableCell className="text-right font-mono">৳{Number(pr.amount_bdt).toLocaleString("en-US", { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{pr.transaction_id || "—"}</TableCell>
                      <TableCell>
                        {pr.status === "pending" && <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">Pending</Badge>}
                        {pr.status === "approved" && <Badge variant="outline" className="bg-success/10 text-success border-success/30">Approved</Badge>}
                        {pr.status === "rejected" && <Badge variant="destructive">Rejected</Badge>}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {pr.final_amount_usd ? `$${Number(pr.final_amount_usd).toFixed(2)}` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      <DepositFundsDialog
        open={depositOpen}
        onOpenChange={setDepositOpen}
        clientId={effectiveClientId ?? undefined}
        onSuccess={fetchAll}
      />
    </div>
  );
}
