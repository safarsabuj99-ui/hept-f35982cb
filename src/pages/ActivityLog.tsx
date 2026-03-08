import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowUpCircle, ArrowDownCircle, Bot } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Transaction {
  id: string;
  type: "credit" | "debit";
  amount: number;
  description: string | null;
  date: string;
  created_at: string;
  status: string;
  platform: string | null;
  client_id: string;
}

export default function ActivityLog() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "auto" | "manual">("all");

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("transactions")
        .select("id, type, amount, description, date, created_at, status, platform, client_id")
        .order("created_at", { ascending: false })
        .limit(200);
      setTransactions((data as Transaction[]) ?? []);
      setLoading(false);
    };
    fetch();
  }, []);

  const isAuto = (t: Transaction) => t.description?.startsWith("auto_spend:");

  const filtered = transactions.filter((t) => {
    if (filter === "auto") return isAuto(t);
    if (filter === "manual") return !isAuto(t);
    return true;
  });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-[400px]" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Activity Log</h1>
          <p className="text-sm text-muted-foreground">All transactions including automated ad spend</p>
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Activity</SelectItem>
            <SelectItem value="auto">Auto Spend</SelectItem>
            <SelectItem value="manual">Manual Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                    No activity found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {t.type === "credit" ? (
                          <ArrowUpCircle className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <ArrowDownCircle className="h-4 w-4 text-destructive" />
                        )}
                        <span className="capitalize text-sm">{t.type}</span>
                        {isAuto(t) && (
                          <Badge variant="secondary" className="text-[10px] gap-1 px-1.5">
                            <Bot className="h-3 w-3" /> Auto
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate text-sm">
                      {isAuto(t) ? t.description?.replace("auto_spend:", "").trim() : t.description || "—"}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm font-medium">
                        {t.type === "credit" ? "+" : "-"}${Number(t.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{formatDate(t.created_at)}</div>
                      <div className="text-xs text-muted-foreground">{formatTime(t.created_at)}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.status === "completed" ? "default" : t.status === "rejected" ? "destructive" : "outline"} className="text-xs">
                        {t.status === "pending_approval" ? "Pending" : t.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
