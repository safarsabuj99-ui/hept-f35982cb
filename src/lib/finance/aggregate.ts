import { supabase } from "@/integrations/supabase/client";
import { getPlatformRates } from "@/lib/pricing";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { DateRange, toISODate, getLocalToday } from "@/components/DateRangeFilter";

export interface ClientProfit {
  clientId: string;
  name: string;
  totalSpendUsd: number;
  revenueBdt: number;
  cogsBdt: number;
  netProfit: number;
  margin: number;
}

export interface FinanceAggregate {
  revenue: number;
  cogs: number;
  opex: number;
  draw: number;
  grossProfit: number;
  netProfit: number;
  takeHome: number;
  margin: number; // net margin %
  wac: number;
  clients: ClientProfit[];
}

const sum = (arr: any[], key: string) => arr.reduce((s, r) => s + Number(r[key] || 0), 0);

const calcWac = (data: any[]) => {
  let bdt = 0, usd = 0;
  for (const p of data) { bdt += Number(p.bdt_amount_paid); usd += Number(p.usd_received); }
  return usd > 0 ? Math.round((bdt / usd) * 100) / 100 : 0;
};

export async function aggregateFinance(range: DateRange | null): Promise<FinanceAggregate> {
  const isoFrom = range ? toISODate(range.from) : null;
  const isoTo = range ? toISODate(range.to) : null;

  const purchasesP = fetchAllRows<any>(() => {
    let q = supabase.from("usd_purchases").select("bdt_amount_paid, usd_received, date");
    if (range) q = q.gte("date", isoFrom!).lte("date", isoTo!);
    return q;
  });
  const expensesP = fetchAllRows<any>(() => {
    let q = supabase.from("agency_expenses").select("amount_bdt, category, date");
    if (range) q = q.gte("date", isoFrom!).lte("date", isoTo!);
    return q;
  });
  const profilesP = fetchAllRows<any>(() => supabase.from("profiles").select("user_id, full_name, pricing_config"));
  const rolesP = fetchAllRows<any>(() => supabase.from("user_roles").select("user_id").eq("role", "client"));
  const campaignsP = fetchAllRows<any>(() => supabase.from("campaigns").select("id, platform, client_id"));
  const metricsP = fetchAllRows<any>(() => {
    let q = supabase.from("daily_metrics").select("campaign_id, spend, data_date");
    if (range) q = q.gte("data_date", isoFrom!).lte("data_date", isoTo!);
    return q;
  });

  const [purchases, expenses, profiles, roles, campaigns, metrics] = await Promise.all([
    purchasesP, expensesP, profilesP, rolesP, campaignsP, metricsP,
  ]);

  let wac = calcWac(purchases);
  if (wac === 0) {
    const today = getLocalToday();
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthly = await fetchAllRows<any>(() => supabase.from("usd_purchases").select("bdt_amount_paid, usd_received").gte("date", toISODate(first)).lte("date", toISODate(today)));
    wac = calcWac(monthly);
  }
  if (wac === 0) {
    const all = await fetchAllRows<any>(() => supabase.from("usd_purchases").select("bdt_amount_paid, usd_received"));
    wac = calcWac(all);
  }

  const clientIds = new Set(roles.map((r) => r.user_id));
  const profileMap: Record<string, any> = {};
  for (const p of profiles) if (clientIds.has(p.user_id)) profileMap[p.user_id] = p;

  const cToPlat: Record<string, string> = {};
  const cToClient: Record<string, string> = {};
  for (const c of campaigns) { cToPlat[c.id] = c.platform; if (c.client_id) cToClient[c.id] = c.client_id; }

  const clientPlatformSpend: Record<string, Record<string, number>> = {};
  for (const m of metrics) {
    const cid = cToClient[m.campaign_id]; if (!cid) continue;
    const plat = cToPlat[m.campaign_id] || "meta";
    if (!clientPlatformSpend[cid]) clientPlatformSpend[cid] = {};
    clientPlatformSpend[cid][plat] = (clientPlatformSpend[cid][plat] || 0) + Number(m.spend);
  }

  let revenue = 0, cogs = 0;
  const clients: ClientProfit[] = [];
  for (const [cid, plats] of Object.entries(clientPlatformSpend)) {
    const profile = profileMap[cid]; if (!profile) continue;
    const rates = getPlatformRates(profile.pricing_config);
    const pct = Number(profile.pricing_config?.percentage || 0);
    let revBdt = 0, totUsd = 0;
    for (const [plat, sp] of Object.entries(plats)) {
      const rate = Number((rates as any)[plat] || 120);
      revBdt += sp * rate; totUsd += sp;
    }
    if (pct > 0) revBdt += totUsd * (pct / 100) * (rates.meta || 120);
    const cBdt = totUsd * wac;
    const profit = revBdt - cBdt;
    revenue += revBdt; cogs += cBdt;
    clients.push({
      clientId: cid, name: profile.full_name,
      totalSpendUsd: Math.round(totUsd * 100) / 100,
      revenueBdt: Math.round(revBdt), cogsBdt: Math.round(cBdt),
      netProfit: Math.round(profit),
      margin: revBdt > 0 ? Math.round((profit / revBdt) * 1000) / 10 : 0,
    });
  }

  const opex = sum(expenses.filter((e) => e.category !== "Owner_Draw"), "amount_bdt");
  const draw = sum(expenses.filter((e) => e.category === "Owner_Draw"), "amount_bdt");
  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - opex;
  const takeHome = netProfit - draw;

  return {
    revenue: Math.round(revenue), cogs: Math.round(cogs),
    opex: Math.round(opex), draw: Math.round(draw),
    grossProfit: Math.round(grossProfit), netProfit: Math.round(netProfit),
    takeHome: Math.round(takeHome),
    margin: revenue > 0 ? Math.round((netProfit / revenue) * 1000) / 10 : 0,
    wac, clients: clients.sort((a, b) => b.netProfit - a.netProfit),
  };
}

