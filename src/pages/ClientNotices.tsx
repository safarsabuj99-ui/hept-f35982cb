import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Plus, Bell, Trash2, Edit, AlertTriangle, Info, Megaphone } from "lucide-react";
import { format } from "date-fns";

interface ClientNotice {
  id: string;
  title: string;
  message: string;
  type: string;
  target_type: string;
  target_ids: string[];
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  created_by: string;
  org_id: string | null;
  created_at: string;
}

interface ClientOption { user_id: string; full_name: string; }
interface AdAccountOption { id: string; account_name: string; ad_account_id: string; }

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  info: { label: "Info", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: Info },
  warning: { label: "Warning", color: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: AlertTriangle },
  urgent: { label: "Urgent", color: "bg-destructive/10 text-destructive border-destructive/20", icon: Megaphone },
};

function getStatus(notice: ClientNotice) {
  const now = new Date();
  if (!notice.is_active) return { label: "Inactive", variant: "secondary" as const };
  if (new Date(notice.starts_at) > now) return { label: "Scheduled", variant: "outline" as const };
  if (notice.ends_at && new Date(notice.ends_at) < now) return { label: "Expired", variant: "secondary" as const };
  return { label: "Active", variant: "default" as const };
}

const TARGET_LABELS: Record<string, string> = {
  all: "All Clients",
  negative_balance: "Negative Balance",
  ad_account: "Specific Ad Account",
  specific_clients: "Specific Clients",
};

export default function ClientNotices() {
  const { user } = useAuth();
  const [notices, setNotices] = useState<ClientNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClientNotice | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("info");
  const [targetType, setTargetType] = useState("all");
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [isActive, setIsActive] = useState(true);

  // Lookups
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [adAccounts, setAdAccounts] = useState<AdAccountOption[]>([]);

  const fetchNotices = async () => {
    const { data } = await supabase
      .from("client_notices")
      .select("*")
      .order("created_at", { ascending: false });
    setNotices((data as any[]) ?? []);
    setLoading(false);
  };

  const fetchLookups = async () => {
    const [{ data: c }, { data: a }] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name").order("full_name"),
      supabase.from("ad_accounts").select("id, account_name, ad_account_id").eq("is_active", true),
    ]);
    setClients((c ?? []) as ClientOption[]);
    setAdAccounts((a ?? []) as AdAccountOption[]);
  };

  useEffect(() => { fetchNotices(); fetchLookups(); }, []);

  const resetForm = () => {
    setTitle(""); setMessage(""); setType("info"); setTargetType("all");
    setTargetIds([]); setStartsAt(""); setEndsAt(""); setIsActive(true); setEditing(null);
  };

  const openCreate = () => {
    resetForm();
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setStartsAt(now.toISOString().slice(0, 16));
    setDialogOpen(true);
  };

  const openEdit = (n: ClientNotice) => {
    setEditing(n);
    setTitle(n.title); setMessage(n.message); setType(n.type);
    setTargetType(n.target_type); setTargetIds(n.target_ids ?? []);
    setStartsAt(n.starts_at ? new Date(n.starts_at).toISOString().slice(0, 16) : "");
    setEndsAt(n.ends_at ? new Date(n.ends_at).toISOString().slice(0, 16) : "");
    setIsActive(n.is_active);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!title.trim() || !message.trim()) {
      toast({ title: "Title and message are required", variant: "destructive" });
      return;
    }
    const payload: any = {
      title, message, type, target_type: targetType,
      target_ids: (targetType === "ad_account" || targetType === "specific_clients") ? targetIds : [],
      starts_at: new Date(startsAt).toISOString(),
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      is_active: isActive,
    };

    if (editing) {
      const { error } = await supabase.from("client_notices").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Notice updated" });
    } else {
      payload.created_by = user?.id;
      const { error } = await supabase.from("client_notices").insert(payload);
      if (error) { toast({ title: "Create failed", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Notice created" });
    }
    setDialogOpen(false);
    resetForm();
    fetchNotices();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("client_notices").delete().eq("id", id);
    toast({ title: "Notice deleted" });
    fetchNotices();
  };

  const handleToggle = async (id: string, active: boolean) => {
    await supabase.from("client_notices").update({ is_active: active }).eq("id", id);
    fetchNotices();
  };

  const toggleTargetId = (id: string) => {
    setTargetIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Client Notices</h1>
          <p className="text-sm text-muted-foreground mt-1">Create targeted urgent notices for client dashboards</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> New Notice
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : notices.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">No notices created yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notices.map((n) => {
            const status = getStatus(n);
            const tc = TYPE_CONFIG[n.type] || TYPE_CONFIG.info;
            const Icon = tc.icon;
            return (
              <Card key={n.id} className="group">
                <CardContent className="p-4 flex items-start gap-4">
                  <div className={`shrink-0 p-2 rounded-lg border ${tc.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm">{n.title}</h3>
                      <Badge variant={status.variant} className="text-[10px]">{status.label}</Badge>
                      <Badge variant="outline" className="text-[10px]">{TARGET_LABELS[n.target_type] || n.target_type}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.message}</p>
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                      <span>From: {format(new Date(n.starts_at), "MMM d, yyyy h:mm a")}</span>
                      {n.ends_at && <span>To: {format(new Date(n.ends_at), "MMM d, yyyy h:mm a")}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Switch checked={n.is_active} onCheckedChange={(v) => handleToggle(n.id, v)} />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(n)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(n.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Notice" : "Create Notice"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Payment Overdue" />
            </div>
            <div>
              <Label>Message</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Notice body..." rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">ℹ️ Info</SelectItem>
                    <SelectItem value="warning">⚠️ Warning</SelectItem>
                    <SelectItem value="urgent">🚨 Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Target</Label>
                <Select value={targetType} onValueChange={(v) => { setTargetType(v); setTargetIds([]); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Clients</SelectItem>
                    <SelectItem value="negative_balance">Negative Balance</SelectItem>
                    <SelectItem value="ad_account">Specific Ad Account</SelectItem>
                    <SelectItem value="specific_clients">Specific Clients</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {targetType === "specific_clients" && (
              <div>
                <Label className="mb-2 block">Select Clients</Label>
                <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1">
                  {clients.map((c) => (
                    <label key={c.user_id} className="flex items-center gap-2 p-1.5 rounded hover:bg-accent cursor-pointer text-sm">
                      <input type="checkbox" checked={targetIds.includes(c.user_id)} onChange={() => toggleTargetId(c.user_id)} className="rounded" />
                      {c.full_name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {targetType === "ad_account" && (
              <div>
                <Label className="mb-2 block">Select Ad Accounts</Label>
                <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1">
                  {adAccounts.map((a) => (
                    <label key={a.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-accent cursor-pointer text-sm">
                      <input type="checkbox" checked={targetIds.includes(a.id)} onChange={() => toggleTargetId(a.id)} className="rounded" />
                      {a.account_name || a.ad_account_id}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Date & Time</Label>
                <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </div>
              <div>
                <Label>End Date & Time <span className="text-muted-foreground">(optional)</span></Label>
                <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>Active immediately</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editing ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
