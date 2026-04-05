import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DateRange, toISODate, getDhakaDateString } from "@/components/DateRangeFilter";
import { getPlatformRates } from "@/lib/pricing";

interface ClientWithBalance {
  user_id: string;
  full_name: string;
  email: string;
  business_name: string | null;
  balance: number;
  todaySpend: number;
  pricing_config: any;
}

async function fetchDashboardData(dateRange: DateRange | null) {
  const today = getDhakaDateString();
  const yesterday = getDhakaDateString(-1);
  const sevenAgo = getDhakaDateString(-7);

  // Step 1: Get mapped accounts
  const { data: mappedAssignments } = await supabase
    .from("ad_account_clients")
    .select("ad_account_id, client_id, mapping_keyword")
    .neq("mapping_keyword", "");

  const mappedAccountIds = [...new Set(mappedAssignments?.map((r: any) => r.ad_account_id) || [])];

  let campaignIds: string[] = [];
  if (mappedAccountIds.length > 0) {
    const { data: mappedCampaigns } = await supabase
      .from("campaigns")
      .select("id")
      .in("ad_account_id", mappedAccountIds);
    campaignIds = mappedCampaigns?.map((c: any) => c.id) ?? [];
  }

  let spendQuery = supabase.from("daily_metrics").select("spend, campaign_id");
  if (campaignIds.length > 0) {
    spendQuery = spendQuery.in("campaign_id", campaignIds);
  }
  if (dateRange) {
    spendQuery = spendQuery
      .gte("data_date", toISODate(dateRange.from))
      .lte("data_date", toISODate(dateRange.to));
  }

  const [profilesRes, rolesRes, txnsRes, pendingRes, syncRes, accountsRes, spendRangeRes, spendYesterdayRes, paymentReqRes] = await Promise.all([
    supabase.from("profiles").select("user_id, full_name, email, business_name, pricing_config"),
    supabase.from("user_roles").select("user_id").eq("role", "client"),
    supabase.from("transactions").select("*"),
    (supabase.from("transactions").select("id", { count: "exact" }) as any).eq("status", "pending_approval"),
    supabase.from("api_integrations").select("last_synced_at").order("last_synced_at", { ascending: false }).limit(1),
    supabase.from("ad_accounts").select("id", { count: "exact" }).eq("is_active", true),
    spendQuery,
    supabase.from("daily_metrics").select("spend").eq("data_date", yesterday),
    supabase.from("payment_requests").select("amount_bdt, created_at").eq("status", "approved"),
  ]);

  // Sparkline data
  let weekSpendQuery = supabase.from("daily_metrics").select("data_date, spend").gte("data_date", sevenAgo).order("data_date");
  if (campaignIds.length > 0) {
    weekSpendQuery = weekSpendQuery.in("campaign_id", campaignIds);
  }
  const { data: weekSpend } = await weekSpendQuery;
  const dailySpendMap: Record<string, number> = {};
  for (const r of (weekSpend ?? []) as any[]) {
    dailySpendMap[r.data_date] = (dailySpendMap[r.data_date] || 0) + Number(r.spend);
  }
  const spendHistory = Array.from({ length: 7 }, (_, i) => {
    const d = getDhakaDateString(-(6 - i));
    return dailySpendMap[d] || 0;
  });

  const clientUserIds = new Set(rolesRes.data?.map((r) => r.user_id) ?? []);
  const clientProfiles = (profilesRes.data ?? []).filter((p) => clientUserIds.has(p.user_id));
  const transactions = txnsRes.data ?? [];

  const spendRows = (spendRangeRes.data ?? []) as any[];
  const campaignIdsInRange = [...new Set(spendRows.map((r: any) => r.campaign_id))];

  let campaignToAccount: Record<string, string> = {};
  if (campaignIdsInRange.length > 0) {
    const { data: camps } = await supabase.from("campaigns").select("id, ad_account_id").in("id", campaignIdsInRange);
    for (const c of camps ?? []) campaignToAccount[c.id] = c.ad_account_id;
  }

  const { data: allMappings } = await supabase.from("ad_account_clients").select("ad_account_id, client_id").neq("mapping_keyword", "");
  const accountToClient: Record<string, string> = {};
  for (const m of allMappings ?? []) accountToClient[m.ad_account_id] = m.client_id;

  const clientSpendInRange: Record<string, number> = {};
  for (const row of spendRows) {
    const accId = campaignToAccount[row.campaign_id];
    const cid = accId ? accountToClient[accId] : null;
    if (cid) clientSpendInRange[cid] = (clientSpendInRange[cid] || 0) + Number(row.spend);
  }

  const clients: ClientWithBalance[] = clientProfiles.map((p) => {
    const clientTxns = transactions.filter((t: any) => t.client_id === p.user_id && t.status === "completed");
    const credits = clientTxns.filter((t: any) => t.type === "credit").reduce((sum: number, t: any) => sum + Number(t.amount), 0);
    const debits = clientTxns.filter((t: any) => t.type === "debit").reduce((sum: number, t: any) => sum + Number(t.amount), 0);
    return { ...p, balance: credits - debits, todaySpend: clientSpendInRange[p.user_id] || 0, pricing_config: (p as any).pricing_config };
  });

  const rangeSpendTotal = spendRows.reduce((s: number, r: any) => s + Number(r.spend), 0);
  const yesterdaySpendTotal = (spendYesterdayRes.data ?? []).reduce((s: number, r: any) => s + Number(r.spend), 0);

  // Collections
  const approvedPayments = (paymentReqRes.data ?? []) as any[];
  const rangeCollPayments = approvedPayments.filter((p: any) => {
    if (dateRange) {
      const pDate = p.created_at.split("T")[0];
      return pDate >= toISODate(dateRange.from) && pDate <= toISODate(dateRange.to);
    }
    return true;
  });
  const rangeCollect = rangeCollPayments.reduce((s: number, p: any) => s + Number(p.amount_bdt || 0), 0);

  const dailyCollMap: Record<string, number> = {};
  for (const p of approvedPayments) {
    const pDate = p.created_at.split("T")[0];
    if (pDate >= sevenAgo) {
      dailyCollMap[pDate] = (dailyCollMap[pDate] || 0) + Number(p.amount_bdt || 0);
    }
  }
  const collectHistory = Array.from({ length: 7 }, (_, i) => {
    const d = getDhakaDateString(-(6 - i));
    return dailyCollMap[d] || 0;
  });

  const lastSynced = (syncRes.data as any)?.[0]?.last_synced_at
    ? new Date((syncRes.data as any)[0].last_synced_at).toLocaleString()
    : null;

  return {
    clients,
    todaySpend: Math.round(rangeSpendTotal * 100) / 100,
    yesterdaySpend: Math.round(yesterdaySpendTotal * 100) / 100,
    todayCollections: Math.round(rangeCollect * 100) / 100,
    pendingCount: pendingRes.count ?? 0,
    activeAccounts: (accountsRes as any).count ?? 0,
    lastSynced,
    allTransactions: transactions,
    spendHistory,
    collectHistory,
  };
}

export function useAdminDashboardData(dateRange: DateRange | null) {
  const queryClient = useQueryClient();

  const dateKey = dateRange
    ? `${toISODate(dateRange.from)}_${toISODate(dateRange.to)}`
    : "all";

  const query = useQuery({
    queryKey: ["admin-dashboard", dateKey],
    queryFn: () => fetchDashboardData(dateRange),
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Realtime invalidation
  useEffect(() => {
    const channel = supabase
      .channel("admin-dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_metrics" }, () => queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_ad_spend" }, () => queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "usd_purchases" }, () => queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_requests" }, () => queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return query;
}