export interface DailyPoint { date: string; revenue: number; cogs: number; opex: number; net: number; }

/** 30-day daily series for trend chart and sparkline */
export async function fetchDailySeries(days = 30): Promise<DailyPoint[]> {
  const today = getLocalToday();
  const start = new Date(today); start.setDate(start.getDate() - (days - 1));
  const isoFrom = toISODate(start); const isoTo = toISODate(today);

  const [purchases, expenses, campaigns, metrics, profiles, roles] = await Promise.all([
    fetchAllRows<any>(() => supabase.from("usd_purchases").select("bdt_amount_paid, usd_received, date").gte("date", isoFrom).lte("date", isoTo)),
    fetchAllRows<any>(() => supabase.from("agency_expenses").select("amount_bdt, category, date").gte("date", isoFrom).lte("date", isoTo)),
    fetchAllRows<any>(() => supabase.from("campaigns").select("id, platform, client_id")),
    fetchAllRows<any>(() => supabase.from("daily_metrics").select("campaign_id, spend, data_date").gte("data_date", isoFrom).lte("data_date", isoTo)),
    fetchAllRows<any>(() => supabase.from("profiles").select("user_id, pricing_config")),
    fetchAllRows<any>(() => supabase.from("user_roles").select("user_id").eq("role", "client")),
  ]);

  // Use overall WAC for the window (simple, stable)
  const wac = calcWac(purchases);

  const clientIds = new Set(roles.map((r) => r.user_id));
  const profileMap: Record<string, any> = {};
  for (const p of profiles) if (clientIds.has(p.user_id)) profileMap[p.user_id] = p;
  const cToPlat: Record<string, string> = {}, cToClient: Record<string, string> = {};
  for (const c of campaigns) { cToPlat[c.id] = c.platform; if (c.client_id) cToClient[c.id] = c.client_id; }

  // Build day buckets
  const days_: Record<string, DailyPoint> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const key = toISODate(d);
    days_[key] = { date: key, revenue: 0, cogs: 0, opex: 0, net: 0 };
  }

  for (const m of metrics) {
    const cid = cToClient[m.campaign_id]; if (!cid) continue;
    const profile = profileMap[cid]; if (!profile) continue;
    const rates = getPlatformRates(profile.pricing_config);
    const pct = Number(profile.pricing_config?.percentage || 0);
    const plat = cToPlat[m.campaign_id] || "meta";
    const rate = Number((rates as any)[plat] || 120);
    const sp = Number(m.spend);
    let revBdt = sp * rate;
    if (pct > 0) revBdt += sp * (pct / 100) * (rates.meta || 120);
    const cBdt = sp * wac;
    const key = String(m.data_date).slice(0, 10);
    if (days_[key]) {
      days_[key].revenue += revBdt;
      days_[key].cogs += cBdt;
    }
  }

  for (const e of expenses) {
    if (e.category === "Owner_Draw") continue;
    const key = String(e.date).slice(0, 10);
    if (days_[key]) days_[key].opex += Number(e.amount_bdt);
  }

  return Object.values(days_).map((d) => ({
    ...d,
    revenue: Math.round(d.revenue),
    cogs: Math.round(d.cogs),
    opex: Math.round(d.opex),
    net: Math.round(d.revenue - d.cogs - d.opex),
  }));
}

/** Compute the equivalent previous range of equal length immediately before `range`. */
export function getPreviousRange(range: DateRange | null): DateRange | null {
  if (!range) return null;
  const ms = range.to.getTime() - range.from.getTime();
  const dayMs = 86_400_000;
  const lenDays = Math.round(ms / dayMs) + 1;
  const prevTo = new Date(range.from); prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - (lenDays - 1));
  return { from: prevFrom, to: prevTo };
}
