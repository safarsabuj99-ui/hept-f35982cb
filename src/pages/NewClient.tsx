import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserPlus } from "lucide-react";

interface ManagerOption { user_id: string; full_name: string; }

export default function NewClient() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [password, setPassword] = useState("");
  const [customRate, setCustomRate] = useState("");
  const [role, setRole] = useState<"client" | "manager">("client");
  const [managerId, setManagerId] = useState("");
  const [mappingKeyword, setMappingKeyword] = useState("");
  const [pricingMode, setPricingMode] = useState<"flat" | "percentage" | "default">("default");
  const [flatMeta, setFlatMeta] = useState("");
  const [flatTiktok, setFlatTiktok] = useState("");
  const [flatGoogle, setFlatGoogle] = useState("");
  const [markupPercent, setMarkupPercent] = useState("");
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchManagers = async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "manager");
      const managerIds = roles?.map((r) => r.user_id) ?? [];
      if (managerIds.length === 0) return;
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", managerIds);
      setManagers(profiles ?? []);
    };
    fetchManagers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !password) return;
    if (password.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    setIsLoading(true);

    let pricingConfig = null;
    if (role === "client" && pricingMode === "flat") {
      pricingConfig = { mode: "flat", flat_rates: { meta: Number(flatMeta) || 145, tiktok: Number(flatTiktok) || 150, google: Number(flatGoogle) || 155 } };
    } else if (role === "client" && pricingMode === "percentage") {
      pricingConfig = { mode: "percentage", percentage: Number(markupPercent) || 15 };
    }

    const res = await supabase.functions.invoke("create-client", {
      body: {
        email, password, full_name: fullName, phone, business_name: businessName,
        role,
        manager_id: role === "client" && managerId ? managerId : null,
        mapping_keyword: role === "client" && mappingKeyword ? mappingKeyword : null,
        custom_exchange_rate: role === "client" && customRate ? Number(customRate) : null,
        pricing_config: pricingConfig,
      },
    });

    setIsLoading(false);
    if (res.error || res.data?.error) {
      toast({ title: "Error", description: res.data?.error || res.error?.message || "Failed to create account", variant: "destructive" });
    } else {
      toast({ title: "Success", description: `${role === "manager" ? "Manager" : "Client"} ${fullName} created` });
      navigate("/admin");
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <UserPlus className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>New Account</CardTitle>
              <CardDescription>Create a new client or manager account</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Account Type</Label>
              <Select value={role} onValueChange={(v) => setRole(v as "client" | "manager")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" required />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@company.com" required />
            </div>
            <div className="space-y-2">
              <Label>Password *</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" required />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 234 567 8900" />
            </div>
            <div className="space-y-2">
              <Label>Business Name</Label>
              <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Acme Corp" />
            </div>
            {role === "client" && (
              <>
                <div className="space-y-2">
                  <Label>Mapping Keyword</Label>
                  <Input value={mappingKeyword} onChange={(e) => setMappingKeyword(e.target.value)} placeholder="e.g. CL_Rahim (for auto campaign mapping)" />
                  <p className="text-xs text-muted-foreground">Campaigns containing this keyword will auto-assign to this client</p>
                </div>
                <div className="space-y-2">
                  <Label>Custom Exchange Rate (optional)</Label>
                  <Input type="number" value={customRate} onChange={(e) => setCustomRate(e.target.value)} placeholder="e.g. 118 — overrides global rate" step="0.5" min="1" />
                  <p className="text-xs text-muted-foreground">Leave blank to use the global BDT/USD rate</p>
                </div>
                <div className="space-y-2">
                  <Label>Pricing Model</Label>
                   <Select value={pricingMode} onValueChange={(v) => setPricingMode(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default (Custom Rate)</SelectItem>
                      <SelectItem value="flat">Flat Rate per Platform</SelectItem>
                      <SelectItem value="percentage">Percentage Markup</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {pricingMode === "flat" && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Meta Rate</Label>
                      <Input type="number" placeholder="145" value={flatMeta} onChange={e => setFlatMeta(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">TikTok Rate</Label>
                      <Input type="number" placeholder="150" value={flatTiktok} onChange={e => setFlatTiktok(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Google Rate</Label>
                      <Input type="number" placeholder="155" value={flatGoogle} onChange={e => setFlatGoogle(e.target.value)} />
                    </div>
                  </div>
                )}
                {pricingMode === "percentage" && (
                  <div className="space-y-2">
                    <Label>Markup %</Label>
                    <Input type="number" placeholder="15" value={markupPercent} onChange={e => setMarkupPercent(e.target.value)} />
                    <p className="text-xs text-muted-foreground">Service charge added on top of market rate spend</p>
                  </div>
                )}
              </>
            )}
            {role === "client" && managers.length > 0 && (
              <div className="space-y-2">
                <Label>Assign Manager (optional)</Label>
                <Select value={managerId} onValueChange={setManagerId}>
                  <SelectTrigger><SelectValue placeholder="— None —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {managers.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>{m.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create {role === "manager" ? "Manager" : "Client"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
