import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MapPin, Filter } from "lucide-react";

export default function CampaignMapping() {
  const [mappings, setMappings] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [platformFilter, setPlatformFilter] = useState("all");
  const [saving, setSaving] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchData = async () => {
    const [{ data: maps }, { data: roles }, { data: profiles }] = await Promise.all([
      supabase.from("campaign_mappings" as any).select("*").order("created_at", { ascending: false }) as any,
      supabase.from("user_roles").select("user_id").eq("role", "client"),
      supabase.from("profiles").select("user_id, full_name"),
    ]);
    setMappings(maps ?? []);
    const clientIds = new Set(roles?.map((r: any) => r.user_id) ?? []);
    setClients((profiles ?? []).filter((p: any) => clientIds.has(p.user_id)));
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const assignClient = async (mappingId: string, clientId: string) => {
    setSaving(mappingId);
    const { error } = await (supabase.from("campaign_mappings" as any) as any)
      .update({ client_id: clientId === "unassigned" ? null : clientId })
      .eq("id", mappingId);
    setSaving(null);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Updated", description: "Campaign mapping saved" });
      fetchData();
    }
  };

  const filtered = platformFilter === "all" ? mappings : mappings.filter((m: any) => m.platform === platformFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campaign Mapping</h1>
          <p className="text-muted-foreground">Assign campaigns to clients</p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="meta">Meta</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
              <SelectItem value="google">Google</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <MapPin className="h-10 w-10" />
              <p>No campaigns found. Run a sync to generate campaigns.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Campaign ID</TableHead>
                  <TableHead>Assigned Client</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.campaign_name}</TableCell>
                    <TableCell><Badge variant="secondary" className="capitalize">{m.platform}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{m.campaign_id}</TableCell>
                    <TableCell>
                      <Select value={m.client_id || "unassigned"} onValueChange={(v) => assignClient(m.id, v)}>
                        <SelectTrigger className="w-44">
                          <SelectValue placeholder="Assign..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {clients.map((c: any) => (
                            <SelectItem key={c.user_id} value={c.user_id}>{c.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
