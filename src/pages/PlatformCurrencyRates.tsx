import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Plus } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useState } from "react";

export default function PlatformCurrencyRates() {
  const queryClient = useQueryClient();
  const [manualRate, setManualRate] = useState("");

  const { data: rates = [] } = useQuery({
    queryKey: ["currency-rates"],
    queryFn: async () => {
      const { data } = await supabase.from("currency_rates").select("*").order("updated_at", { ascending: false }).limit(50);
      return data || [];
    },
  });

  const syncRates = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("sync-currency-rates");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["currency-rates"] });
      toast.success(`Rate synced: 1 USD = ৳${data?.rate}`);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const addManualRate = useMutation({
    mutationFn: async () => {
      const rate = parseFloat(manualRate);
      if (!rate || rate <= 0) throw new Error("Invalid rate");
      const { error } = await supabase.from("currency_rates").insert({ from_currency: "USD", to_currency: "BDT", rate, source: "manual" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["currency-rates"] });
      setManualRate("");
      toast.success("Manual rate added");
    },
  });

  const latestRate = rates[0];

  return (
    <div className="space-y-6">
      <PageHeader title="Currency Rates" subtitle="Manage BDT/USD exchange rates" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold">৳{latestRate?.rate || "—"}</div>
            <p className="text-sm text-muted-foreground">Current Rate (1 USD)</p>
            <Badge variant="outline" className="mt-2">{latestRate?.source || "—"}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 space-y-3">
            <Button onClick={() => syncRates.mutate()} disabled={syncRates.isPending} className="w-full">
              <RefreshCw className={`h-4 w-4 mr-2 ${syncRates.isPending ? "animate-spin" : ""}`} />
              Sync from API
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Enter rate (e.g., 121.5)" value={manualRate} onChange={(e) => setManualRate(e.target.value)} type="number" />
              <Button onClick={() => addManualRate.mutate()} disabled={!manualRate}><Plus className="h-4 w-4" /></Button>
            </div>
            <p className="text-xs text-muted-foreground">Add manual USD→BDT rate</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Rate History</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Rate</TableHead><TableHead>Source</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader>
            <TableBody>
              {rates.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{r.from_currency}</TableCell>
                  <TableCell>{r.to_currency}</TableCell>
                  <TableCell className="font-semibold">{r.rate}</TableCell>
                  <TableCell><Badge variant="outline">{r.source}</Badge></TableCell>
                  <TableCell className="text-sm">{format(new Date(r.updated_at), "dd MMM yyyy HH:mm")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
