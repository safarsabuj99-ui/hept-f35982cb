import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Users, Monitor, UserCog, BarChart3 } from "lucide-react";

interface Org { id: string; name: string; plan: string; status: string; max_clients: number; max_ad_accounts: number; max_managers: number; }
interface UsageRow extends Org { clientCount: number; adAccountCount: number; managerCount: number; hasOverage: boolean; }

function usagePct(used: number, limit: number) { if (limit === 0) return 100; return Math.min(Math.round((used / limit) * 100), 100); }
function usageColor(pct: number) { if (pct >= 90) return "text-destructive"; if (pct >= 70) return "text-warning"; return "text-success"; }
function progressColor(pct: number) { if (pct >= 90) return "[&>div]:bg-destructive"; if (pct >= 70) return "[&>div]:bg-warning"; return "[&>div]:bg-success"; }

export default function TenantUsageMetering() {
  const [usageRows, setUsageRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [overageOnly, setOverageOnly] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetch = async () => {
      const [{ data: orgData }, { data: profileData }, { data: adAccountData }] = await Promise.all([
        supabase.from("organizations").select("id, name, plan, status, max_clients, max_ad_accounts, max_managers"),
        supabase.from("profiles").select("org_id, user_id"),
        supabase.from("ad_accounts").select("org_id, id"),
      ]);
      const profiles = profileData ?? []; const accounts = adAccountData ?? [];
      const { data: rolesData } = await supabase.from("user_roles").select("user_id, role");
      const roles = rolesData ?? [];
      const roleMap = new Map<string, string>(); roles.forEach((r) => roleMap.set(r.user_id, r.role));
      const rows: UsageRow[] = (orgData ?? []).map((org: any) => {
        const orgProfiles = profiles.filter((p) => p.org_id === org.id);
        const clientCount = orgProfiles.filter((p) => roleMap.get(p.user_id) === "client").length;
        const managerCount = orgProfiles.filter((p) => roleMap.get(p.user_id) === "manager" || roleMap.get(p.user_id) === "admin").length;
        const adAccountCount = accounts.filter((a) => a.org_id === org.id).length;
        const hasOverage = clientCount > org.max_clients || adAccountCount > org.max_ad_accounts || managerCount > org.max_managers;
        return { ...org, clientCount, adAccountCount, managerCount, hasOverage };
      });
      setUsageRows(rows); setLoading(false);
    };
    fetch();
  }, []);

  const filtered = useMemo(() => usageRows.filter((r) => {
    if (planFilter !== "all" && r.plan !== planFilter) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (overageOnly && !r.hasOverage) return false;
    return true;
  }), [usageRows, planFilter, statusFilter, overageOnly]);

  const overageCount = usageRows.filter((r) => r.hasOverage).length;

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-3 grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );

  return (
    <div className="space-y-8">
      <PageHeader title="Usage Metering" subtitle="Monitor agency resource consumption vs plan limits" icon={<BarChart3 className="h-6 w-6 text-primary" />} />

      {overageCount > 0 && (
        <div className="glass-card border-l-4 border-l-destructive animate-slide-up-fade" style={{ animationFillMode: "forwards" }}>
          <Card className="border-0 bg-transparent shadow-none">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">{overageCount} {overageCount === 1 ? "agency exceeds" : "agencies exceed"} plan limits</p>
                <p className="text-xs text-muted-foreground">Review and consider upgrading their plans</p>
              </div>
              <Button variant="outline" size="sm" className="ml-auto press-effect" onClick={() => setOverageOnly(true)}>Show Over-Limit</Button>
            </CardContent>
          </Card>
        </div>
      )}

      <div>
        <p className="section-label mb-3">Summary</p>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <KpiCard title="Total Agencies" value={String(usageRows.length)} icon={Users} staggerIndex={0} />
          <KpiCard title="Over Limit" value={String(overageCount)} icon={AlertTriangle} accentColor="hsl(var(--destructive))" staggerIndex={1} />
          <KpiCard title="Total Ad Accounts" value={String(usageRows.reduce((s, r) => s + r.adAccountCount, 0))} icon={Monitor} staggerIndex={2} />
          <KpiCard title="Total Clients" value={String(usageRows.reduce((s, r) => s + r.clientCount, 0))} icon={UserCog} staggerIndex={3} />
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Plans</SelectItem>
            <SelectItem value="starter">Starter</SelectItem>
            <SelectItem value="growth">Growth</SelectItem>
            <SelectItem value="agency_pro">Agency Pro</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
        <Button variant={overageOnly ? "default" : "outline"} size="sm" onClick={() => setOverageOnly(!overageOnly)} className="press-effect">
          <AlertTriangle className="h-3 w-3 mr-1" />Over Limit Only
        </Button>
      </div>

      <div className="glass-card glow-border animate-slide-up-fade" style={{ animationDelay: "200ms", animationFillMode: "forwards" }}>
        <Card className="border-0 bg-transparent shadow-none">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Agency</TableHead><TableHead>Plan</TableHead><TableHead>Clients</TableHead><TableHead>Ad Accounts</TableHead><TableHead>Managers</TableHead><TableHead>Status</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => {
                  const clientPct = usagePct(row.clientCount, row.max_clients);
                  const adPct = usagePct(row.adAccountCount, row.max_ad_accounts);
                  const mgrPct = usagePct(row.managerCount, row.max_managers);
                  return (
                    <TableRow key={row.id} className="cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => navigate(`/platform/agencies/${row.id}`)}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {row.hasOverage && <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />}
                          <span className="font-medium">{row.name}</span>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{row.plan}</Badge></TableCell>
                      <TableCell>
                        <div className="space-y-1 min-w-[120px]">
                          <div className="flex justify-between text-xs"><span className={usageColor(clientPct)}>{row.clientCount}/{row.max_clients}</span><span className="text-muted-foreground">{clientPct}%</span></div>
                          <Progress value={clientPct} className={`h-1.5 ${progressColor(clientPct)}`} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 min-w-[120px]">
                          <div className="flex justify-between text-xs"><span className={usageColor(adPct)}>{row.adAccountCount}/{row.max_ad_accounts}</span><span className="text-muted-foreground">{adPct}%</span></div>
                          <Progress value={adPct} className={`h-1.5 ${progressColor(adPct)}`} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 min-w-[120px]">
                          <div className="flex justify-between text-xs"><span className={usageColor(mgrPct)}>{row.managerCount}/{row.max_managers}</span><span className="text-muted-foreground">{mgrPct}%</span></div>
                          <Progress value={mgrPct} className={`h-1.5 ${progressColor(mgrPct)}`} />
                        </div>
                      </TableCell>
                      <TableCell><Badge variant={row.status === "active" ? "default" : row.status === "trial" ? "secondary" : "destructive"}>{row.status}</Badge></TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No agencies match filters</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
