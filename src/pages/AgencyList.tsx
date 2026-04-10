import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useNavigate } from "react-router-dom";
import { Plus, Loader2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

interface OrgWithSub extends Tables<"organizations"> {
  subscription?: {
    payment_status: string;
    current_period_end: string;
    amount_bdt: number;
  } | null;
}

export default function AgencyList() {
  const [orgs, setOrgs] = useState<OrgWithSub[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: orgData }, { data: subData }] = await Promise.all([
        supabase.from("organizations").select("*").order("created_at", { ascending: false }),
        supabase.from("organization_subscriptions").select("org_id, payment_status, current_period_end, amount_bdt"),
      ]);

      const subMap = new Map<string, any>();
      subData?.forEach((s) => subMap.set(s.org_id, s));

      const merged: OrgWithSub[] = (orgData ?? []).map((o) => ({
        ...o,
        subscription: subMap.get(o.id) ?? null,
      }));

      setOrgs(merged);
      setLoading(false);
    };
    fetchData();
  }, []);

  const statusColor: Record<string, string> = {
    active: "bg-success/10 text-success border-success/20",
    trial: "bg-warning/10 text-warning border-warning/20",
    suspended: "bg-destructive/10 text-destructive border-destructive/20",
    cancelled: "bg-muted text-muted-foreground",
  };

  const paymentColor: Record<string, string> = {
    paid: "bg-success/10 text-success",
    pending: "bg-warning/10 text-warning",
    overdue: "bg-destructive/10 text-destructive",
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agencies</h1>
          <p className="text-sm text-muted-foreground">{orgs.length} agencies registered</p>
        </div>
        <Button onClick={() => navigate("/platform/agencies/new")}>
          <Plus className="mr-2 h-4 w-4" /> Create Agency
        </Button>
      </div>

      <Card>
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
              {orgs.map((org) => (
                <TableRow key={org.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/platform/agencies/${org.id}`)}>
                  <TableCell className="font-medium">{org.name}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{org.plan}</Badge></TableCell>
                  <TableCell><Badge className={statusColor[org.status] ?? ""}>{org.status}</Badge></TableCell>
                  <TableCell>
                    {org.subscription ? (
                      <Badge className={paymentColor[org.subscription.payment_status] ?? ""}>
                        {org.subscription.payment_status}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {org.max_clients}C / {org.max_ad_accounts}A / {org.max_managers}M
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {org.subscription?.current_period_end ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(org.created_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
              {orgs.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No agencies yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
