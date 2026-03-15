import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, CheckCircle, AlertTriangle, XCircle, Activity } from "lucide-react";

interface IntegrationStatus {
  org_name: string;
  platform: string;
  connection_status: string;
  last_synced_at: string | null;
  is_active: boolean;
}

export default function PlatformHealth() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [dbOk, setDbOk] = useState(true);
  const [loading, setLoading] = useState(true);
  const [orgCount, setOrgCount] = useState(0);
  const [totalEdgeFunctions] = useState(13); // known edge functions count

  useEffect(() => {
    const fetch = async () => {
      const [{ data: intData, error: intErr }, { data: orgData }] = await Promise.all([
        supabase.from("api_integrations").select("platform, connection_status, last_synced_at, is_active, org_id"),
        supabase.from("organizations").select("id, name"),
      ]);

      if (intErr) setDbOk(false);

      const orgMap = new Map((orgData ?? []).map((o) => [o.id, o.name]));
      setOrgCount(orgData?.length ?? 0);
      setIntegrations(
        (intData ?? []).map((i: any) => ({
          org_name: orgMap.get(i.org_id) || "Unknown",
          platform: i.platform,
          connection_status: i.connection_status,
          last_synced_at: i.last_synced_at,
          is_active: i.is_active,
        }))
      );
      setLoading(false);
    };
    fetch();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const activeIntegrations = integrations.filter((i) => i.is_active);
  const failedIntegrations = integrations.filter((i) => i.connection_status !== "active");
  const staleIntegrations = integrations.filter((i) => {
    if (!i.last_synced_at) return true;
    return Date.now() - new Date(i.last_synced_at).getTime() > 24 * 60 * 60 * 1000;
  });

  const statusIcon = (status: string) => {
    if (status === "active") return <CheckCircle className="h-4 w-4 text-success" />;
    if (status === "expired") return <XCircle className="h-4 w-4 text-destructive" />;
    return <AlertTriangle className="h-4 w-4 text-warning" />;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">System Health</h1>
        <p className="text-sm text-muted-foreground">Monitor platform infrastructure and integrations</p>
      </div>

      {/* Health Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            {dbOk ? <CheckCircle className="h-5 w-5 text-success" /> : <XCircle className="h-5 w-5 text-destructive" />}
            <CardTitle className="text-sm">Database</CardTitle>
          </CardHeader>
          <CardContent><Badge variant={dbOk ? "default" : "destructive"}>{dbOk ? "Healthy" : "Error"}</Badge></CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle className="text-sm">Edge Functions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{totalEdgeFunctions}</p>
            <p className="text-xs text-muted-foreground">Deployed functions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <CheckCircle className="h-5 w-5 text-success" />
            <CardTitle className="text-sm">Active Integrations</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{activeIntegrations.length}</p>
            <p className="text-xs text-muted-foreground">Across {orgCount} agencies</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            {failedIntegrations.length > 0 ? <AlertTriangle className="h-5 w-5 text-warning" /> : <CheckCircle className="h-5 w-5 text-success" />}
            <CardTitle className="text-sm">Issues</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{failedIntegrations.length + staleIntegrations.length}</p>
            <p className="text-xs text-muted-foreground">{failedIntegrations.length} failed · {staleIntegrations.length} stale sync</p>
          </CardContent>
        </Card>
      </div>

      {/* Integrations Table */}
      <Card>
        <CardHeader><CardTitle className="text-base">API Integrations Status</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agency</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Synced</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {integrations.map((int, i) => (
                <TableRow key={i}>
                  <TableCell>{int.org_name}</TableCell>
                  <TableCell className="capitalize">{int.platform}</TableCell>
                  <TableCell className="flex items-center gap-2">{statusIcon(int.connection_status)} {int.connection_status}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {int.last_synced_at ? new Date(int.last_synced_at).toLocaleString() : "Never"}
                  </TableCell>
                  <TableCell><Badge variant={int.is_active ? "default" : "secondary"}>{int.is_active ? "Yes" : "No"}</Badge></TableCell>
                </TableRow>
              ))}
              {integrations.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No integrations found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
