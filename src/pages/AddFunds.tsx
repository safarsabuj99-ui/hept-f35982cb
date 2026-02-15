import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, DollarSign } from "lucide-react";

interface ClientProfile {
  user_id: string;
  full_name: string;
  business_name: string | null;
}

export default function AddFunds() {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [clientId, setClientId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchClients = async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "client");
      const clientIds = roles?.map((r) => r.user_id) ?? [];
      if (clientIds.length === 0) return;
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, business_name")
        .in("user_id", clientIds);
      setClients(profiles ?? []);
    };
    fetchClients();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !amount || Number(amount) <= 0) return;
    setIsLoading(true);

    const { error } = await supabase.from("transactions").insert({
      client_id: clientId,
      type: "credit" as const,
      amount: Number(amount),
      date,
      description: description || "Funds deposit",
      created_by: user!.id,
    });

    setIsLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: `$${Number(amount).toFixed(2)} added successfully` });
      navigate("/admin");
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <DollarSign className="h-5 w-5 text-success" />
            </div>
            <div>
              <CardTitle>Add Funds</CardTitle>
              <CardDescription>Top-up a client's wallet balance</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="Select a client" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.user_id} value={c.user_id}>
                      {c.full_name} {c.business_name ? `(${c.business_name})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount ($)</Label>
              <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Payment received" />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add Funds
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
