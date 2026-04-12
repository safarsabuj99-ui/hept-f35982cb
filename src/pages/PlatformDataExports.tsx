import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, Package, Clock, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  ready: "bg-green-100 text-green-800",
  downloaded: "bg-muted",
  expired: "bg-red-100 text-red-800",
};

export default function PlatformDataExports() {
  const queryClient = useQueryClient();

  const { data: requests = [] } = useQuery({
    queryKey: ["data-exports"],
    queryFn: async () => {
      const { data } = await supabase.from("data_export_requests")
        .select("*, organizations(name)").order("created_at", { ascending: false });
      return data || [];
    },
  });

  const triggerExport = useMutation({
    mutationFn: async (orgId: string) => {
      // Create request
      const { data: req, error } = await supabase.from("data_export_requests").insert({
        org_id: orgId, requested_by: (await supabase.auth.getUser()).data.user?.id || "", status: "pending" as any,
      }).select("id").single();
      if (error) throw error;

      // Trigger edge function
      const { error: fnErr } = await supabase.functions.invoke("data-export", {
        body: { org_id: orgId, request_id: req.id },
      });
      if (fnErr) throw fnErr;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["data-exports"] }); toast.success("Export started"); },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Data Exports" subtitle="GDPR compliance data export management" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><Package className="h-5 w-5 text-primary" /><div><div className="text-2xl font-bold">{requests.length}</div><p className="text-sm text-muted-foreground">Total Requests</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><Clock className="h-5 w-5 text-yellow-500" /><div><div className="text-2xl font-bold">{requests.filter((r: any) => r.status === "pending" || r.status === "processing").length}</div><p className="text-sm text-muted-foreground">In Progress</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><CheckCircle className="h-5 w-5 text-green-500" /><div><div className="text-2xl font-bold">{requests.filter((r: any) => r.status === "ready" || r.status === "downloaded").length}</div><p className="text-sm text-muted-foreground">Completed</p></div></div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Export Requests</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Agency</TableHead><TableHead>Status</TableHead><TableHead>Requested</TableHead><TableHead>Expires</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {requests.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.organizations?.name || "—"}</TableCell>
                  <TableCell><Badge className={statusColors[r.status] || ""}>{r.status}</Badge></TableCell>
                  <TableCell className="text-sm">{format(new Date(r.created_at), "dd MMM yyyy HH:mm")}</TableCell>
                  <TableCell className="text-sm">{r.expires_at ? format(new Date(r.expires_at), "dd MMM HH:mm") : "—"}</TableCell>
                  <TableCell>
                    {r.status === "ready" && r.export_url && (
                      <Button size="sm" variant="outline" onClick={() => window.open(r.export_url, "_blank")}>
                        <Download className="h-3.5 w-3.5 mr-1" />Download
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!requests.length && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No export requests</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
