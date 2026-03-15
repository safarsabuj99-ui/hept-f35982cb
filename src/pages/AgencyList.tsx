import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useNavigate } from "react-router-dom";
import { Plus, Loader2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

export default function AgencyList() {
  const [orgs, setOrgs] = useState<Tables<"organizations">[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.from("organizations").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      setOrgs(data ?? []);
      setLoading(false);
    });
  }, []);

  const statusColor: Record<string, string> = {
    active: "bg-success/10 text-success border-success/20",
    trial: "bg-warning/10 text-warning border-warning/20",
    suspended: "bg-destructive/10 text-destructive border-destructive/20",
    cancelled: "bg-muted text-muted-foreground",
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
                <TableHead>Limits</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map((org) => (
                <TableRow key={org.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/platform/agencies/${org.id}`)}>
                  <TableCell className="font-medium">{org.name}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{org.plan}</Badge></TableCell>
                  <TableCell><Badge className={statusColor[org.status] ?? ""}>{org.status}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {org.max_clients}C / {org.max_ad_accounts}A / {org.max_managers}M
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(org.created_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
              {orgs.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No agencies yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
