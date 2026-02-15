import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Users, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface ClientWithBalance {
  user_id: string;
  full_name: string;
  email: string;
  business_name: string | null;
  balance: number;
}

export default function AdminDashboard() {
  const [clients, setClients] = useState<ClientWithBalance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    // Get all client profiles
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, email, business_name");

    // Get all client role user_ids
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "client");

    const clientUserIds = new Set(roles?.map((r) => r.user_id) ?? []);

    // Get all transactions
    const { data: transactions } = await supabase.from("transactions").select("*");

    const clientProfiles = (profiles ?? []).filter((p) => clientUserIds.has(p.user_id));

    const result: ClientWithBalance[] = clientProfiles.map((p) => {
      const clientTxns = (transactions ?? []).filter((t) => t.client_id === p.user_id);
      const credits = clientTxns.filter((t) => t.type === "credit").reduce((sum, t) => sum + Number(t.amount), 0);
      const debits = clientTxns.filter((t) => t.type === "debit").reduce((sum, t) => sum + Number(t.amount), 0);
      return { ...p, balance: credits - debits };
    });

    setClients(result);
    setLoading(false);
  };

  const totalBalance = clients.reduce((s, c) => s + c.balance, 0);
  const totalClients = clients.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Overview of all client accounts</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Clients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-16" /> : <p className="text-3xl font-bold">{totalClients}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-24" /> : <p className="text-3xl font-bold">${totalBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>}
          </CardContent>
        </Card>
        <Card className="sm:col-span-2 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Balance</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-3xl font-bold">
                ${totalClients > 0 ? (totalBalance / totalClients).toLocaleString("en-US", { minimumFractionDigits: 2 }) : "0.00"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Client Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : clients.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No clients yet. Add your first client to get started.</p>
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
                          ${client.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
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
