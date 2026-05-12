import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, CreditCard, Wallet, Smartphone, Banknote } from "lucide-react";

export interface GatewayRow {
  id: string;
  gateway: string;
  display_name: string;
  mode: "sandbox" | "live";
  is_enabled: boolean;
  supported_currencies: string[];
  priority: number;
  credentials: Record<string, any>;
  public_config: Record<string, any>;
  last_tested_at?: string | null;
  last_test_status?: string | null;
}

interface FieldDef {
  key: string;
  label: string;
  type?: "text" | "password" | "textarea";
  placeholder?: string;
  optional?: boolean;
}

interface GatewayDef {
  label: string;
  icon: any;
  defaultCurrencies: string[];
  fields: FieldDef[];
  hasMode?: boolean;
}

export const GATEWAY_DEFS: Record<string, GatewayDef> = {
  sslcommerz: {
    label: "SSLCommerz",
    icon: CreditCard,
    defaultCurrencies: ["BDT"],
    hasMode: true,
    fields: [
      { key: "store_id", label: "Store ID", placeholder: "yourstore" },
      { key: "store_password", label: "Store Password", type: "password" },
    ],
  },
  stripe: {
    label: "Stripe",
    icon: CreditCard,
    defaultCurrencies: ["USD", "EUR", "GBP"],
    hasMode: true,
    fields: [
      { key: "secret_key", label: "Secret Key", type: "password", placeholder: "sk_live_..." },
      { key: "publishable_key", label: "Publishable Key", placeholder: "pk_live_..." },
      { key: "webhook_secret", label: "Webhook Signing Secret", type: "password", placeholder: "whsec_...", optional: true },
    ],
  },
  paddle: {
    label: "Paddle",
    icon: CreditCard,
    defaultCurrencies: ["USD", "EUR"],
    hasMode: true,
    fields: [
      { key: "vendor_id", label: "Vendor ID" },
      { key: "api_key", label: "API Key", type: "password" },
      { key: "webhook_secret", label: "Webhook Secret", type: "password", optional: true },
    ],
  },
  bkash: {
    label: "bKash",
    icon: Smartphone,
    defaultCurrencies: ["BDT"],
    hasMode: true,
    fields: [
      { key: "app_key", label: "App Key" },
      { key: "app_secret", label: "App Secret", type: "password" },
      { key: "username", label: "Username" },
      { key: "password", label: "Password", type: "password" },
    ],
  },
  nagad: {
    label: "Nagad",
    icon: Smartphone,
    defaultCurrencies: ["BDT"],
    hasMode: true,
    fields: [
      { key: "merchant_id", label: "Merchant ID" },
      { key: "merchant_number", label: "Merchant Number" },
      { key: "private_key", label: "Private Key", type: "textarea" },
      { key: "public_key", label: "Public Key", type: "textarea" },
    ],
  },
  manual: {
    label: "Manual Bank Transfer",
    icon: Banknote,
    defaultCurrencies: ["BDT", "USD"],
    fields: [
      { key: "instructions", label: "Payment Instructions (shown to payers)", type: "textarea",
        placeholder: "Bank: ...\nAccount: ...\nRouting: ..." },
    ],
  },
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: GatewayRow | null;
  onSaved: () => void;
}

export function GatewayDialog({ open, onOpenChange, editing, onSaved }: Props) {
  const [gateway, setGateway] = useState<string>("sslcommerz");
  const [displayName, setDisplayName] = useState("");
  const [mode, setMode] = useState<"sandbox" | "live">("sandbox");
  const [currencies, setCurrencies] = useState("BDT");
  const [priority, setPriority] = useState(100);
  const [enabled, setEnabled] = useState(false);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const def = GATEWAY_DEFS[gateway];

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setGateway(editing.gateway);
      setDisplayName(editing.display_name);
      setMode(editing.mode);
      setCurrencies(editing.supported_currencies.join(","));
      setPriority(editing.priority);
      setEnabled(editing.is_enabled);
      setCredentials(editing.credentials || {});
    } else {
      const g = "sslcommerz";
      setGateway(g);
      setDisplayName(GATEWAY_DEFS[g].label);
      setMode("sandbox");
      setCurrencies(GATEWAY_DEFS[g].defaultCurrencies.join(","));
      setPriority(100);
      setEnabled(false);
      setCredentials({});
    }
  }, [open, editing]);

  function handleGatewayChange(g: string) {
    setGateway(g);
    if (!editing) {
      setDisplayName(GATEWAY_DEFS[g].label);
      setCurrencies(GATEWAY_DEFS[g].defaultCurrencies.join(","));
      setCredentials({});
    }
  }

  async function save() {
    // Validate required credentials
    for (const f of def.fields) {
      if (!f.optional && !credentials[f.key]?.trim()) {
        return toast.error(`${f.label} is required`);
      }
    }

    setSaving(true);
    const payload: any = {
      gateway,
      display_name: displayName.trim() || def.label,
      mode,
      supported_currencies: currencies.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean),
      priority,
      is_enabled: enabled,
      credentials,
    };

    try {
      if (editing) {
        const { error } = await supabase
          .from("platform_payment_gateways" as any)
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Gateway updated");
      } else {
        const { error } = await supabase
          .from("platform_payment_gateways" as any)
          .insert(payload);
        if (error) throw error;
        toast.success("Gateway added");
      }
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Gateway" : "Add Payment Gateway"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Provider</Label>
            <Select value={gateway} onValueChange={handleGatewayChange} disabled={!!editing}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(GATEWAY_DEFS).map(([key, d]) => (
                  <SelectItem key={key} value={key}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Display Name (shown to payers)</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={def.label} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {def.hasMode && (
              <div>
                <Label>Mode</Label>
                <Select value={mode} onValueChange={(v: any) => setMode(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox">Sandbox</SelectItem>
                    <SelectItem value="live">Live</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Priority (lower = first)</Label>
              <Input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
            </div>
          </div>

          <div>
            <Label>Supported Currencies (comma separated)</Label>
            <Input value={currencies} onChange={(e) => setCurrencies(e.target.value)} placeholder="BDT, USD" />
          </div>

          <div className="space-y-3 border-t pt-4">
            <div className="text-sm font-medium">Credentials</div>
            {def.fields.map((f) => (
              <div key={f.key}>
                <Label>
                  {f.label}
                  {f.optional && <span className="text-xs text-muted-foreground ml-1">(optional)</span>}
                </Label>
                {f.type === "textarea" ? (
                  <Textarea
                    value={credentials[f.key] || ""}
                    onChange={(e) => setCredentials({ ...credentials, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    rows={4}
                  />
                ) : (
                  <Input
                    type={f.type === "password" ? "password" : "text"}
                    value={credentials[f.key] || ""}
                    onChange={(e) => setCredentials({ ...credentials, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">Enable immediately</div>
              <div className="text-xs text-muted-foreground">Make this gateway available at checkout</div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? "Save Changes" : "Add Gateway"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
