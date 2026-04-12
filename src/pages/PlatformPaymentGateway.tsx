import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreditCard, CheckCircle, XCircle, Clock, Settings } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  initiated: "bg-yellow-100 text-yellow-800",
  success: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-muted text-muted-foreground",
};

export default function PlatformPaymentGateway() {
  const queryClient = useQueryClient();

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["gateway-transactions"],
    queryFn: async () => {
      const { data } = await supabase.from("gateway_transactions")
        .select("*, organizations(name)").order("created_at", { ascending: false }).limit(100);
      return data || [];
    },
  });

  const { data: configs = [] } = useQuery({
    queryKey: ["gateway-configs"],
    queryFn: async () => {
      const { data } = await supabase.from("payment_gateway_config").select("*, organizations(name)");
      return data || [];
    },
  });

  const totalSuccessful = transactions.filter((t: any) => t.status === "success").reduce((s: number, t: any) => s + t.amount_bdt, 0);
  const totalFailed = transactions.filter((t: any) => t.status === "failed").length;
  const totalPending = transactions.filter((t: any) => t.status === "initiated").length;

  return (
    <div className="space-y-6">
      <PageHeader title="Payment Gateway" subtitle="Manage automated payment processing" />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">৳{totalSuccessful.toLocaleString()}</div><p className="text-sm text-muted-foreground">Total Collected</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{transactions.length}</div><p className="text-sm text-muted-foreground">Total Transactions</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-yellow-600">{totalPending}</div><p className="text-sm text-muted-foreground">Pending</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-red-600">{totalFailed}</div><p className="text-sm text-muted-foreground">Failed</p></CardContent></Card>
      </div>

      <Tabs defaultValue="transactions">
        <TabsList><TabsTrigger value="transactions">Transactions</TabsTrigger><TabsTrigger value="config">Configuration</TabsTrigger></TabsList>

        <TabsContent value="transactions">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agency</TableHead>
                    <TableHead>Gateway</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Transaction ID</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((txn: any) => (
                    <TableRow key={txn.id}>
                      <TableCell className="font-medium">{txn.organizations?.name || "—"}</TableCell>
                      <TableCell><Badge variant="outline">{txn.gateway}</Badge></TableCell>
                      <TableCell>৳{txn.amount_bdt?.toLocaleString()}</TableCell>
                      <TableCell><Badge className={statusColors[txn.status] || ""}>{txn.status}</Badge></TableCell>
                      <TableCell className="text-xs font-mono">{txn.gateway_txn_id || "—"}</TableCell>
                      <TableCell className="text-sm">{format(new Date(txn.created_at), "dd MMM yyyy HH:mm")}</TableCell>
                    </TableRow>
                  ))}
                  {!transactions.length && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No gateway transactions yet</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" /> Gateway Configuration</CardTitle></CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">SSLCommerz credentials are stored securely as backend secrets. Contact support to update gateway settings.</p>
              <Table>
                <TableHeader><TableRow><TableHead>Agency</TableHead><TableHead>Gateway</TableHead><TableHead>Active</TableHead></TableRow></TableHeader>
                <TableBody>
                  {configs.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.organizations?.name || "Platform Default"}</TableCell>
                      <TableCell><Badge variant="outline">{c.gateway}</Badge></TableCell>
                      <TableCell>{c.is_active ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}</TableCell>
                    </TableRow>
                  ))}
                  {!configs.length && <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No gateway configurations</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
