import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Gift, Users, DollarSign, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  qualified: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
  expired: "bg-muted text-muted-foreground",
};

export default function PlatformReferrals() {
  const queryClient = useQueryClient();

  const { data: programs = [] } = useQuery({
    queryKey: ["referral-programs"],
    queryFn: async () => {
      const { data } = await supabase.from("referral_program").select("*");
      return data || [];
    },
  });

  const { data: tracking = [] } = useQuery({
    queryKey: ["referral-tracking"],
    queryFn: async () => {
      const { data } = await supabase.from("referral_tracking")
        .select("*, referral_codes(code, org_id), referred_org:organizations!referral_tracking_referred_org_id_fkey(name), referrer_org:organizations!referral_tracking_referrer_org_id_fkey(name)")
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: codes = [] } = useQuery({
    queryKey: ["referral-codes"],
    queryFn: async () => {
      const { data } = await supabase.from("referral_codes").select("*, organizations(name)");
      return data || [];
    },
  });

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("referral_tracking").update({
        status: "paid" as any, paid_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["referral-tracking"] }); toast.success("Marked as paid"); },
  });

  const totalReferrals = tracking.length;
  const qualifiedCount = tracking.filter((t: any) => t.status === "qualified" || t.status === "paid").length;
  const totalCommissions = tracking.filter((t: any) => t.status === "paid").reduce((s: number, t: any) => s + (t.commission_bdt || 0), 0);
  const pendingPayouts = tracking.filter((t: any) => t.status === "qualified").reduce((s: number, t: any) => s + (t.commission_bdt || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Referral Program" subtitle="Manage affiliate referrals and commissions" />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /><div><div className="text-2xl font-bold">{totalReferrals}</div><p className="text-sm text-muted-foreground">Total Referrals</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><CheckCircle className="h-5 w-5 text-green-500" /><div><div className="text-2xl font-bold">{qualifiedCount}</div><p className="text-sm text-muted-foreground">Qualified</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><DollarSign className="h-5 w-5 text-blue-500" /><div><div className="text-2xl font-bold">৳{totalCommissions.toLocaleString()}</div><p className="text-sm text-muted-foreground">Paid Out</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><Gift className="h-5 w-5 text-yellow-500" /><div><div className="text-2xl font-bold">৳{pendingPayouts.toLocaleString()}</div><p className="text-sm text-muted-foreground">Pending Payouts</p></div></div></CardContent></Card>
      </div>

      <Tabs defaultValue="tracking">
        <TabsList><TabsTrigger value="tracking">Referrals</TabsTrigger><TabsTrigger value="codes">Codes</TabsTrigger><TabsTrigger value="programs">Programs</TabsTrigger></TabsList>

        <TabsContent value="tracking">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Referrer</TableHead><TableHead>Referred</TableHead><TableHead>Code</TableHead><TableHead>Commission</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {tracking.map((t: any) => (
                    <TableRow key={t.id}>
                      <TableCell>{(t as any).referrer_org?.name || "—"}</TableCell>
                      <TableCell>{(t as any).referred_org?.name || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{t.referral_codes?.code || "—"}</TableCell>
                      <TableCell>৳{(t.commission_bdt || 0).toLocaleString()}</TableCell>
                      <TableCell><Badge className={statusColors[t.status] || ""}>{t.status}</Badge></TableCell>
                      <TableCell className="text-sm">{format(new Date(t.created_at), "dd MMM yyyy")}</TableCell>
                      <TableCell>{t.status === "qualified" && <Button size="sm" onClick={() => markPaid.mutate(t.id)}>Pay</Button>}</TableCell>
                    </TableRow>
                  ))}
                  {!tracking.length && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No referrals yet</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="codes">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Agency</TableHead><TableHead>Code</TableHead><TableHead>Uses</TableHead><TableHead>Active</TableHead></TableRow></TableHeader>
                <TableBody>
                  {codes.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.organizations?.name}</TableCell>
                      <TableCell className="font-mono font-bold">{c.code}</TableCell>
                      <TableCell>{c.uses_count}</TableCell>
                      <TableCell>{c.is_active ? <Badge className="bg-green-100 text-green-800">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="programs">
          <Card>
            <CardContent className="space-y-4 pt-6">
              {programs.map((p: any) => (
                <div key={p.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">{p.name}</h4>
                    <Badge>{p.is_active ? "Active" : "Inactive"}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mt-3 text-sm">
                    <div><span className="text-muted-foreground">Commission:</span> <span className="font-medium">{p.commission_type === "percentage" ? `${p.commission_value}%` : `৳${p.commission_value}`}</span></div>
                    <div><span className="text-muted-foreground">Min Months:</span> <span className="font-medium">{p.min_months}</span></div>
                    <div><span className="text-muted-foreground">Max Payouts:</span> <span className="font-medium">{p.max_payouts || "Unlimited"}</span></div>
                  </div>
                </div>
              ))}
              {!programs.length && <p className="text-center text-muted-foreground py-8">No referral programs configured</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
