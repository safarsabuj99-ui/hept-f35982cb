import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2, Megaphone } from "lucide-react";

interface Announcement {
  id: string;
  title: string;
  body: string;
  type: string;
  target_plan: string | null;
  is_active: boolean;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
}

const empty = { title: "", body: "", type: "info", target_plan: "", is_active: true, starts_at: new Date().toISOString().slice(0, 16), ends_at: "" };

export default function PlatformAnnouncements() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetch = async () => {
    const { data } = await supabase.from("platform_announcements" as any).select("*").order("created_at", { ascending: false });
    setItems((data as any[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const openCreate = () => { setEditing(null); setForm(empty); setDialog(true); };
  const openEdit = (a: Announcement) => {
    setEditing(a);
    setForm({ title: a.title, body: a.body, type: a.type, target_plan: a.target_plan || "", is_active: a.is_active, starts_at: a.starts_at?.slice(0, 16) || "", ends_at: a.ends_at?.slice(0, 16) || "" });
    setDialog(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = { ...form, target_plan: form.target_plan || null, ends_at: form.ends_at || null };
    if (editing) {
      await supabase.from("platform_announcements" as any).update(payload as any).eq("id", editing.id);
      toast({ title: "Announcement updated" });
    } else {
      await supabase.from("platform_announcements" as any).insert(payload as any);
      toast({ title: "Announcement created" });
    }
    setSaving(false);
    setDialog(false);
    fetch();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this announcement?")) return;
    await supabase.from("platform_announcements" as any).delete().eq("id", id);
    fetch();
    toast({ title: "Deleted" });
  };

  const typeBadge = (type: string) => {
    const map: Record<string, any> = { info: "default", warning: "outline", maintenance: "destructive" };
    return <Badge variant={map[type] || "secondary"}>{type}</Badge>;
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Announcements</h1>
          <p className="text-sm text-muted-foreground">Broadcast messages to agencies</p>
        </div>
        <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" /> New Announcement</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Starts</TableHead>
                <TableHead>Ends</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.title}</TableCell>
                  <TableCell>{typeBadge(a.type)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{a.target_plan || "All Plans"}</TableCell>
                  <TableCell><Badge variant={a.is_active ? "default" : "secondary"}>{a.is_active ? "Yes" : "No"}</Badge></TableCell>
                  <TableCell className="text-sm">{new Date(a.starts_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-sm">{a.ends_at ? new Date(a.ends_at).toLocaleDateString() : "—"}</TableCell>
                  <TableCell className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No announcements</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label>Active</Label>
            </div>
            <Button onClick={handleSave} disabled={saving || !form.title || !form.body} className="w-full">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {editing ? "Update" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
