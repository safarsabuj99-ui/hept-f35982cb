import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { Loader2 } from "lucide-react";

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  qualified: "default",
  paid: "outline",
  rejected: "destructive",
};

export default function AffiliateEarnings() {
  const { user } = useAuth();
  const [conversions, setConversions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    const { data: aff } = await supabase.from("affiliates").select("id").eq("user_id", user!.id).single();
    if (!aff) { setLoading(false); return; }

    const { data } = await supabase.from("affiliate_conversions")
      .select("*")
      .eq("affiliate_id", aff.id)
      .order("created_at", { ascending: false });

    setConversions(data || []);
    setLoading(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  const totalEarned = conversions.filter(c => ["qualified", "paid"].includes(c.status)).reduce((s, c) => s + Number(c.commission_bdt || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Earnings" subtitle={`Total earned: ৳${totalEarned.toLocaleString()}`} />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referred Agency</TableHead>
                <TableHead>Signup Date</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Commission</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conversions.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No conversions yet. Share your links to start earning!</TableCell></TableRow>
              ) : conversions.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.referred_org_name || "—"}</TableCell>
                  <TableCell>{new Date(c.signup_at).toLocaleDateString()}</TableCell>
                  <TableCell>{c.payment_amount_bdt ? `৳${Number(c.payment_amount_bdt).toLocaleString()}` : "—"}</TableCell>
                  <TableCell className="font-semibold text-emerald-600">
                    {c.commission_bdt ? `৳${Number(c.commission_bdt).toLocaleString()}` : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusColors[c.status] || "secondary"} className="capitalize">{c.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
