import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserPlus, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ManagerOption { user_id: string; full_name: string; }

export default function NewClient() {
  const [adminOrgId, setAdminOrgId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"client" | "manager">("client");
  const [managerId, setManagerId] = useState("");
  const [mappingKeyword, setMappingKeyword] = useState("");
  const [flatMeta, setFlatMeta] = useState("145");
  const [flatTiktok, setFlatTiktok] = useState("150");
  const [flatGoogle, setFlatGoogle] = useState("155");
  const [markupPercent, setMarkupPercent] = useState("");
  const [syncStartDate, setSyncStartDate] = useState<Date>(new Date());
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
    const fetchOrgId = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("org_id").eq("user_id", user.id).maybeSingle();
      if (data?.org_id) setAdminOrgId(data.org_id);
    };
    fetchManagers();
    fetchOrgId();
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
    if (role === "client") {
      pricingConfig = {
        platform_rates: {
          meta: Number(flatMeta) || 145,
          tiktok: Number(flatTiktok) || 150,
          google: Number(flatGoogle) || 155,
        },
        percentage: markupPercent ? Number(markupPercent) : 0,
      };
    }

    const res = await supabase.functions.invoke("create-client", {
      body: {
        email, password, full_name: fullName, phone, business_name: businessName,
        role,
        manager_id: role === "client" && managerId ? managerId : null,
        mapping_keyword: role === "client" && mappingKeyword ? mappingKeyword : null,
        pricing_config: pricingConfig,
        data_fetch_start_date: role === "client" ? format(syncStartDate, "yyyy-MM-dd") : null,
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
                   <Label>Data Sync Start Date</Label>
                   <Popover>
                     <PopoverTrigger asChild>
                       <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !syncStartDate && "text-muted-foreground")}>
                         <CalendarIcon className="mr-2 h-4 w-4" />
                         {syncStartDate ? format(syncStartDate, "PPP") : <span>Pick a date</span>}
                       </Button>
                     </PopoverTrigger>
                     <PopoverContent className="w-auto p-0" align="start">
                       <Calendar mode="single" selected={syncStartDate} onSelect={(d) => d && setSyncStartDate(d)} disabled={(date) => date > new Date()} initialFocus className={cn("p-3 pointer-events-auto")} />
                     </PopoverContent>
                   </Popover>
                   <p className="text-xs text-muted-foreground">Historical ad data will be fetched starting from this date</p>
                 </div>
                 <div className="space-y-2">
                   <Label>Mapping Keyword</Label>
                  <Input value={mappingKeyword} onChange={(e) => setMappingKeyword(e.target.value)} placeholder="e.g. CL_Rahim (for auto campaign mapping)" />
                  <p className="text-xs text-muted-foreground">Campaigns containing this keyword will auto-assign to this client</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Platform Rates (USD → BDT)</Label>
                  <p className="text-xs text-muted-foreground mb-2">Set billing rate per dollar for each platform</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Meta</Label>
                      <Input type="number" placeholder="145" value={flatMeta} onChange={e => setFlatMeta(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">TikTok</Label>
                      <Input type="number" placeholder="150" value={flatTiktok} onChange={e => setFlatTiktok(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Google</Label>
                      <Input type="number" placeholder="155" value={flatGoogle} onChange={e => setFlatGoogle(e.target.value)} />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Percentage Markup (optional)</Label>
                  <Input type="number" placeholder="e.g. 10" value={markupPercent} onChange={e => setMarkupPercent(e.target.value)} />
                  <p className="text-xs text-muted-foreground">For USD-billing clients — service charge % on top of spend (0 = none)</p>
                </div>
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
