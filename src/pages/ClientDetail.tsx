import { useState, useEffect, useMemo } from "react";
import { isActiveStatus } from "@/lib/campaignStatus";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useDeepLinkAction } from "@/hooks/useDeepLinkAction";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";
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
import { ArrowLeft, Save, DollarSign, Receipt, CreditCard, TrendingUp, Shield, Plus, User, KeyRound, Settings2, RefreshCw, CalendarIcon, Eye, Trash2, MonitorSmartphone, Check, ShoppingCart, Target, Radio, BarChart3, Lock, Loader2, Zap, Undo2 } from "lucide-react";
import { RefundDialog } from "@/components/RefundDialog";
import { CampaignRow } from "@/components/client-analytics/DeepDiveTable";
import { CampaignAnalyticsPanel } from "@/components/client-analytics/CampaignAnalyticsPanel";
import { TablePagination } from "@/components/TablePagination";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { AutomationConfigTab } from "@/components/AutomationConfigTab";
import { ClientProfitTab } from "@/components/ClientProfitTab";
import { DepositFundsDialog } from "@/components/DepositFundsDialog";
import { ClientDateFilter, type ClientDateRange, type ClientDatePreset, getLocalTodayClient } from "@/components/ClientDateFilter";
import { useKeywordAvailability } from "@/hooks/useKeywordAvailability";
import { KeywordAvailabilityHint } from "@/components/KeywordAvailabilityHint";
import { PlatformTransferDialog } from "@/components/PlatformTransferDialog";
import { format, startOfDay, endOfDay } from "date-fns";
import type { Json } from "@/integrations/supabase/types";

interface PricingConfig {
  flat_rates?: { meta?: number; tiktok?: number; google?: number };
  platform_rates?: { meta?: number; tiktok?: number; google?: number };
  percentage?: number;
}

const CLIENT_PASSWORD_MIN_LENGTH = 8;

