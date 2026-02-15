import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Save, DollarSign, Receipt, CreditCard, TrendingUp } from "lucide-react";
import type { Json } from "@/integrations/supabase/types";

interface PricingConfig {
  mode: "default" | "flat" | "percentage";
  percentage?: number;
  flat_rates?: { meta?: number; tiktok?: number; google?: number };
}

export default function ClientDetail() {
  const { userId } = useParams<{ userId: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  // Editable state
  const [pricingMode, setPricingMode] = useState<"default" | "flat" | "percentage">("default");
  const [flatMeta, setFlatMeta] = useState("");
  const [flatTiktok, setFlatTiktok] = useState("");
  const [flatGoogle, setFlatGoogle] = useState("");
  const [percentage, setPercentage] = useState("");
  const [exchangeRate, setExchangeRate] = useState("");

  // Data
  const [spendData, setSpendData] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    if (!userId) return;
    loadAll();
  }, [userId]);

  async function loadAll() {
    setLoading(true);
    const [profileRes, adAccountsRes, paymentsRes, txRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId!).single(),
      supabase.from("ad_accounts").select("id, platform_name").eq("client_id", userId!),
      supabase.from("payment_requests").select("*").eq("client_id", userId!).order("created_at", { ascending: false }),
      supabase.from("transactions").select("*").eq("client_id", userId!).order("created_at", { ascending: false }),
    ]);

    if (profileRes.data) {
      const p = profileRes.data;
      setProfile(p);
      const pc = (p.pricing_config as unknown as PricingConfig) || { mode: "default" };
      setPricingMode(pc.mode || "default");
      setFlatMeta(String(pc.flat_rates?.meta ?? ""));
      setFlatTiktok(String(pc.flat_rates?.tiktok ?? ""));
      setFlatGoogle(String(pc.flat_rates?.google ?? ""));
      setPercentage(String(pc.percentage ?? ""));
      setExchangeRate(p.custom_exchange_rate ? String(p.custom_exchange_rate) : "");
    }

    // Spend data
    if (adAccountsRes.data?.length) {
      const accountIds = adAccountsRes.data.map((a) => a.id);
      const { data: spend } = await supabase
        .from("daily_ad_spend")
        .select("*, ad_accounts!inner(platform_name)")
        .in("ad_account_id", accountIds)
        .order("date", { ascending: false })
        .limit(100);
      setSpendData(spend || []);
    }

    setPayments(paymentsRes.data || []);
    setTransactions(txRes.data || []);
    setLoading(false);
  }

  async function handleSave() {
    if (!userId) return;
    setSaving(true);

    const pricingConfig: PricingConfig = { mode: pricingMode };
    if (pricingMode === "flat") {
      pricingConfig.flat_rates = {
        meta: flatMeta ? parseFloat(flatMeta) : undefined,
        tiktok: flatTiktok ? parseFloat(flatTiktok) : undefined,
        google: flatGoogle ? parseFloat(flatGoogle) : undefined,
      };
    } else if (pricingMode === "percentage") {
      pricingConfig.percentage = percentage ? parseFloat(percentage) : 0;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        pricing_config: pricingConfig as unknown as Json,
        custom_exchange_rate: exchangeRate ? parseFloat(exchangeRate) : null,
      })
      .eq("user_id", userId);

    setSaving(false);
    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: "Client pricing updated successfully." });
    }
  }

  const fmt = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtBdt = (n: number) =>
    `৳${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  // Spend aggregation by platform
  const spendByPlatform: Record<string, number> = spendData.reduce(
    (acc: Record<string, number>, s: any) => {
      const plat = s.ad_accounts?.platform_name || "unknown";
      acc[plat] = (acc[plat] || 0) + (s.final_billable_usd || 0);
      return acc;
    },
    {} as Record<string, number>
  );
  const totalSpend: number = Object.values(spendByPlatform).reduce((a, b) => a + b, 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="space-y-4">
        <Link to="/admin/clients" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to Client List
        </Link>
        <p className="text-muted-foreground">Client not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link to="/admin/clients" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to Client List
      </Link>

      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{profile.full_name}</CardTitle>
          <CardDescription>
            {profile.business_name && <span className="mr-3">{profile.business_name}</span>}
            {profile.email} {profile.phone && ` · ${profile.phone}`}
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="pricing" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pricing" className="gap-1"><DollarSign className="h-3.5 w-3.5 hidden sm:inline" /> Pricing</TabsTrigger>
          <TabsTrigger value="spend" className="gap-1"><TrendingUp className="h-3.5 w-3.5 hidden sm:inline" /> Spend</TabsTrigger>
          <TabsTrigger value="payments" className="gap-1"><CreditCard className="h-3.5 w-3.5 hidden sm:inline" /> Payments</TabsTrigger>
          <TabsTrigger value="transactions" className="gap-1"><Receipt className="h-3.5 w-3.5 hidden sm:inline" /> Transactions</TabsTrigger>
        </TabsList>

        {/* PRICING TAB */}
        <TabsContent value="pricing">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pricing Configuration</CardTitle>
              <CardDescription>Set per-platform dollar rates or percentage markup for this client.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Pricing Mode</Label>
                  <Select value={pricingMode} onValueChange={(v) => setPricingMode(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default (Global Rate)</SelectItem>
                      <SelectItem value="flat">Flat Rate (per platform)</SelectItem>
                      <SelectItem value="percentage">Percentage Markup</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Custom Exchange Rate (BDT/USD)</Label>
                  <Input
                    type="number"
                    placeholder="Leave empty for global rate"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                  />
                </div>
              </div>

              {pricingMode === "flat" && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Meta Rate ($/unit)</Label>
                    <Input type="number" placeholder="e.g. 120" value={flatMeta} onChange={(e) => setFlatMeta(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>TikTok Rate ($/unit)</Label>
                    <Input type="number" placeholder="e.g. 125" value={flatTiktok} onChange={(e) => setFlatTiktok(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Google Rate ($/unit)</Label>
                    <Input type="number" placeholder="e.g. 118" value={flatGoogle} onChange={(e) => setFlatGoogle(e.target.value)} />
                  </div>
                </div>
              )}

              {pricingMode === "percentage" && (
                <div className="max-w-xs space-y-2">
                  <Label>Markup Percentage (%)</Label>
                  <Input type="number" placeholder="e.g. 10" value={percentage} onChange={(e) => setPercentage(e.target.value)} />
                </div>
              )}

              <Button onClick={handleSave} disabled={saving} className="gap-2">
                <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Changes"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SPEND TAB */}
        <TabsContent value="spend">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ad Spend Summary</CardTitle>
              <CardDescription>Total: {fmt(totalSpend)}</CardDescription>
            </CardHeader>
            <CardContent>
              {Object.keys(spendByPlatform).length > 0 ? (
                <div className="mb-4 flex flex-wrap gap-3">
                    {Object.entries(spendByPlatform).map(([plat, amount]) => (
                      <Badge key={plat} variant="outline" className="gap-1 text-sm capitalize">
                        {plat}: {fmt(Number(amount))}
                      </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No spend data found.</p>
              )}
              {spendData.length > 0 && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Platform</TableHead>
                        <TableHead className="text-right">Raw Spend</TableHead>
                        <TableHead className="text-right">Billable USD</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {spendData.slice(0, 50).map((s: any) => (
                        <TableRow key={s.id}>
                          <TableCell className="text-sm">{s.date}</TableCell>
                          <TableCell className="text-sm">{s.campaign_name || "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs capitalize">
                              {s.ad_accounts?.platform_name}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {s.raw_spend_amount} {s.raw_currency}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmt(s.final_billable_usd)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PAYMENTS TAB */}
        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payment Requests</CardTitle>
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No payment requests.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead className="text-right">Amount (BDT)</TableHead>
                        <TableHead className="text-right">Credited (USD)</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((p: any) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-sm">{new Date(p.created_at).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{p.payment_method}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmtBdt(p.amount_bdt)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {p.final_amount_usd ? fmt(p.final_amount_usd) : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={p.status === "approved" ? "default" : p.status === "rejected" ? "destructive" : "secondary"}
                              className="text-xs"
                            >
                              {p.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TRANSACTIONS TAB */}
        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transaction History</CardTitle>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No transactions.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Amount (USD)</TableHead>
                        <TableHead className="hidden sm:table-cell">Description</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((t: any) => (
                        <TableRow key={t.id}>
                          <TableCell className="text-sm">{t.date}</TableCell>
                          <TableCell>
                            <Badge variant={t.type === "credit" ? "default" : "destructive"} className="text-xs">
                              {t.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmt(t.amount)}</TableCell>
                          <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                            {t.description || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{t.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
