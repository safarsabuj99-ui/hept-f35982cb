import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, MessageSquare, Clock } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useProfile } from "@/hooks/useProfile";

const priorityColors: Record<string, string> = { low: "bg-muted", medium: "bg-blue-100 text-blue-800", high: "bg-orange-100 text-orange-800", urgent: "bg-red-100 text-red-800" };
const statusColors: Record<string, string> = { open: "bg-yellow-100 text-yellow-800", in_progress: "bg-blue-100 text-blue-800", waiting: "bg-purple-100 text-purple-800", resolved: "bg-green-100 text-green-800", closed: "bg-muted" };

export default function AgencySupport() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newTicket, setNewTicket] = useState({ subject: "", description: "", priority: "medium" });
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [reply, setReply] = useState("");

  const { data: tickets = [] } = useQuery({
    queryKey: ["my-support-tickets"],
    queryFn: async () => {
      const { data } = await supabase.from("support_tickets").select("*").order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["my-ticket-messages", selectedTicket?.id],
    enabled: !!selectedTicket,
    queryFn: async () => {
      const { data } = await supabase.from("ticket_messages")
        .select("*").eq("ticket_id", selectedTicket.id).eq("is_internal", false).order("created_at");
      return data || [];
    },
  });

  const { data: tier } = useQuery({
    queryKey: ["my-support-tier"],
    queryFn: async () => {
      if (!profile?.org_id) return null;
      const { data: org } = await supabase.from("organizations").select("plan").eq("id", profile.org_id).single();
      if (!org) return null;
      const { data } = await supabase.from("support_tiers").select("*").eq("plan_key", org.plan).single();
      return data;
    },
    enabled: !!profile?.org_id,
  });

  const createTicket = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("support_tickets").insert({
        org_id: profile?.org_id || "", user_id: user?.id || "",
        subject: newTicket.subject, description: newTicket.description,
        priority: newTicket.priority as any,
        tier_id: tier?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-support-tickets"] });
      setCreating(false);
      setNewTicket({ subject: "", description: "", priority: "medium" });
      toast.success("Ticket created");
    },
  });

  const sendReply = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("ticket_messages").insert({
        ticket_id: selectedTicket.id, user_id: user?.id || "", message: reply, is_internal: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-ticket-messages", selectedTicket?.id] });
      setReply("");
      toast.success("Reply sent");
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Support" subtitle="Get help from our team" />

      {tier && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold capitalize">{tier.priority_level} Support</h3>
                <p className="text-sm text-muted-foreground">Response: {tier.response_time_hours}h | Resolution: {tier.resolution_time_hours}h | Channels: {(tier.channels || []).join(", ")}</p>
              </div>
              <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-2" />New Ticket</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>My Tickets</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Subject</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
            <TableBody>
              {tickets.map((t: any) => (
                <TableRow key={t.id} className="cursor-pointer" onClick={() => setSelectedTicket(t)}>
                  <TableCell className="font-medium">{t.subject}</TableCell>
                  <TableCell><Badge className={priorityColors[t.priority]}>{t.priority}</Badge></TableCell>
                  <TableCell><Badge className={statusColors[t.status]}>{t.status?.replace("_", " ")}</Badge></TableCell>
                  <TableCell className="text-sm">{format(new Date(t.created_at), "dd MMM yyyy HH:mm")}</TableCell>
                </TableRow>
              ))}
              {!tickets.length && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No tickets yet. Create one to get help!</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Ticket */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Support Ticket</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Subject</Label><Input value={newTicket.subject} onChange={(e) => setNewTicket({ ...newTicket, subject: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea rows={4} value={newTicket.description} onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })} /></div>
            <div><Label>Priority</Label>
              <Select value={newTicket.priority} onValueChange={(v) => setNewTicket({ ...newTicket, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => createTicket.mutate()} disabled={!newTicket.subject || createTicket.isPending}>Submit Ticket</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ticket Detail */}
      <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{selectedTicket?.subject}</DialogTitle></DialogHeader>
          {selectedTicket && (
            <div className="space-y-4">
              <p className="text-sm">{selectedTicket.description}</p>
              <div className="border-t pt-4 space-y-3">
                {messages.map((m: any) => (
                  <div key={m.id} className="p-3 rounded-lg text-sm bg-muted">
                    <p>{m.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">{format(new Date(m.created_at), "dd MMM HH:mm")}</p>
                  </div>
                ))}
              </div>
              <Textarea placeholder="Reply..." value={reply} onChange={(e) => setReply(e.target.value)} rows={3} />
              <Button onClick={() => sendReply.mutate()} disabled={!reply.trim()}>Send Reply</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