function getClientPasswordValidationError(password: string) {
  if (password.length < CLIENT_PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${CLIENT_PASSWORD_MIN_LENGTH} characters.`;
  }

  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return "Password must include uppercase, lowercase, and a number.";
  }

  return null;
}

export default function ClientDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { tab: deepLinkTab } = useDeepLinkAction();
  const [activeTab, setActiveTab] = useState(deepLinkTab || "profile");
  const [depositOpen, setDepositOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [clientRole, setClientRole] = useState<string>("");

  // Profile editable state
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [mappingKeyword, setMappingKeyword] = useState("");

  // New sync config fields
  const [filterTag, setFilterTag] = useState("");
  const [dataFetchStartDate, setDataFetchStartDate] = useState("");
  const [preferredTimezone, setPreferredTimezone] = useState("Asia/Dhaka");

  // Pricing state
  const [flatMeta, setFlatMeta] = useState("145");
  const [flatTiktok, setFlatTiktok] = useState("150");
  const [flatGoogle, setFlatGoogle] = useState("155");
  const [percentage, setPercentage] = useState("");

  // Manager assignment
  const [managers, setManagers] = useState<{ user_id: string; full_name: string }[]>([]);
  const [assignedManager, setAssignedManager] = useState<string>("unassigned");

  // Password reset
  const [newPassword, setNewPassword] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);
  const passwordValidationError = useMemo(
    () => (newPassword ? getClientPasswordValidationError(newPassword) : null),
    [newPassword]
  );

  // Email correction (for typos made at creation time)
  const [currentEmail, setCurrentEmail] = useState<string>("");
  const [newEmail, setNewEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const emailFormatValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(newEmail.trim());

  // Data
  const [spendData, setSpendData] = useState<any[]>([]);
  const [spendCampaigns, setSpendCampaigns] = useState<any[]>([]);
  const [spendAdAccountMap, setSpendAdAccountMap] = useState<Record<string, string>>({});
  const [payments, setPayments] = useState<any[]>([]);
  const [refundDialog, setRefundDialog] = useState<{ open: boolean; request: any | null }>({ open: false, request: null });
  const [transactions, setTransactions] = useState<any[]>([]);

  // Ad Account assignments
  const [allAdAccounts, setAllAdAccounts] = useState<any[]>([]);
  const [adAccountAssignments, setAdAccountAssignments] = useState<any[]>([]);
  const [selectedAdAccountIds, setSelectedAdAccountIds] = useState<string[]>([]);
  const [newAdKeyword, setNewAdKeyword] = useState("");
  const [assigningSaving, setAssigningSaving] = useState(false);
  const [adAccountPopoverOpen, setAdAccountPopoverOpen] = useState(false);

  const profileKeywordAvailability = useKeywordAvailability({
    keyword: mappingKeyword,
    selfClientId: userId ?? null,
    enabled: !!userId,
  });
  const adAccountKeywordAvailability = useKeywordAvailability({
    keyword: newAdKeyword,
    selfClientId: userId ?? null,
    enabled: !!userId,
  });

  // Spend date filter
  const [spendDateRange, setSpendDateRange] = useState<ClientDateRange | null>(() => { const t = getLocalTodayClient(); return { from: t, to: t }; });
  const [spendDatePreset, setSpendDatePreset] = useState<ClientDatePreset>("today");

  useEffect(() => {
    if (!userId) return;
    loadAll();
  }, [userId]);

  async function loadAll() {
    setLoading(true);
    const [profileRes, adAccountClientsRes, paymentsRes, txRows, managersRes, roleRes, allAdAccountsRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId!).single(),
      supabase.from("ad_account_clients").select("id, ad_account_id, client_id, mapping_keyword").eq("client_id", userId!),
      supabase.from("payment_requests").select("id, amount_bdt, payment_method, status, created_at, final_amount_usd, admin_note, proof_image_url, platform, payment_date, exchange_rate_snapshot, platform_amounts, paid_to_account_id, org_id, client_id").eq("client_id", userId!).order("created_at", { ascending: false }),
      fetchAllRows<any>(() =>
        supabase
          .from("transactions")
          .select("id, client_id, type, amount, platform, date, created_at, status, description")
          .eq("client_id", userId!)
          .order("created_at", { ascending: false })
      ),
      supabase.from("user_roles").select("user_id").eq("role", "manager"),
      supabase.from("user_roles").select("role").eq("user_id", userId!).maybeSingle(),
      supabase.from("ad_accounts").select("id, account_name, platform_name, ad_account_id, is_active").order("account_name"),
    ]);
    const txRes = { data: txRows };

    if (roleRes.data) {
      setClientRole(roleRes.data.role);
    }

    // Load manager profiles
    if (managersRes.data?.length) {
      const managerIds = managersRes.data.map((r) => r.user_id);
      const { data: managerProfiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", managerIds);
      setManagers(managerProfiles || []);
    }

    if (profileRes.data) {
      const p = profileRes.data;
      setProfile(p);
      setFullName(p.full_name || "");
      setPhone(p.phone || "");
      setBusinessName(p.business_name || "");
      setMappingKeyword(p.mapping_keyword || "");
      setAssignedManager(p.manager_id || "unassigned");
      setFilterTag((p as any).ad_account_filter_tag || "");
      setDataFetchStartDate((p as any).data_fetch_start_date || "");
      setPreferredTimezone((p as any).preferred_timezone || "Asia/Dhaka");
      const pc = (p.pricing_config as unknown as PricingConfig) || {};
      const fr = pc.flat_rates || pc.platform_rates || {};
      setFlatMeta(String(fr.meta ?? "145"));
      setFlatTiktok(String(fr.tiktok ?? "150"));
      setFlatGoogle(String(fr.google ?? "155"));
      setPercentage(String(pc.percentage ?? ""));
    }

    // Store all ad accounts and build assignments with details
    const allAccs = allAdAccountsRes.data || [];
    setAllAdAccounts(allAccs);
    const assignmentRows = adAccountClientsRes.data || [];
    const enrichedAssignments = assignmentRows.map((a: any) => {
      const acc = allAccs.find((ac: any) => ac.id === a.ad_account_id);
      return { ...a, account_name: acc?.account_name || "Unknown", platform_name: acc?.platform_name || "unknown", ad_account_id_display: acc?.ad_account_id || "" };
    });
    setAdAccountAssignments(enrichedAssignments);

    // Spend data - load from new campaigns + daily_metrics tables
    if (assignmentRows.length) {
      const accountIds = assignmentRows.map((a: any) => a.ad_account_id);
      await loadSpendData(accountIds, { from: getLocalTodayClient(), to: getLocalTodayClient() });
    }

    const paymentRows = paymentsRes.data || [];
    const paymentIds = paymentRows.map((p: any) => p.id);
    let refundedMap: Record<string, number> = {};
    if (paymentIds.length) {
      const { data: refundRows } = await supabase
        .from("refunds" as any)
        .select("payment_request_id, amount_bdt, status")
        .in("payment_request_id", paymentIds);
      (refundRows || []).forEach((r: any) => {
        if (r.status === "approved" || r.status === "completed" || !r.status) {
          refundedMap[r.payment_request_id] = (refundedMap[r.payment_request_id] || 0) + Number(r.amount_bdt || 0);
        }
      });
    }
    setPayments(paymentRows.map((p: any) => ({ ...p, refunded_bdt: refundedMap[p.id] || 0 })));
    setTransactions(txRes.data || []);
    setLoading(false);
  }

  async function loadSpendData(accountIds: string[], range: ClientDateRange | null) {
    // Fetch ad account names
    const { data: adAccountsData } = await supabase
      .from("ad_accounts")
      .select("id, account_name")
      .in("id", accountIds);
    const nameMap: Record<string, string> = {};
    for (const acc of adAccountsData ?? []) {
      nameMap[acc.id] = acc.account_name;
    }
    setSpendAdAccountMap(nameMap);

    // Get campaigns for these ad accounts
    const { data: campaignsData } = await supabase
      .from("campaigns")
      .select("id, name, platform, status, ad_account_id")
      .in("ad_account_id", accountIds)
      .eq("client_id", userId);

    setSpendCampaigns(campaignsData ?? []);

    if (!campaignsData || campaignsData.length === 0) {
      setSpendData([]);
      return;
    }

    const campaignIds = campaignsData.map((c: any) => c.id);
    const metricsData = await fetchAllRows<any>(() => {
      let q = supabase
        .from("daily_metrics")
        .select("campaign_id, data_date, spend, impressions, clicks, results, conversion_value, synced_at, cpc, ctr, roas, reach, budget, cpm, purchase, add_to_cart, initiate_checkout, view_content, messaging_conversations, new_messaging_contacts, cost_per_purchase, cost_per_message, create_order, conversations_tiktok_dm, leads_tiktok_dm, conversations_instant_msg")
        .in("campaign_id", campaignIds)
        .order("data_date", { ascending: false });
      if (range) {
        q = q
          .gte("data_date", format(range.from, "yyyy-MM-dd"))
          .lte("data_date", format(range.to, "yyyy-MM-dd"));
      }
      return q;
    });

    // Enrich with campaign info
    const enriched = metricsData.map((m: any) => {
      const campaign = campaignsData.find((c: any) => c.id === m.campaign_id);
      return { ...m, campaign };
    });
    setSpendData(enriched);
  }

  async function handleSpendDateChange(range: ClientDateRange | null, preset: ClientDatePreset) {
    setSpendDateRange(range);
    setSpendDatePreset(preset);
    
    const { data: accounts } = await supabase.from("ad_account_clients").select("ad_account_id").eq("client_id", userId!);
    if (accounts?.length) {
      await loadSpendData(accounts.map((a: any) => a.ad_account_id), range);
    } else {
      setSpendData([]);
    }
  }

  async function handleSaveProfile() {
    if (!userId) return;
    setSaving(true);

    const { data, error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        phone: phone || null,
        business_name: businessName || null,
        mapping_keyword: mappingKeyword || null,
        manager_id: assignedManager === "unassigned" ? null : assignedManager,
        custom_exchange_rate: null,
        ad_account_filter_tag: filterTag || null,
        data_fetch_start_date: dataFetchStartDate || null,
        preferred_timezone: preferredTimezone || "Asia/Dhaka",
      } as any)
      .eq("user_id", userId)
      .select();

    setSaving(false);
    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } else if (!data || data.length === 0) {
      toast({ title: "Update failed", description: "No rows were updated.", variant: "destructive" });
    } else {
      setProfile(data[0]);
      toast({ title: "Saved", description: "Profile updated successfully." });
    }
  }

  async function handleSavePricing() {
    if (!userId) return;
    setSaving(true);

    const pricingConfig: PricingConfig = {
      flat_rates: {
        meta: flatMeta ? parseFloat(flatMeta) : 145,
        tiktok: flatTiktok ? parseFloat(flatTiktok) : 150,
        google: flatGoogle ? parseFloat(flatGoogle) : 155,
      },
      percentage: percentage ? parseFloat(percentage) : 0,
    };

    const { data, error } = await supabase
      .from("profiles")
      .update({
        pricing_config: pricingConfig as unknown as Json,
      })
      .eq("user_id", userId)
      .select();

    setSaving(false);
    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } else if (!data || data.length === 0) {
      toast({ title: "Update failed", description: "No rows were updated.", variant: "destructive" });
    } else {
      setProfile(data[0]);
      toast({ title: "Saved", description: "Pricing updated successfully." });
    }
  }

  async function handlePasswordReset() {
    if (!userId || !newPassword) return;
    if (passwordValidationError) {
      toast({ title: "Reset failed", description: passwordValidationError, variant: "destructive" });
      return;
    }
    setResettingPassword(true);
    try {
      const response = await supabase.functions.invoke("reset-client-password", {
        body: { user_id: userId, new_password: newPassword },
      });
      if (response.error) {
        let detail = response.error.message || "Password reset failed.";
        try {
          const ctx: any = (response.error as any).context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            if (body?.error) detail = typeof body.error === "string" ? body.error : JSON.stringify(body.error);
          } else if (ctx && typeof ctx.text === "function") {
            const text = await ctx.text();
            if (text) {
              try { const parsed = JSON.parse(text); if (parsed?.error) detail = parsed.error; }
              catch { detail = text; }
            }
          }
        } catch { /* keep generic */ }
        toast({ title: "Reset failed", description: detail, variant: "destructive" });
      } else {
        setNewPassword("");
        toast({ title: "Password Reset", description: "Client password has been updated." });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setResettingPassword(false);
  }

  async function handleCorrectEmail() {
    if (!userId || !newEmail.trim() || !emailFormatValid) return;
    setSavingEmail(true);
    try {
      const response = await supabase.functions.invoke("update-client-email", {
        body: { user_id: userId, new_email: newEmail.trim().toLowerCase() },
      });
      if (response.error || response.data?.error) {
        let detail = response.data?.error || response.error?.message || "Failed to update email.";
        try {
          const ctx: any = (response.error as any)?.context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            if (body?.error) detail = typeof body.error === "string" ? body.error : JSON.stringify(body.error);
          }
        } catch { /* keep generic */ }
        toast({ title: "Update failed", description: detail, variant: "destructive" });
      } else {
        setCurrentEmail(response.data?.email ?? newEmail.trim().toLowerCase());
        setNewEmail("");
        toast({ title: "Email updated", description: "The client can now sign in with the new email." });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSavingEmail(false);
  }

  async function handleAssignAdAccount() {
    if (!selectedAdAccountIds.length || !userId) return;
    setAssigningSaving(true);
    const rows = selectedAdAccountIds.map((id) => ({
      ad_account_id: id,
      client_id: userId,
      mapping_keyword: newAdKeyword || "",
    }));
    const { error } = await supabase.from("ad_account_clients").insert(rows);
    if (error) {
      setAssigningSaving(false);
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    
    // Trigger sync to collect data for new mapping (only if keyword provided)
    if (newAdKeyword.trim()) {
      toast({ title: "Syncing...", description: "Fetching data for new mapping." });
      await supabase.functions.invoke("sync-fast-lane", { body: { client_id: userId } });
    }
    
    setAssigningSaving(false);
    setSelectedAdAccountIds([]);
    setNewAdKeyword("");
    toast({ title: "Assigned", description: `${rows.length} ad account(s) linked to this client.` });
    loadAll();
  }

  async function handleRemoveAdAccount(assignmentId: string) {
    const { error } = await supabase.from("ad_account_clients").delete().eq("id", assignmentId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Removed", description: "Ad account unlinked." });
      loadAll();
    }
  }

  const fmt = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtBdt = (n: number) =>
    `৳${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const safeDivide = (a: number, b: number) => (b > 0 ? a / b : 0);

  // Aggregate by campaign_id (same as ClientReports)
  const spendCampaignRows: CampaignRow[] = useMemo(() => {
    const map: Record<string, CampaignRow> = {};
    for (const row of spendData) {
      const key = row.campaign_id;
      if (!map[key]) {
        const adAccountId = row.campaign?.ad_account_id;
        map[key] = {
          campaign_name: row.campaign?.name || "Unknown",
          platform: row.campaign?.platform || "unknown",
          status: row.campaign?.status ?? "active",
          ad_account_name: adAccountId ? spendAdAccountMap[adAccountId] || "" : "",
          campaign_id: row.campaign?.id,
          impressions: 0, clicks: 0, spend: 0, results: 0, conversion_value: 0,
        };
      }
      map[key].impressions += Number(row.impressions);
      map[key].clicks += Number(row.clicks);
      map[key].spend += Number(row.spend);
      map[key].results += Number(row.results ?? 0);
      map[key].conversion_value += Number(row.conversion_value ?? 0);
    }
    for (const c of spendCampaigns) {
      if (isActiveStatus(c.status) && !map[c.id]) {
        map[c.id] = {
          campaign_name: c.name || "Unknown",
          platform: c.platform || "unknown",
          status: c.status,
          ad_account_name: c.ad_account_id ? spendAdAccountMap[c.ad_account_id] || "" : "",
          campaign_id: c.id,
          impressions: 0, clicks: 0, spend: 0, results: 0, conversion_value: 0,
        };
      }
    }
    return Object.values(map).filter(r =>
      isActiveStatus(r.status) || r.spend > 0 || r.impressions > 0 || r.clicks > 0 || r.results > 0
    );
  }, [spendData, spendAdAccountMap, spendCampaigns]);

  const spendTotals = useMemo(() => {
    const t = { spend: 0, impressions: 0, clicks: 0, results: 0, convValue: 0 };
    for (const r of spendCampaignRows) {
      t.spend += r.spend; t.impressions += r.impressions; t.clicks += r.clicks;
      t.results += r.results; t.convValue += r.conversion_value;
    }
    return t;
  }, [spendCampaignRows]);

  const spendAvgRoas = safeDivide(spendTotals.convValue, spendTotals.spend);
  const spendAvgCpo = safeDivide(spendTotals.spend, spendTotals.results);

  const spendPlatformStats = useMemo(() => {
    const map: Record<string, { platform: string; totalSpend: number; totalResults: number; totalConversionValue: number }> = {};
    for (const r of spendCampaignRows) {
      if (!map[r.platform]) map[r.platform] = { platform: r.platform, totalSpend: 0, totalResults: 0, totalConversionValue: 0 };
      map[r.platform].totalSpend += r.spend;
      map[r.platform].totalResults += r.results;
      map[r.platform].totalConversionValue += r.conversion_value;
    }
    return Object.values(map);
  }, [spendCampaignRows]);

  const spendActiveCampaigns = spendCampaignRows.filter(r => r.status === "active").length;
  const spendMetaRows = useMemo(() => spendCampaignRows.filter(r => r.platform === "meta"), [spendCampaignRows]);
  const spendTiktokRows = useMemo(() => spendCampaignRows.filter(r => r.platform === "tiktok"), [spendCampaignRows]);
  const spendGoogleRows = useMemo(() => spendCampaignRows.filter(r => r.platform === "google"), [spendCampaignRows]);

  const reloadSpendData = async () => {
    const { data: accounts } = await supabase.from("ad_account_clients").select("ad_account_id").eq("client_id", userId!);
    if (accounts?.length) {
      await loadSpendData(accounts.map((a: any) => a.ad_account_id), spendDateRange);
    }
  };

  const [deepDiveSyncing, setDeepDiveSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{
    active: boolean;
    total: number;
    done: number;
    failed: number;
    processing: number;
    pending: number;
    completed: boolean;
    timedOut: boolean;
  }>({ active: false, total: 0, done: 0, failed: 0, processing: 0, pending: 0, completed: false, timedOut: false });

  // Refs to manage poll/timeout lifecycle without re-renders
  const syncPollRef = useState<{ interval: any; timeout: any; hide: any }>({ interval: null, timeout: null, hide: null })[0];

  const cleanupSyncTrackers = () => {
    if (syncPollRef.interval) { clearInterval(syncPollRef.interval); syncPollRef.interval = null; }
    if (syncPollRef.timeout) { clearTimeout(syncPollRef.timeout); syncPollRef.timeout = null; }
    if (syncPollRef.hide) { clearTimeout(syncPollRef.hide); syncPollRef.hide = null; }
  };

  useEffect(() => () => cleanupSyncTrackers(), []);

  const handleClientDeepDiveSync = async () => {
    if (!userId || deepDiveSyncing) return;
    setDeepDiveSyncing(true);
    cleanupSyncTrackers();
    setSyncProgress({ active: true, total: 0, done: 0, failed: 0, processing: 0, pending: 0, completed: false, timedOut: false });
    try {
      const { data: accounts } = await supabase
        .from("ad_account_clients")
        .select("ad_account_id")
        .eq("client_id", userId);
      const accountIds = (accounts ?? []).map((a: any) => a.ad_account_id);
      if (accountIds.length === 0) {
        toast({ title: "No ad accounts", description: "This client has no linked ad accounts.", variant: "destructive" });
        setDeepDiveSyncing(false);
        setSyncProgress((p) => ({ ...p, active: false }));
        return;
      }
      const startedAtIso = new Date(Date.now() - 2000).toISOString(); // small back-buffer
      const { data, error } = await supabase.functions.invoke("sync-orchestrator", {
        body: { function: "sync-deep-dive", client_id: userId, ad_account_ids: accountIds },
      });
      if (error) throw error;
      const enq = (data as any)?.enqueued ?? 0;
      toast({
        title: "Deep Dive Sync Queued",
        description: `Queued ${enq} job(s) across ${accountIds.length} ad account(s).`,
      });
      setSyncProgress((p) => ({ ...p, total: enq }));

      // Poll sync_jobs to compute real progress
      const pollOnce = async () => {
        const { data: jobs } = await supabase
          .from("sync_jobs")
          .select("status")
          .eq("function_name", "sync-deep-dive")
          .in("ad_account_id", accountIds)
          .gte("created_at", startedAtIso);
        const rows = (jobs ?? []) as Array<{ status: string }>;
        const total = rows.length;
        let done = 0, failed = 0, processing = 0, pending = 0;
        for (const r of rows) {
          if (r.status === "done") done++;
          else if (r.status === "failed") failed++;
          else if (r.status === "processing") processing++;
          else pending++;
        }
        const allFinished = total > 0 && pending === 0 && processing === 0;
        setSyncProgress((prev) => ({
          ...prev,
          total: Math.max(prev.total, total),
          done, failed, processing, pending,
          completed: allFinished,
        }));
        if (allFinished) {
          cleanupSyncTrackers();
          reloadSpendData();
          syncPollRef.hide = setTimeout(() => {
            setSyncProgress((p) => ({ ...p, active: false }));
          }, 4000);
          setDeepDiveSyncing(false);
        }
      };
      // initial fetch + interval
      pollOnce();
      syncPollRef.interval = setInterval(pollOnce, 2500);
      // 5-minute hard timeout
      syncPollRef.timeout = setTimeout(() => {
        cleanupSyncTrackers();
        setSyncProgress((p) => ({ ...p, timedOut: true, completed: true }));
        reloadSpendData();
        setDeepDiveSyncing(false);
        syncPollRef.hide = setTimeout(() => setSyncProgress((p) => ({ ...p, active: false })), 6000);
      }, 5 * 60 * 1000);
    } catch (err: any) {
      toast({ title: "Sync failed", description: err.message || "Could not queue deep dive sync.", variant: "destructive" });
      cleanupSyncTrackers();
      setSyncProgress((p) => ({ ...p, active: false }));
      setDeepDiveSyncing(false);
    }
  };


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

  const roleBadgeColor = clientRole === "admin" ? "destructive" : clientRole === "manager" ? "secondary" : "default";

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link to="/admin/clients" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to Client List
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{profile.full_name}</h1>
          <Badge variant={roleBadgeColor} className="capitalize text-xs">
            {clientRole || "client"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-2" onClick={() => navigate(`/dashboard?impersonate=${userId}`)}>
            <Eye className="h-3.5 w-3.5" /> View as Client
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setDepositOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add Funds
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex w-full overflow-x-auto scrollbar-hide h-auto p-1 justify-start">
          <TabsTrigger value="profile" className="gap-1 shrink-0 text-xs px-2.5 py-1.5"><User className="h-3.5 w-3.5 hidden sm:inline" /> Profile</TabsTrigger>
          <TabsTrigger value="pricing" className="gap-1 shrink-0 text-xs px-2.5 py-1.5"><DollarSign className="h-3.5 w-3.5 hidden sm:inline" /> Pricing</TabsTrigger>
          <TabsTrigger value="automation" className="gap-1 shrink-0 text-xs px-2.5 py-1.5"><Shield className="h-3.5 w-3.5 hidden sm:inline" /> Ad Guard</TabsTrigger>
          <TabsTrigger value="adaccounts" className="gap-1 shrink-0 text-xs px-2.5 py-1.5"><MonitorSmartphone className="h-3.5 w-3.5 hidden sm:inline" /> Accounts</TabsTrigger>
          <TabsTrigger value="spend" className="gap-1 shrink-0 text-xs px-2.5 py-1.5"><TrendingUp className="h-3.5 w-3.5 hidden sm:inline" /> Spend</TabsTrigger>
          <TabsTrigger value="profit" className="gap-1 shrink-0 text-xs px-2.5 py-1.5"><TrendingUp className="h-3.5 w-3.5 hidden sm:inline" /> Profit</TabsTrigger>
          <TabsTrigger value="payments" className="gap-1 shrink-0 text-xs px-2.5 py-1.5"><CreditCard className="h-3.5 w-3.5 hidden sm:inline" /> Payments</TabsTrigger>
          <TabsTrigger value="transactions" className="gap-1 shrink-0 text-xs px-2.5 py-1.5"><Receipt className="h-3.5 w-3.5 hidden sm:inline" /> Transactions</TabsTrigger>
        </TabsList>

        {/* PROFILE TAB */}
        <TabsContent value="profile" className="space-y-4">
          {/* Account Info */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Account Information</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Account Type</Label>
                  <div>
                    <Badge variant={roleBadgeColor} className="capitalize">{clientRole || "client"}</Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-muted-foreground text-xs uppercase tracking-wide">Email</Label>
                  <Input id="email" value={profile.email} disabled className="bg-muted" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="text-muted-foreground text-xs uppercase tracking-wide">Full Name</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-muted-foreground text-xs uppercase tracking-wide">Phone</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="businessName" className="text-muted-foreground text-xs uppercase tracking-wide">Business Name</Label>
                  <Input id="businessName" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Business name" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Password Reset */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Password</CardTitle>
              </div>
              <CardDescription>Set a new password for this client's account.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-3 max-w-md">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="newPassword" className="text-muted-foreground text-xs uppercase tracking-wide">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    maxLength={128}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use at least 8 characters with uppercase, lowercase, and a number.
                  </p>
                  {newPassword && passwordValidationError ? (
                    <p className="text-xs text-destructive">{passwordValidationError}</p>
                  ) : null}
                </div>
                <Button onClick={handlePasswordReset} disabled={resettingPassword || !newPassword || !!passwordValidationError} variant="secondary" className="gap-2">
                  <KeyRound className="h-3.5 w-3.5" />
                  {resettingPassword ? "Resetting…" : "Reset"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Email Correction */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Login Email</CardTitle>
              </div>
              <CardDescription>
                Fix typos in the client's sign-in email. The client will use the new address to log in immediately.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-3 max-w-md">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="correctEmail" className="text-muted-foreground text-xs uppercase tracking-wide">New Email</Label>
                  <Input
                    id="correctEmail"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    onBlur={(e) => setNewEmail(e.target.value.trim())}
                    placeholder="name@example.com"
                    aria-invalid={newEmail.length > 0 && !emailFormatValid}
                    aria-describedby={newEmail.length > 0 && !emailFormatValid ? "correctEmail-error" : undefined}
                  />
                  {newEmail.length > 0 && !emailFormatValid && (
                    <p id="correctEmail-error" className="text-xs text-destructive">
                      Enter a complete email address, e.g. name@example.com
                    </p>
                  )}
                </div>
                <Button
                  onClick={handleCorrectEmail}
                  disabled={savingEmail || !newEmail.trim() || !emailFormatValid}
                  variant="secondary"
                  className="gap-2"
                >
                  {savingEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {savingEmail ? "Saving…" : "Update"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Mapping & Assignment */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Mapping & Assignment</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mappingKeyword" className="text-muted-foreground text-xs uppercase tracking-wide">Mapping Keyword</Label>
                  <Input id="mappingKeyword" value={mappingKeyword} onChange={(e) => setMappingKeyword(e.target.value)} placeholder="e.g. alpha" />
                  <KeywordAvailabilityHint availability={profileKeywordAvailability} />
                  <p className="text-xs text-muted-foreground">Used to attribute ad spend from shared accounts by matching campaign names. Must be unique across the agency.</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Assigned Manager</Label>
                  <Select value={assignedManager} onValueChange={setAssignedManager}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select manager" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {managers.map((m) => (
                        <SelectItem key={m.user_id} value={m.user_id}>{m.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sync Configuration */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Sync Configuration</CardTitle>
              </div>
              <CardDescription>Configure how ad data is synced for this client.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="filterTag" className="text-muted-foreground text-xs uppercase tracking-wide">Filter Tag</Label>
                  <Input id="filterTag" value={filterTag} onChange={(e) => setFilterTag(e.target.value)} placeholder='e.g. [ASIF]' />
                  <p className="text-xs text-muted-foreground">Only sync campaigns containing this tag in their name.</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Data Start Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !dataFetchStartDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dataFetchStartDate ? format(new Date(dataFetchStartDate + "T00:00:00"), "PPP") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dataFetchStartDate ? new Date(dataFetchStartDate + "T00:00:00") : undefined}
                        onSelect={(date) => setDataFetchStartDate(date ? format(date, "yyyy-MM-dd") : "")}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                  <p className="text-xs text-muted-foreground">Ignore API data before this date.</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Timezone</Label>
                  <Select value={preferredTimezone} onValueChange={setPreferredTimezone}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Asia/Dhaka">Asia/Dhaka (UTC+6)</SelectItem>
                      <SelectItem value="UTC">UTC</SelectItem>
                      <SelectItem value="America/New_York">America/New_York (ET)</SelectItem>
                      <SelectItem value="America/Los_Angeles">America/Los_Angeles (PT)</SelectItem>
                      <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
                      <SelectItem value="Asia/Dubai">Asia/Dubai (GST)</SelectItem>
                      <SelectItem value="Asia/Kolkata">Asia/Kolkata (IST)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Timezone for date normalization during sync.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Client Access Permissions */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Client Access</CardTitle>
              </div>
              <CardDescription>Control what this client can see and do in their dashboard.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const perms = (profile?.client_permissions as any) || {};
                const legacy = perms.can_toggle_campaigns === true;
                const canPause = perms.can_pause_campaigns === true || legacy;
                const canResume = perms.can_resume_campaigns === true || legacy;
                const mode: "off" | "pause" | "resume" | "both" =
                  canPause && canResume ? "both" : canPause ? "pause" : canResume ? "resume" : "off";

                const setMode = async (next: "off" | "pause" | "resume" | "both") => {
                  const newPerms = {
                    ...perms,
                    can_pause_campaigns: next === "pause" || next === "both",
                    can_resume_campaigns: next === "resume" || next === "both",
                  };
                  // Clear legacy flag now that we've explicitly set the new ones.
                  delete newPerms.can_toggle_campaigns;
                  const { data, error } = await supabase
                    .from("profiles")
                    .update({ client_permissions: newPerms } as any)
                    .eq("user_id", userId!)
                    .select();
                  if (error) {
                    toast({ title: "Error", description: error.message, variant: "destructive" });
                  } else if (data?.[0]) {
                    setProfile(data[0]);
                    const labels = { off: "Disabled", pause: "Pause only", resume: "Resume only", both: "Pause + Resume" };
                    toast({ title: "Permission Updated", description: `Campaign control set to: ${labels[next]}.` });
                  }
                };

                const options: Array<{ value: "off" | "pause" | "resume" | "both"; label: string; hint: string }> = [
                  { value: "off", label: "Disabled", hint: "Client cannot pause or resume campaigns." },
                  { value: "pause", label: "Pause only", hint: "Client can stop active campaigns but cannot restart paused ones." },
                  { value: "resume", label: "Resume only", hint: "Client can restart paused campaigns but cannot pause active ones." },
                  { value: "both", label: "Pause + Resume", hint: "Full on/off control over their campaigns." },
                ];

                return (
                  <div className="space-y-3 max-w-2xl">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Campaign On/Off Control</Label>
                      <p className="text-xs text-muted-foreground">{options.find(o => o.value === mode)?.hint}</p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {options.map(o => {
                        const active = mode === o.value;
                        return (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() => setMode(o.value)}
                            className={`text-left rounded-lg border px-3 py-2.5 transition-all ${
                              active
                                ? "border-primary bg-primary/10 ring-1 ring-primary/40 shadow-sm"
                                : "border-border/60 bg-card hover:border-border hover:bg-muted/40"
                            }`}
                          >
                            <div className={`text-xs font-semibold ${active ? "text-primary" : "text-foreground"}`}>{o.label}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          <Button onClick={handleSaveProfile} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Changes"}
          </Button>
        </TabsContent>

        {/* PRICING TAB */}
        <TabsContent value="pricing">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pricing Configuration</CardTitle>
              <CardDescription>Set per-platform billing rates and optional percentage markup.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Platform Rates (USD → BDT)</Label>
                <p className="text-xs text-muted-foreground mb-2">How much BDT to charge per USD of ad spend on each platform</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Meta Rate</Label>
                    <Input type="number" placeholder="145" value={flatMeta} onChange={(e) => setFlatMeta(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>TikTok Rate</Label>
                    <Input type="number" placeholder="150" value={flatTiktok} onChange={(e) => setFlatTiktok(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Google Rate</Label>
                    <Input type="number" placeholder="155" value={flatGoogle} onChange={(e) => setFlatGoogle(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="max-w-xs space-y-2">
                <Label>Percentage Markup (optional)</Label>
                <Input type="number" placeholder="e.g. 10" value={percentage} onChange={(e) => setPercentage(e.target.value)} />
                <p className="text-xs text-muted-foreground">For USD-billing — % on top of spend (0 = none)</p>
              </div>

              <Button onClick={handleSavePricing} disabled={saving} className="gap-2">
                <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Changes"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AUTOMATION TAB */}
        <TabsContent value="automation">
          <AutomationConfigTab
            userId={userId!}
            clientName={profile?.full_name || ""}
            autoPauseBalanceUsd={Number((profile as any)?.auto_pause_balance_usd ?? 5)}
            overdraftLimit={Number(profile?.overdraft_limit_usd ?? 0)}
            systemPausedCampaigns={
              Array.isArray(profile?.system_paused_campaigns)
                ? profile.system_paused_campaigns
                : []
            }
            guardPausedAt={(profile as any)?.guard_paused_at || null}
            guardResumeWindowHours={Number((profile as any)?.guard_resume_window_hours ?? 24)}
            onSaved={loadAll}
          />
        </TabsContent>

        {/* AD ACCOUNTS TAB */}
        <TabsContent value="adaccounts">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assigned Ad Accounts</CardTitle>
              <CardDescription>Manage which ad accounts are linked to this client.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Assignment Form */}
              <div className="flex flex-col sm:flex-row items-end gap-3">
                <div className="flex-1 space-y-2 w-full">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Ad Accounts</Label>
                  <Popover open={adAccountPopoverOpen} onOpenChange={setAdAccountPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start font-normal h-10">
                        {selectedAdAccountIds.length > 0
                          ? `${selectedAdAccountIds.length} account(s) selected`
                          : "Select ad accounts..."}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[320px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search accounts..." />
                        <CommandList>
                          <CommandEmpty>No accounts found.</CommandEmpty>
                          <CommandGroup>
                            {allAdAccounts
                              .filter((ac: any) => !adAccountAssignments.some((a: any) => a.ad_account_id === ac.id))
                              .map((ac: any) => {
                                const isSelected = selectedAdAccountIds.includes(ac.id);
                                return (
                                  <CommandItem
                                    key={ac.id}
                                    onSelect={() => {
                                      setSelectedAdAccountIds((prev) =>
                                        isSelected ? prev.filter((id) => id !== ac.id) : [...prev, ac.id]
                                      );
                                    }}
                                  >
                                    <Checkbox checked={isSelected} className="mr-2" />
                                    <span className="truncate">{ac.account_name || ac.ad_account_id}</span>
                                    <Badge variant="outline" className="ml-auto text-[10px] capitalize">{ac.platform_name}</Badge>
                                  </CommandItem>
                                );
                              })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
          </div>


                <div className="space-y-2 w-full sm:w-48">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Mapping Keyword</Label>
                  <Input value={newAdKeyword} onChange={(e) => setNewAdKeyword(e.target.value)} placeholder="e.g. alpha" />
                  <KeywordAvailabilityHint availability={adAccountKeywordAvailability} />
                </div>
                <Button onClick={handleAssignAdAccount} disabled={assigningSaving || !selectedAdAccountIds.length} className="gap-2">
                  <Plus className="h-3.5 w-3.5" /> Assign {selectedAdAccountIds.length > 1 ? `(${selectedAdAccountIds.length})` : ""}
                </Button>
              </div>

              {/* Assignments Table */}
              {adAccountAssignments.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No ad accounts assigned.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account Name</TableHead>
                        <TableHead>Platform</TableHead>
                        <TableHead>Account ID</TableHead>
                        <TableHead>Keyword</TableHead>
                        <TableHead className="w-20"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adAccountAssignments.map((a: any) => (
                        <TableRow key={a.id}>
                          <TableCell className="text-sm font-medium">{a.account_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs capitalize">{a.platform_name}</Badge>
                          </TableCell>
                          <TableCell className="text-sm font-mono text-muted-foreground">{a.ad_account_id_display}</TableCell>
                          <TableCell className="text-sm">{a.mapping_keyword || "—"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => navigate(`/admin/ad-accounts/${a.ad_account_id}`)}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleRemoveAdAccount(a.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
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

        {/* SPEND TAB */}
        <TabsContent value="spend" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 min-w-0">
              <ClientDateFilter onRangeChange={handleSpendDateChange} activePreset={spendDatePreset} />
            </div>
            <Button
              onClick={handleClientDeepDiveSync}
              disabled={deepDiveSyncing}
              variant="outline"
              size="sm"
              className="gap-2 shrink-0"
            >
              {deepDiveSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Deep Dive Sync
            </Button>
          </div>

          {/* Real-time Deep Dive sync progress */}
          {syncProgress.active && (
            <Card>
              <CardContent className="py-3 space-y-2">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 font-medium">
                    <Loader2 className={cn("h-3.5 w-3.5", !syncProgress.completed && "animate-spin")} />
                    {syncProgress.timedOut
                      ? "Sync taking longer than expected — partial data may be available"
                      : syncProgress.completed
                        ? "Sync complete"
                        : syncProgress.total === 0
                          ? "Queuing jobs…"
                          : `Syncing ${syncProgress.done}/${syncProgress.total} jobs${syncProgress.processing > 0 ? ` · ${syncProgress.processing} running` : ""}`}
                  </div>
                  {syncProgress.failed > 0 && (
                    <span className="text-destructive font-medium">{syncProgress.failed} failed</span>
                  )}
                </div>
                <Progress
                  value={syncProgress.total > 0
                    ? Math.min(100, Math.round(((syncProgress.done + syncProgress.failed) / syncProgress.total) * 100))
                    : 0}
                  className="h-2"
                />
              </CardContent>
            </Card>
          )}


          {/* KPI Summary Cards */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <DollarSign className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Spend</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold font-mono">{fmt(spendTotals.spend)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10">
                  <ShoppingCart className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Results</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold font-mono">{spendTotals.results.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                  <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg ROAS</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold font-mono">{spendAvgRoas.toFixed(2)}x</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10">
                  <Target className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg CPO</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold font-mono">{fmt(spendAvgCpo)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Full analytics panel — mirrors /admin/campaigns */}
          <CampaignAnalyticsPanel
            campaignRows={spendCampaignRows}
            onRefresh={reloadSpendData}
            isAdmin={true}
          />
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
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((p: any) => {
                        const refunded = Number(p.refunded_bdt || 0);
                        const amount = Number(p.amount_bdt || 0);
                        const remaining = amount - refunded;
                        const canRefund = p.status === "approved" && remaining > 0.009;
                        return (
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
                            <div className="flex flex-col gap-1 items-start">
                              <Badge
                                variant={p.status === "approved" ? "default" : p.status === "rejected" ? "destructive" : "secondary"}
                                className="text-xs"
                              >
                                {p.status}
                              </Badge>
                              {refunded > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  {remaining <= 0.009 ? "Fully refunded" : `Refunded ৳${fmtBdt(refunded)}`}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {canRefund && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                onClick={() => setRefundDialog({ open: true, request: p })}
                              >
                                <Undo2 className="h-3.5 w-3.5" /> Refund
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PROFIT TAB */}
        <TabsContent value="profit">
          <ClientProfitTab clientId={userId!} />
        </TabsContent>

        {/* TRANSACTIONS TAB */}
        <TabsContent value="transactions">
          {/* Platform Sub-Balances + Transfer */}
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-muted-foreground">Platform Balances</h3>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => setTransferOpen(true)}>
              <RefreshCw className="h-3.5 w-3.5" /> Transfer
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
            {(() => {
              const txCredits = transactions.reduce((s: number, t: any) => s + (t.type === "credit" ? Number(t.amount) : 0), 0);
              const txDebits = transactions.reduce((s: number, t: any) => s + (t.type === "debit" ? Number(t.amount) : 0), 0);
              const mainBal = txCredits - txDebits;
              const platforms = ["meta", "tiktok", "google"];
              const labels: Record<string, string> = { meta: "Meta", tiktok: "TikTok", google: "Google" };
              const colors: Record<string, string> = { meta: "hsl(214, 80%, 52%)", tiktok: "hsl(340, 75%, 55%)", google: "hsl(142, 60%, 45%)" };
              return (
                <>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Main Balance</p>
                      <p className={`text-2xl font-bold font-mono mt-1 ${mainBal < 0 ? "text-destructive" : ""}`}>{fmt(mainBal)}</p>
                    </CardContent>
                  </Card>
                  {platforms.map((p) => {
                    const pC = transactions.filter((t: any) => t.type === "credit" && t.platform === p).reduce((s: number, t: any) => s + Number(t.amount), 0);
                    const pD = transactions.filter((t: any) => t.type === "debit" && t.platform === p).reduce((s: number, t: any) => s + Number(t.amount), 0);
                    const bal = pC - pD;
                    return (
                      <Card key={p}>
                        <CardContent className="pt-4 text-center">
                          <div className="flex items-center justify-center gap-1.5 mb-1">
                            <span className="h-2 w-2 rounded-full" style={{ background: colors[p] }} />
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{labels[p]}</p>
                          </div>
                          <p className={`text-xl font-bold font-mono ${bal < 0 ? "text-destructive" : ""}`}>{fmt(bal)}</p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </>
              );
            })()}
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transaction History</CardTitle>
            </CardHeader>
             <CardContent>
              {(() => {
                const visibleTxns = transactions.filter((t: any) => !t.description?.startsWith("auto_spend:"));
                if (visibleTxns.length === 0) return (
                  <p className="py-6 text-center text-sm text-muted-foreground">No transactions.</p>
                );
                return (
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
                      {visibleTxns.map((t: any) => (
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
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <DepositFundsDialog
        open={depositOpen}
        onOpenChange={setDepositOpen}
        clientId={userId}
        isAdmin
        onSuccess={loadAll}
      />
      <PlatformTransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        clientId={userId}
        onSuccess={loadAll}
      />
    </div>
  );
}
