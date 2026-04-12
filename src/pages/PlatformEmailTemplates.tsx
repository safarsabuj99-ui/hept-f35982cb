import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Mail, Edit, Eye } from "lucide-react";
import { toast } from "sonner";

export default function PlatformEmailTemplates() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);

  const { data: templates = [] } = useQuery({
    queryKey: ["email-templates"],
    queryFn: async () => {
      const { data } = await supabase.from("email_templates").select("*").order("key");
      return data || [];
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("email_templates").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["email-templates"] }),
  });

  const updateTemplate = useMutation({
    mutationFn: async (template: any) => {
      const { error } = await supabase.from("email_templates").update({
        subject_en: template.subject_en, subject_bn: template.subject_bn,
        body_html: template.body_html, body_text: template.body_text,
      }).eq("id", template.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      setEditing(null);
      toast.success("Template updated");
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Email Templates" subtitle="Manage automated email communications" />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template Key</TableHead>
                <TableHead>Subject (EN)</TableHead>
                <TableHead>Variables</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell><Badge variant="outline" className="font-mono text-xs">{t.key}</Badge></TableCell>
                  <TableCell className="max-w-[300px] truncate">{t.subject_en}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {(t.variables || []).map((v: string) => (
                        <Badge key={v} variant="secondary" className="text-xs">{`{{${v}}}`}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch checked={t.is_active} onCheckedChange={(checked) => toggleActive.mutate({ id: t.id, is_active: checked })} />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing({ ...t })}><Edit className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setPreview(t)}><Eye className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Edit Template: {editing?.key}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div><Label>Subject (EN)</Label><Input value={editing.subject_en} onChange={(e) => setEditing({ ...editing, subject_en: e.target.value })} /></div>
              <div><Label>Subject (BN)</Label><Input value={editing.subject_bn} onChange={(e) => setEditing({ ...editing, subject_bn: e.target.value })} /></div>
              <div><Label>Body HTML</Label><Textarea rows={8} value={editing.body_html} onChange={(e) => setEditing({ ...editing, body_html: e.target.value })} /></div>
              <div><Label>Body Text</Label><Textarea rows={4} value={editing.body_text} onChange={(e) => setEditing({ ...editing, body_text: e.target.value })} /></div>
              <Button onClick={() => updateTemplate.mutate(editing)} disabled={updateTemplate.isPending}>Save Changes</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Preview: {preview?.key}</DialogTitle></DialogHeader>
          {preview && (
            <div className="space-y-4">
              <div><Label className="text-muted-foreground">Subject</Label><p className="font-medium">{preview.subject_en}</p></div>
              <div className="border rounded-lg p-4 bg-white text-black" dangerouslySetInnerHTML={{ __html: preview.body_html }} />
              <div><Label className="text-muted-foreground">Plain Text</Label><pre className="text-sm bg-muted p-3 rounded whitespace-pre-wrap">{preview.body_text}</pre></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
