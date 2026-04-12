import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/hooks/use-toast";
import { Copy, Link2, Loader2, MousePointerClick, Plus } from "lucide-react";

export default function AffiliateLinks() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [affiliateId, setAffiliateId] = useState<string | null>(null);
  const [links, setLinks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [newCode, setNewCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const baseUrl = window.location.origin;

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    const { data: aff } = await supabase.from("affiliates").select("id").eq("user_id", user!.id).single();
    if (!aff) { setLoading(false); return; }
    setAffiliateId(aff.id);

    const { data } = await supabase.from("affiliate_links").select("*").eq("affiliate_id", aff.id).order("created_at", { ascending: false });
    setLinks(data || []);
    setLoading(false);
  };

  const generateCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  };

  const handleCreate = async () => {
    if (!affiliateId || !newLabel.trim()) return;
    setCreating(true);
    const code = newCode.trim() || generateCode();

    const { error } = await supabase.from("affiliate_links").insert({
      affiliate_id: affiliateId,
      code,
      label: newLabel.trim(),
    });

    if (error) {
      toast({ title: "Failed to create link", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Link created!" });
      setNewLabel("");
      setNewCode("");
      setDialogOpen(false);
      loadData();
    }
    setCreating(false);
  };

  const copyLink = (code: string) => {
    navigator.clipboard.writeText(`${baseUrl}/signup?ref=${code}`);
    toast({ title: "Link copied to clipboard!" });
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("affiliate_links").update({ is_active: !current }).eq("id", id);
    loadData();
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="My Referral Links" subtitle="Generate and manage your tracking links">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Link</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Referral Link</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Link Label *</Label>
                <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Facebook Campaign" />
              </div>
              <div className="space-y-2">
                <Label>Custom Code (optional)</Label>
                <Input value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="Auto-generated if empty" maxLength={12} />
                {newCode && <p className="text-xs text-muted-foreground">Link: {baseUrl}/signup?ref={newCode}</p>}
              </div>
              <Button onClick={handleCreate} disabled={creating || !newLabel.trim()} className="w-full">
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create Link
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Referral Link</TableHead>
                <TableHead className="text-center">Clicks</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No links yet. Create your first referral link!</TableCell></TableRow>
              ) : links.map((link) => (
                <TableRow key={link.id}>
                  <TableCell className="font-medium">{link.label}</TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-2 py-1 rounded">{baseUrl}/signup?ref={link.code}</code>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <MousePointerClick className="h-3.5 w-3.5 text-muted-foreground" />
                      {link.clicks}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={link.is_active ? "default" : "secondary"} className="cursor-pointer" onClick={() => toggleActive(link.id, link.is_active)}>
                      {link.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => copyLink(link.code)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
