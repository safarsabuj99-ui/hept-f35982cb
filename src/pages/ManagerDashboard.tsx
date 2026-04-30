import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, Users, TrendingUp } from "lucide-react";

interface ClientWithBalance {
  user_id: string;
  full_name: string;
  email: string;
  business_name: string | null;
  balance: number;
}

export default function ManagerDashboard() {
  const { user } = useAuth();
  const formatUSD = (v: number) => `$${v.toFixed(2)}`;
  const [clients, setClients] = useState<ClientWithBalance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      // RLS ensures manager only sees assigned client profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, business_name, manager_id" as any)
        .neq("user_id", user.id);

      const clientProfiles = (profiles ?? []).filter((p: any) => p.manager_id === user.id);

      if (clientProfiles.length === 0) {
        setClients([]);
        setLoading(false);
        return;
      }

      const clientIds = clientProfiles.map((p: any) => p.user_id);

      // Only fetch needed columns, filtered to these clients
      const transactions = await fetchAllRows<any>(() =>
        supabase
          .from("transactions")
          .select("client_id, type, amount, status")
          .in("client_id", clientIds)
          .eq("status", "completed")
      );

      const result: ClientWithBalance[] = clientProfiles.map((p: any) => {
        const clientTxns = transactions.filter((t: any) => t.client_id === p.user_id);
        const credits = clientTxns.filter((t: any) => t.type === "credit").reduce((sum: number, t: any) => sum + Number(t.amount), 0);
        const debits = clientTxns.filter((t: any) => t.type === "debit").reduce((sum: number, t: any) => sum + Number(t.amount), 0);
        return { user_id: p.user_id, full_name: p.full_name, email: p.email, business_name: p.business_name, balance: credits - debits };
      });

      setClients(result);
      setLoading(false);
    };
    fetchData();
  }, [user]);

  const totalBalance = clients.reduce((s, c) => s + c.balance, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Assigned Clients</h1>
          <p className="text-muted-foreground">Manage your client accounts</p>
        </div>
        
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">My Clients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-16" /> : <p className="text-3xl font-bold">{clients.length}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-24" /> : <p className="text-3xl font-bold">{formatUSD(totalBalance)}</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Client Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : clients.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No clients assigned to you yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden sm:table-cell">Business</TableHead>
                    <TableHead className="hidden md:table-cell">Email</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => (
                    <TableRow key={client.user_id}>
                      <TableCell className="font-medium">{client.full_name}</TableCell>
                      <TableCell className="hidden sm:table-cell">{client.business_name || "—"}</TableCell>
                      <TableCell className="hidden md:table-cell">{client.email}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={client.balance >= 0 ? "default" : "destructive"} className="font-mono">
                          {formatUSD(client.balance)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
