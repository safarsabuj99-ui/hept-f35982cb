import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FileText, Plus, CheckCircle, XCircle, Shield } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function PlatformLegal() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newDoc, setNewDoc] = useState({ type: "tos", version: "1.0", title: "", content_html: "", is_current: false });

  const { data: docs = [] } = useQuery({
    queryKey: ["legal-documents"],
    queryFn: async () => {
      const { data } = await supabase.from("legal_documents").select("*").order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: acceptances = [] } = useQuery({
    queryKey: ["document-acceptances"],
    queryFn: async () => {
      const { data } = await supabase.from("document_acceptances")
        .select("*, legal_documents(title, type, version), organizations(name)")
        .order("accepted_at", { ascending: false }).limit(100);
      return data || [];
    },
  });

  const createDoc = useMutation({
    mutationFn: async () => {
      if (newDoc.is_current) {
        // Unset current flag for same type
        await supabase.from("legal_documents").update({ is_current: false }).eq("type", newDoc.type as any).eq("is_current", true);
      }
      const { error } = await supabase.from("legal_documents").insert({
        type: newDoc.type as any, version: newDoc.version, title: newDoc.title,
        content_html: newDoc.content_html, is_current: newDoc.is_current,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["legal-documents"] });
      setCreating(false);
      setNewDoc({ type: "tos", version: "1.0", title: "", content_html: "", is_current: false });
      toast.success("Document created");
    },
  });

  const toggleCurrent = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: string }) => {
      await supabase.from("legal_documents").update({ is_current: false }).eq("type", type as any).eq("is_current", true);
      const { error } = await supabase.from("legal_documents").update({ is_current: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["legal-documents"] }); toast.success("Current document updated"); },
  });

  const currentDocs = docs.filter((d: any) => d.is_current);
  const totalAcceptances = acceptances.length;

  return (
    <div className="space-y-6">
      <PageHeader title="Legal & Compliance" subtitle="Manage legal documents and compliance tracking" />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /><div><div className="text-2xl font-bold">{docs.length}</div><p className="text-sm text-muted-foreground">Total Documents</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><Shield className="h-5 w-5 text-green-500" /><div><div className="text-2xl font-bold">{currentDocs.length}</div><p className="text-sm text-muted-foreground">Active Documents</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><CheckCircle className="h-5 w-5 text-blue-500" /><div><div className="text-2xl font-bold">{totalAcceptances}</div><p className="text-sm text-muted-foreground">Acceptances</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><Button onClick={() => setCreating(true)} className="w-full"><Plus className="h-4 w-4 mr-2" />New Document</Button></CardContent></Card>
      </div>

      <Tabs defaultValue="documents">
        <TabsList><TabsTrigger value="documents">Documents</TabsTrigger><TabsTrigger value="acceptances">Acceptances</TabsTrigger></TabsList>

        <TabsContent value="documents">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Type</TableHead><TableHead>Version</TableHead><TableHead>Current</TableHead><TableHead>Effective</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {docs.map((d: any) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.title}</TableCell>
                      <TableCell><Badge variant="outline">{d.type?.replace("_", " ")}</Badge></TableCell>
                      <TableCell>{d.version}</TableCell>
                      <TableCell>{d.is_current ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}</TableCell>
                      <TableCell className="text-sm">{format(new Date(d.effective_date), "dd MMM yyyy")}</TableCell>
                      <TableCell>{!d.is_current && <Button size="sm" variant="outline" onClick={() => toggleCurrent.mutate({ id: d.id, type: d.type })}>Set Current</Button>}</TableCell>
                    </TableRow>
                  ))}
                  {!docs.length && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No documents</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="acceptances">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Agency</TableHead><TableHead>Document</TableHead><TableHead>Version</TableHead><TableHead>Accepted At</TableHead></TableRow></TableHeader>
                <TableBody>
                  {acceptances.map((a: any) => (
                    <TableRow key={a.id}>
                      <TableCell>{a.organizations?.name || "—"}</TableCell>
                      <TableCell>{a.legal_documents?.title}</TableCell>
                      <TableCell>{a.legal_documents?.version}</TableCell>
                      <TableCell className="text-sm">{format(new Date(a.accepted_at), "dd MMM yyyy HH:mm")}</TableCell>
                    </TableRow>
                  ))}
                  {!acceptances.length && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No acceptances recorded</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Document Dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Create Legal Document</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Type</Label>
                <Select value={newDoc.type} onValueChange={(v) => setNewDoc({ ...newDoc, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tos">Terms of Service</SelectItem>
                    <SelectItem value="privacy_policy">Privacy Policy</SelectItem>
                    <SelectItem value="dpa">Data Processing Agreement</SelectItem>
                    <SelectItem value="sla_agreement">SLA Agreement</SelectItem>
                    <SelectItem value="acceptable_use">Acceptable Use Policy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Version</Label><Input value={newDoc.version} onChange={(e) => setNewDoc({ ...newDoc, version: e.target.value })} /></div>
            </div>
            <div><Label>Title</Label><Input value={newDoc.title} onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })} /></div>
            <div><Label>Content (HTML)</Label><Textarea rows={10} value={newDoc.content_html} onChange={(e) => setNewDoc({ ...newDoc, content_html: e.target.value })} /></div>
            <div className="flex items-center gap-2"><Switch checked={newDoc.is_current} onCheckedChange={(v) => setNewDoc({ ...newDoc, is_current: v })} /><Label>Set as current version</Label></div>
            <Button onClick={() => createDoc.mutate()} disabled={!newDoc.title || createDoc.isPending}>Create Document</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
