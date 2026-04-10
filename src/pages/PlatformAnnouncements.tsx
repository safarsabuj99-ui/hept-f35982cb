import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Megaphone, Loader2 } from "lucide-react";

interface Announcement {
  id: string; title: string; body: string; type: string; target_plan: string | null;
  is_active: boolean; starts_at: string; ends_at: string | null; created_at: string;
}

const empty = { title: "", body: "", type: "info", target_plan: "", is_active: true, starts_at: new Date().toISOString().slice(0, 16), ends_at: "" };

const typeBorderColors: Record<string, string> = {
  info: "border-l-4 border-l-blue-500",
  warning: "border-l-4 border-l-warning",
  maintenance: "border-l-4 border-l-destructive",
};

const typeBadgeColors: Record<string, string> = {
  info: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  warning: "bg-warning/15 text-warning border-warning/20",
  maintenance: "bg-destructive/15 text-destructive border-destructive/20",
};

export default function PlatformAnnouncements() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchAnnouncements = async () => {
    const { data } = await supabase.from("platform_announcements" as any).select("*").order("created_at", { ascending: false });
    setItems((data as any[]) ?? []); setLoading(false);
  };

  useEffect(() => { fetchAnnouncements(); }, []);

  const openCreate = () => { setEditing(null); setForm(empty); setDialog(true); };
  const openEdit = (a: Announcement) => {
    setEditing(a);
    setForm({ title: a.title, body: a.body, type: a.type, target_plan: a.target_plan || "", is_active: a.is_active, starts_at: a.starts_at?.slice(0, 16) || "", ends_at: a.ends_at?.slice(0, 16) || "" });
    setDialog(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = { ...form, target_plan: form.target_plan || null, ends_at: form.ends_at || null };
    if (editing) { await supabase.from("platform_announcements" as any).update(payload as any).eq("id", editing.id); toast({ title: "Announcement updated" }); }
    else { await supabase.from("platform_announcements" as any).insert(payload as any); toast({ title: "Announcement created" }); }
    setSaving(false); setDialog(false); fetchAnnouncements();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this announcement?")) return;
    await supabase.from("platform_announcements" as any).delete().eq("id", id);
    fetchAnnouncements(); toast({ title: "Deleted" });
  };

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
    </div>
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Announcements"
        subtitle="Broadcast messages to agencies"
        icon={<Megaphone className="h-6 w-6 text-primary" />}
        actions={<Button onClick={openCreate} className="press-effect gap-2"><Plus className="h-4 w-4" /> New Announcement</Button>}
      />

      <div className="space-y-3">
        {items.map((a, i) => (
          <div
            key={a.id}
            className={`glass-card glow-border ${typeBorderColors[a.type] || ""} ${!a.is_active ? "opacity-50" : ""} animate-slide-up-fade`}
            style={{ animationDelay: `${Math.min(i, 8) * 60}ms`, animationFillMode: "forwards" }}
          >
            <Card className="border-0 bg-transparent shadow-none">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground">{a.title}</h3>
                      <Badge className={typeBadgeColors[a.type] || "bg-muted text-muted-foreground"}>{a.type}</Badge>
                      {!a.is_active && <Badge variant="secondary">Inactive</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{a.body}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                      <span>Target: {a.target_plan || "All Plans"}</span>
                      <span>Starts: {new Date(a.starts_at).toLocaleDateString()}</span>
                      {a.ends_at && <span>Ends: {new Date(a.ends_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ))}
        {items.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Megaphone className="mx-auto h-12 w-12 mb-4 opacity-30" />
            <p>No announcements yet</p>
          </div>
        )}
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} Announcement</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>Body</Label><textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px]" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Target Plan (optional)</Label><Input value={form.target_plan} onChange={(e) => setForm({ ...form, target_plan: e.target.value })} placeholder="Leave empty for all" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Starts At</Label><Input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></div>
              <div><Label>Ends At</Label><Input type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
            <Button onClick={handleSave} disabled={saving || !form.title || !form.body} className="w-full">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {editing ? "Update" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
