import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { useNavigate } from "react-router-dom";
import { Plus, Building2, Search, LayoutGrid, List, Users, Monitor, UserCog } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tables } from "@/integrations/supabase/types";

interface OrgWithSub extends Tables<"organizations"> {
  subscription?: {
    payment_status: string;
    current_period_end: string;
    amount_bdt: number;
  } | null;
  clientCount?: number;
  adAccountCount?: number;
}

export default function AgencyList() {
  const [orgs, setOrgs] = useState<OrgWithSub[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: orgData }, { data: subData }, { data: profileData }, { data: adAccountData }] = await Promise.all([
        supabase.from("organizations").select("*").order("created_at", { ascending: false }),
        supabase.from("organization_subscriptions").select("org_id, payment_status, current_period_end, amount_bdt"),
        supabase.from("profiles").select("org_id"),
        supabase.from("ad_accounts").select("org_id"),
      ]);

      const subMap = new Map<string, any>();
      subData?.forEach((s) => subMap.set(s.org_id, s));

      const merged: OrgWithSub[] = (orgData ?? []).map((o) => ({
        ...o,
        subscription: subMap.get(o.id) ?? null,
        clientCount: (profileData ?? []).filter((p) => p.org_id === o.id).length,
        adAccountCount: (adAccountData ?? []).filter((a) => a.org_id === o.id).length,
      }));

      setOrgs(merged);
      setLoading(false);
    };
    fetchData();
  }, []);

  const filtered = orgs.filter((o) => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (search && !o.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const statusColors: Record<string, string> = {
    active: "bg-success/15 text-success border-success/20",
    trial: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    suspended: "bg-warning/15 text-warning border-warning/20",
    cancelled: "bg-destructive/15 text-destructive border-destructive/20",
  };

  const paymentColors: Record<string, string> = {
    paid: "bg-success/15 text-success",
    pending: "bg-warning/15 text-warning",
    overdue: "bg-destructive/15 text-destructive",
  };

  const statuses = ["all", "active", "trial", "suspended", "cancelled"];
  const activeCount = orgs.filter((o) => o.status === "active").length;
  const trialCount = orgs.filter((o) => o.status === "trial").length;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Agencies"
        subtitle={`${orgs.length} agencies registered`}
        icon={<Building2 className="h-6 w-6 text-primary" />}
        actions={
          <Button onClick={() => navigate("/platform/agencies/new")} className="press-effect gap-2">
            <Plus className="h-4 w-4" /> Create Agency
          </Button>
        }
      />

      <div>
        <p className="section-label mb-3">Overview</p>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <KpiCard title="Total" value={String(orgs.length)} icon={Building2} staggerIndex={0} />
          <KpiCard title="Active" value={String(activeCount)} icon={Users} accentColor="hsl(var(--success))" staggerIndex={1} />
          <KpiCard title="Trial" value={String(trialCount)} icon={Monitor} accentColor="hsl(214, 80%, 52%)" staggerIndex={2} />
          <KpiCard title="Suspended" value={String(orgs.filter((o) => o.status === "suspended").length)} icon={UserCog} accentColor="hsl(var(--warning))" staggerIndex={3} />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center animate-slide-up-fade" style={{ animationDelay: "200ms", animationFillMode: "forwards" }}>
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search agencies..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-1.5">
          {statuses.map((s) => (
            <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" className="capitalize text-xs" onClick={() => setStatusFilter(s)}>
              {s}
            </Button>
          ))}
        </div>
        <div className="flex gap-1 ml-auto">
          <Button variant={viewMode === "cards" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("cards")}><LayoutGrid className="h-4 w-4" /></Button>
          <Button variant={viewMode === "table" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("table")}><List className="h-4 w-4" /></Button>
        </div>
      </div>

      {viewMode === "cards" ? (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((org, i) => {
            const clientPct = org.max_clients > 0 ? Math.min(100, Math.round(((org.clientCount ?? 0) / org.max_clients) * 100)) : 0;
            const adPct = org.max_ad_accounts > 0 ? Math.min(100, Math.round(((org.adAccountCount ?? 0) / org.max_ad_accounts) * 100)) : 0;
            return (
              <div
                key={org.id}
                className="glass-card glow-border cursor-pointer animate-slide-up-fade group"
                style={{ animationDelay: `${Math.min(i, 8) * 60}ms`, animationFillMode: "forwards" }}
                onClick={() => navigate(`/platform/agencies/${org.id}`)}
              >
                <Card className="border-0 bg-transparent shadow-none">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 min-w-0">
                        <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">{org.name}</h3>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="capitalize text-[10px]">{org.plan}</Badge>
                          <Badge className={`text-[10px] ${statusColors[org.status] ?? ""}`}>{org.status}</Badge>
                        </div>
                      </div>
                      {org.subscription && (
                        <Badge className={`text-[10px] shrink-0 ${paymentColors[org.subscription.payment_status] ?? ""}`}>
                          {org.subscription.payment_status}
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground">Clients</span>
                          <span className="font-mono">{org.clientCount}/{org.max_clients}</span>
                        </div>
                        <Progress value={clientPct} className={`h-1 ${clientPct >= 90 ? "[&>div]:bg-destructive" : clientPct >= 70 ? "[&>div]:bg-warning" : "[&>div]:bg-success"}`} />
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground">Ad Accounts</span>
                          <span className="font-mono">{org.adAccountCount}/{org.max_ad_accounts}</span>
                        </div>
                        <Progress value={adPct} className={`h-1 ${adPct >= 90 ? "[&>div]:bg-destructive" : adPct >= 70 ? "[&>div]:bg-warning" : "[&>div]:bg-success"}`} />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/30">
                      <span>Renewal: {org.subscription?.current_period_end ?? "—"}</span>
                      <span>{new Date(org.created_at).toLocaleDateString()}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">No agencies match your filters</div>
          )}
        </div>
      ) : (
        <div className="glass-card glow-border animate-slide-up-fade" style={{ animationDelay: "200ms", animationFillMode: "forwards" }}>
          <Card className="border-0 bg-transparent shadow-none">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Limits</TableHead>
                    <TableHead>Renewal</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((org) => (
                    <TableRow key={org.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/platform/agencies/${org.id}`)}>
                      <TableCell className="font-medium">{org.name}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{org.plan}</Badge></TableCell>
                      <TableCell><Badge className={statusColors[org.status] ?? ""}>{org.status}</Badge></TableCell>
                      <TableCell>
                        {org.subscription ? (
                          <Badge className={paymentColors[org.subscription.payment_status] ?? ""}>{org.subscription.payment_status}</Badge>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{org.max_clients}C / {org.max_ad_accounts}A / {org.max_managers}M</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{org.subscription?.current_period_end ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(org.created_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No agencies</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
