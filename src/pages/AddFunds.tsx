import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, DollarSign, ShieldAlert } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { getDhakaDateString } from "@/components/DateRangeFilter";

interface ClientProfile { user_id: string; full_name: string; business_name: string | null; }

export default function AddFunds() {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [clientId, setClientId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(getDhakaDateString());
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { user, role } = useAuth();
  const { toast } = useToast();
  
  const { permissions } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const isManager = role === "manager";
  const backPath = isManager ? "/manager" : "/admin";

  // Pre-select client from query param
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const preselected = params.get("client");
    if (preselected && !clientId) {
      setClientId(preselected);
    }
  }, [location.search]);

  useEffect(() => {
    const fetchClients = async () => {
      if (isManager) {
        // Manager sees only assigned clients via RLS
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, business_name, manager_id" as any);
        setClients((profiles ?? []).filter((p: any) => p.manager_id === user?.id) as unknown as ClientProfile[]);
      } else {
        const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "client");
        const clientIds = roles?.map((r) => r.user_id) ?? [];
        if (clientIds.length === 0) return;
        const { data: profiles } = await supabase
          .from("profiles").select("user_id, full_name, business_name").in("user_id", clientIds);
        setClients(profiles ?? []);
      }
    };
    fetchClients();
  }, [isManager, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !amount || Number(amount) <= 0) return;
    setIsLoading(true);

    const status = isManager ? "pending_approval" : "completed";

    const { error } = await supabase.from("transactions").insert({
      client_id: clientId,
      type: "credit" as const,
      amount: Number(amount),
      date,
      description: description || "Funds deposit",
      created_by: user!.id,
      status,
      exchange_rate: null,
    } as any);

    setIsLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      const msg = isManager
        ? "Deposit submitted for Super Admin approval"
        : `$${Number(amount).toFixed(2)} added successfully`;
      toast({ title: "Success", description: msg });
      navigate(backPath);
    }
  };

  if (isManager && !permissions.can_add_funds) {
    return (
      <div className="mx-auto max-w-lg">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <ShieldAlert className="h-10 w-10 text-muted-foreground" />
            <p className="text-lg font-medium">Access Restricted</p>
            <p className="text-sm text-muted-foreground text-center">You don't have permission to add funds. Contact your admin to update your permissions.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Add Funds</CardTitle>
              <CardDescription>
                {isManager ? "Submit deposit for approval" : "Top-up a client's wallet balance"}
              </CardDescription>
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
              <Label>Amount (USD)</Label>
              <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
              {amount && Number(amount) > 0 && (
                <p className="text-xs text-muted-foreground">Amount: ${Number(amount).toFixed(2)} USD</p>
              )}
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
              {isManager ? "Submit for Approval" : "Add Funds"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
