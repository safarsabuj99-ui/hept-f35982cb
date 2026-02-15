import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingDown, Clock } from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

const PLATFORM_COLORS: Record<string, string> = {
  meta: "hsl(214, 80%, 52%)",
  tiktok: "hsl(340, 75%, 55%)",
  google: "hsl(142, 60%, 45%)",
};

const PLATFORM_LABELS: Record<string, string> = {
  meta: "Meta",
  tiktok: "TikTok",
  google: "Google",
};

interface Transaction {
  id: string;
  type: "credit" | "debit";
  amount: number;
  platform: string | null;
  description: string | null;
  date: string;
  created_at: string;
}

export default function ClientDashboard() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("transactions")
        .select("*")
        .eq("client_id", user.id)
        .order("date", { ascending: false });
      setTransactions((data as Transaction[]) ?? []);
      setLoading(false);
    };
    fetch();
  }, [user]);

  const credits = transactions.filter((t) => t.type === "credit").reduce((s, t) => s + Number(t.amount), 0);
  const debits = transactions.filter((t) => t.type === "debit").reduce((s, t) => s + Number(t.amount), 0);
  const balance = credits - debits;

  const lastUpdated = transactions.length > 0 ? new Date(transactions[0].created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

  // Platform breakdown
  const platformData = Object.entries(
    transactions
      .filter((t) => t.type === "debit" && t.platform)
      .reduce<Record<string, number>>((acc, t) => {
        const key = t.platform!;
        acc[key] = (acc[key] || 0) + Number(t.amount);
        return acc;
      }, {})
  ).map(([platform, value]) => ({ name: PLATFORM_LABELS[platform] || platform, value, platform }));

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Dashboard</h1>
        <p className="text-muted-foreground">Your ad spend overview</p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Current Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">{fmt(balance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Spent</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{fmt(debits)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Last Updated</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{lastUpdated}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      {platformData.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Platform Split</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={platformData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {platformData.map((entry) => (
                      <Cell key={entry.platform} fill={PLATFORM_COLORS[entry.platform] || "#888"} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => fmt(value)} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Spend by Platform</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={platformData}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(value: number) => fmt(value)} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {platformData.map((entry) => (
                      <Cell key={entry.platform} fill={PLATFORM_COLORS[entry.platform] || "#888"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Transaction history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No transactions yet</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="hidden sm:table-cell">Platform</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="whitespace-nowrap">{new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</TableCell>
                      <TableCell>
                        <Badge variant={t.type === "credit" ? "default" : "destructive"} className="capitalize">
                          {t.type === "credit" ? "Deposit" : "Spend"}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{t.platform ? PLATFORM_LABELS[t.platform] : "—"}</TableCell>
                      <TableCell className="hidden md:table-cell">{t.description || "—"}</TableCell>
                      <TableCell className="text-right font-mono">
                        <span className={t.type === "credit" ? "text-success" : "text-destructive"}>
                          {t.type === "credit" ? "+" : "-"}{fmt(Number(t.amount))}
                        </span>
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
