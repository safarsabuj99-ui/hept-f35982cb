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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Clock, AlertTriangle, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const priorityColors: Record<string, string> = { low: "bg-muted", medium: "bg-blue-100 text-blue-800", high: "bg-orange-100 text-orange-800", urgent: "bg-red-100 text-red-800" };
const statusColors: Record<string, string> = { open: "bg-yellow-100 text-yellow-800", in_progress: "bg-blue-100 text-blue-800", waiting: "bg-purple-100 text-purple-800", resolved: "bg-green-100 text-green-800", closed: "bg-muted" };

export default function PlatformSupport() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [reply, setReply] = useState("");

  const { data: tickets = [] } = useQuery({
    queryKey: ["support-tickets-all"],
    queryFn: async () => {
      const { data } = await supabase.from("support_tickets")
        .select("*, organizations(name)").order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["ticket-messages", selectedTicket?.id],
    enabled: !!selectedTicket,
    queryFn: async () => {
      const { data } = await supabase.from("ticket_messages")
        .select("*").eq("ticket_id", selectedTicket.id).order("created_at");
      return data || [];
    },
  });

  const { data: tiers = [] } = useQuery({
    queryKey: ["support-tiers"],
    queryFn: async () => {
      const { data } = await supabase.from("support_tiers").select("*");
      return data || [];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: any = { status };
      if (status === "resolved") updates.resolved_at = new Date().toISOString();
      if (status === "in_progress" && !selectedTicket?.first_response_at) updates.first_response_at = new Date().toISOString();
      const { error } = await supabase.from("support_tickets").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["support-tickets-all"] }); toast.success("Status updated"); },
  });

  const sendReply = useMutation({
    mutationFn: async () => {
      if (!reply.trim() || !selectedTicket) return;
      const { error } = await supabase.from("ticket_messages").insert({
        ticket_id: selectedTicket.id, user_id: user?.id || "", message: reply, is_internal: false,
      });
      if (error) throw error;
      // Mark first response if not set
      if (!selectedTicket.first_response_at) {
        await supabase.from("support_tickets").update({ first_response_at: new Date().toISOString(), status: "in_progress" as any }).eq("id", selectedTicket.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-messages", selectedTicket?.id] });
      queryClient.invalidateQueries({ queryKey: ["support-tickets-all"] });
      setReply("");
      toast.success("Reply sent");
    },
  });

  const openCount = tickets.filter((t: any) => t.status === "open").length;
  const breachedCount = tickets.filter((t: any) => t.sla_breached).length;
  const resolvedCount = tickets.filter((t: any) => t.status === "resolved" || t.status === "closed").length;

  return (
    <div className="space-y-6">
      <PageHeader title="Support Center" subtitle="Manage support tickets and SLA compliance" />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><MessageSquare className="h-5 w-5 text-primary" /><div><div className="text-2xl font-bold">{tickets.length}</div><p className="text-sm text-muted-foreground">Total Tickets</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><Clock className="h-5 w-5 text-yellow-500" /><div><div className="text-2xl font-bold">{openCount}</div><p className="text-sm text-muted-foreground">Open</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-500" /><div><div className="text-2xl font-bold">{breachedCount}</div><p className="text-sm text-muted-foreground">SLA Breached</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><CheckCircle className="h-5 w-5 text-green-500" /><div><div className="text-2xl font-bold">{resolvedCount}</div><p className="text-sm text-muted-foreground">Resolved</p></div></div></CardContent></Card>
      </div>

      <Tabs defaultValue="tickets">
        <TabsList><TabsTrigger value="tickets">Tickets</TabsTrigger><TabsTrigger value="tiers">SLA Tiers</TabsTrigger></TabsList>

        <TabsContent value="tickets">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Subject</TableHead><TableHead>Agency</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead><TableHead>SLA</TableHead><TableHead>Created</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {tickets.map((t: any) => (
                    <TableRow key={t.id} className="cursor-pointer" onClick={() => setSelectedTicket(t)}>
                      <TableCell className="font-medium max-w-[200px] truncate">{t.subject}</TableCell>
                      <TableCell>{t.organizations?.name || "—"}</TableCell>
                      <TableCell><Badge className={priorityColors[t.priority] || ""}>{t.priority}</Badge></TableCell>
                      <TableCell><Badge className={statusColors[t.status] || ""}>{t.status?.replace("_", " ")}</Badge></TableCell>
                      <TableCell>{t.sla_breached ? <Badge variant="destructive">Breached</Badge> : <Badge className="bg-green-100 text-green-800">OK</Badge>}</TableCell>
                      <TableCell className="text-sm">{format(new Date(t.created_at), "dd MMM HH:mm")}</TableCell>
                      <TableCell>
                        <Select value={t.status} onValueChange={(v) => { updateStatus.mutate({ id: t.id, status: v }); }}>
                          <SelectTrigger className="w-[120px] h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="waiting">Waiting</SelectItem>
                            <SelectItem value="resolved">Resolved</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!tickets.length && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No tickets</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tiers">
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {tiers.map((tier: any) => (
                  <div key={tier.id} className="border rounded-lg p-4 space-y-2">
                    <Badge variant="outline" className="text-sm">{tier.plan_key}</Badge>
                    <h4 className="font-semibold capitalize">{tier.priority_level}</h4>
                    <div className="text-sm space-y-1 text-muted-foreground">
                      <p>Response: {tier.response_time_hours}h</p>
                      <p>Resolution: {tier.resolution_time_hours}h</p>
                      <p>Channels: {(tier.channels || []).join(", ")}</p>
                      <p>Dedicated Manager: {tier.dedicated_manager ? "Yes" : "No"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Ticket Detail Dialog */}
      <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{selectedTicket?.subject}</DialogTitle></DialogHeader>
          {selectedTicket && (
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <Badge className={priorityColors[selectedTicket.priority]}>{selectedTicket.priority}</Badge>
                <Badge className={statusColors[selectedTicket.status]}>{selectedTicket.status?.replace("_", " ")}</Badge>
                {selectedTicket.sla_breached && <Badge variant="destructive">SLA Breached</Badge>}
              </div>
              <p className="text-sm">{selectedTicket.description}</p>

              <div className="border-t pt-4 space-y-3">
                <h4 className="font-semibold text-sm">Messages</h4>
                {messages.map((m: any) => (
                  <div key={m.id} className={`p-3 rounded-lg text-sm ${m.is_internal ? "bg-yellow-50 border-yellow-200" : "bg-muted"}`}>
                    <p>{m.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">{format(new Date(m.created_at), "dd MMM HH:mm")}{m.is_internal && " (Internal)"}</p>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Textarea placeholder="Type your reply..." value={reply} onChange={(e) => setReply(e.target.value)} rows={3} />
              </div>
              <Button onClick={() => sendReply.mutate()} disabled={!reply.trim() || sendReply.isPending}>Send Reply</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
