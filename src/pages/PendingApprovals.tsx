import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { TablePagination } from "@/components/TablePagination";

interface PendingTransaction {
  id: string;
  client_id: string;
  amount: number;
  description: string | null;
  date: string;
  created_at: string;
  created_by: string;
  client_name?: string;
  creator_name?: string;
}

export default function PendingApprovals() {
  const [pending, setPending] = useState<PendingTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { toast } = useToast();
  

  const fetchPending = async () => {
    const { data: txns } = await (supabase
      .from("transactions")
      .select("*")
      .eq("type", "credit") as any)
      .eq("status", "pending_approval")
      .order("created_at", { ascending: false });

    if (!txns || txns.length === 0) {
      setPending([]);
      setLoading(false);
      return;
    }

    // Fetch profile names
    const userIds = [...new Set([...txns.map((t: any) => t.client_id), ...txns.map((t: any) => t.created_by)])];
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
    const nameMap = Object.fromEntries((profiles ?? []).map((p) => [p.user_id, p.full_name]));

    setPending(
      txns.map((t: any) => ({
        ...t,
        client_name: nameMap[t.client_id] || "Unknown",
        creator_name: nameMap[t.created_by] || "Unknown",
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const handleAction = async (id: string, status: "completed" | "rejected") => {
    setProcessing(id);
    const { error } = await supabase
      .from("transactions")
      .update({ status } as any)
      .eq("id", id);

    setProcessing(null);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: status === "completed" ? "Approved" : "Rejected", description: `Transaction ${status}` });
      fetchPending();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pending Approvals</h1>
        <p className="text-muted-foreground">Review and approve fund deposits submitted by managers</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : pending.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No pending approvals</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead className="hidden sm:table-cell">Submitted By</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="whitespace-nowrap">{new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</TableCell>
                      <TableCell className="font-medium">{t.client_name}</TableCell>
                      <TableCell className="hidden sm:table-cell">{t.creator_name}</TableCell>
                      <TableCell className="hidden md:table-cell">{t.description || "—"}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">{`$${Number(t.amount).toFixed(2)}`}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleAction(t.id, "completed")}
                            disabled={processing === t.id}
                            className="gap-1"
                          >
                            {processing === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleAction(t.id, "rejected")}
                            disabled={processing === t.id}
                            className="gap-1"
                          >
                            <XCircle className="h-3 w-3" />
                            Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination totalItems={pending.length} pageSize={pageSize} currentPage={currentPage} onPageChange={setCurrentPage} onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
