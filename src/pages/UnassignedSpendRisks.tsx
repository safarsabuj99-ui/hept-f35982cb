import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Search, ArrowLeft, UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { DateRangeFilter, DateRange, DatePreset, toISODate, getLocalToday } from "@/components/DateRangeFilter";
import { toast } from "sonner";

interface CampaignRow {
  id: string;
  name: string;
  platform: string;
  ad_account_id: string;
  ad_account_name: string;
  status: string;
  total_spend: number;
  last_active: string;
}

interface ClientOption {
  user_id: string;
  full_name: string;
  business_name: string | null;
}

export default function UnassignedSpendRisks() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>("all_time");
  const [assignDialog, setAssignDialog] = useState<CampaignRow | null>(null);
  const [selectedClient, setSelectedClient] = useState("");
  const [assigning, setAssigning] = useState(false);
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const fetchData = useCallback(async () => {
    setLoading(true);

    // Fetch campaigns, campaign_mappings (with client), ad_accounts, clients in parallel
    const [
      { data: allCampaigns },
      { data: mappings },
      { data: adAccounts },
      { data: clientProfiles },
      { data: clientRoles },
    ] = await Promise.all([
      supabase.from("campaigns").select("id, name, platform, ad_account_id, status"),
      supabase.from("campaign_mappings").select("campaign_id, client_id"),
      supabase.from("ad_accounts").select("id, account_name, platform_name"),
      supabase.from("profiles").select("user_id, full_name, business_name"),
      supabase.from("user_roles").select("user_id, role").eq("role", "client"),
    ]);

    // Build set of mapped campaign IDs (those with a client_id)
    const mappedIds = new Set(
      (mappings ?? []).filter((m: any) => m.client_id).map((m: any) => m.campaign_id)
    );

    // Account lookup
    const accountMap = new Map(
      (adAccounts ?? []).map((a: any) => [a.id, { name: a.account_name, platform: a.platform_name }])
    );

    // Unmapped campaigns
    const unmapped = (allCampaigns ?? []).filter((c: any) => !mappedIds.has(c.id));

    if (unmapped.length === 0) {
      setCampaigns([]);
      setLoading(false);
      // Build clients list
      const clientIds = new Set((clientRoles ?? []).map((r: any) => r.user_id));
      setClients((clientProfiles ?? []).filter((p: any) => clientIds.has(p.user_id)));
      return;
    }

    // Fetch daily_metrics for unmapped campaign IDs (with optional date filter)
    const unmappedIds = unmapped.map((c: any) => c.id);
    let metricsQuery = supabase
      .from("daily_metrics")
      .select("campaign_id, spend, data_date")
      .in("campaign_id", unmappedIds);

    if (dateRange) {
      metricsQuery = metricsQuery
        .gte("data_date", toISODate(dateRange.from))
        .lte("data_date", toISODate(dateRange.to));
    }

    const { data: metrics } = await metricsQuery;

    // Aggregate spend per campaign
    const spendMap: Record<string, { total: number; lastDate: string }> = {};
    for (const m of metrics ?? []) {
      if (!spendMap[m.campaign_id]) {
        spendMap[m.campaign_id] = { total: 0, lastDate: m.data_date };
      }
      spendMap[m.campaign_id].total += Number(m.spend);
      if (m.data_date > spendMap[m.campaign_id].lastDate) {
        spendMap[m.campaign_id].lastDate = m.data_date;
      }
    }

    const items: CampaignRow[] = unmapped
      .map((c: any) => {
        const acc = accountMap.get(c.ad_account_id);
        const spend = spendMap[c.id];
        return {
          id: c.id,
          name: c.name,
          platform: acc?.platform ?? c.platform ?? "—",
          ad_account_id: c.ad_account_id,
          ad_account_name: acc?.name ?? "Unknown",
          status: c.status,
          total_spend: spend?.total ?? 0,
          last_active: spend?.lastDate ?? "—",
        };
      })
      .sort((a, b) => b.total_spend - a.total_spend);

    setCampaigns(items);

    // Build clients list
    const clientIds = new Set((clientRoles ?? []).map((r: any) => r.user_id));
    setClients((clientProfiles ?? []).filter((p: any) => clientIds.has(p.user_id)));

    setLoading(false);
  }, [dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDateChange = (range: DateRange | null, preset: DatePreset) => {
    setDateRange(range);
    setDatePreset(preset);
  };

  const handleAssign = async () => {
    if (!assignDialog || !selectedClient) return;
    setAssigning(true);

    const { error } = await supabase.from("campaign_mappings").insert({
      campaign_id: assignDialog.id,
      campaign_name: assignDialog.name,
      platform: assignDialog.platform as any,
      client_id: selectedClient,
      ad_account_id: assignDialog.ad_account_id,
      is_active: true,
    });

    if (error) {
      toast.error("Failed to assign: " + error.message);
    } else {
      toast.success(`"${assignDialog.name}" assigned successfully`);
      setCampaigns((prev) => prev.filter((c) => c.id !== assignDialog.id));
    }

    setAssigning(false);
    setAssignDialog(null);
    setSelectedClient("");
  };

  const filtered = useMemo(
    () => campaigns.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())),
    [campaigns, search]
  );

  const totalRisk = filtered.reduce((s, c) => s + c.total_spend, 0);
  const fmt = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin/attention")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Unassigned Spend Risks</h1>
          <p className="text-muted-foreground text-sm mt-1">Campaigns spending without a client mapping — revenue at risk.</p>
        </div>
      </div>

      {/* Date Filter */}
      <DateRangeFilter onRangeChange={handleDateChange} />

      {/* KPI Bar */}
      <div className="grid gap-4 grid-cols-2">
        <Card className="glass-card">
          <CardContent className="pt-5 pb-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Unassigned Spend</p>
            <p className="text-2xl font-bold text-destructive mt-1 font-mono">{fmt(totalRisk)}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-5 pb-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Unassigned Campaigns</p>
            <p className="text-2xl font-bold mt-1">{filtered.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search + Action */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search campaigns..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={() => navigate("/admin/campaigns")} className="shrink-0">
          Map Campaigns
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-12 text-center text-muted-foreground">
            {search ? "No campaigns match your search." : "🎉 All campaigns are assigned!"}
          </CardContent>
        </Card>
      ) : isMobile ? (
        <div className="space-y-3">
          {filtered.map((c) => (
            <Card key={c.id} className="glass-card">
              <CardContent className="p-4 space-y-2">
                <p className="font-medium truncate">{c.name}</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{c.ad_account_name}</span>
                  <Badge variant="outline" className="capitalize">{c.platform}</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Last active: {c.last_active}</span>
                  <span className="font-mono text-destructive font-semibold">{fmt(c.total_spend)}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-1"
                  onClick={() => { setAssignDialog(c); setSelectedClient(""); }}
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                  Assign to Client
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="glass-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign Name</TableHead>
                <TableHead>Ad Account</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead className="text-right">Total Spend</TableHead>
                <TableHead className="text-right">Last Active</TableHead>
                <TableHead className="text-center">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium max-w-[250px] truncate">{c.name}</TableCell>
                  <TableCell>{c.ad_account_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{c.platform}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-destructive">{fmt(c.total_spend)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{c.last_active}</TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setAssignDialog(c); setSelectedClient(""); }}
                    >
                      <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                      Assign
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Assign Dialog */}
      <Dialog open={!!assignDialog} onOpenChange={(open) => { if (!open) { setAssignDialog(null); setSelectedClient(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Campaign to Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="text-sm text-muted-foreground">Campaign</p>
              <p className="font-medium truncate">{assignDialog?.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1.5">Select Client</p>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a client..." />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((cl) => (
                    <SelectItem key={cl.user_id} value={cl.user_id}>
                      {cl.full_name}{cl.business_name ? ` (${cl.business_name})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAssignDialog(null); setSelectedClient(""); }}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={!selectedClient || assigning}>
              {assigning ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
