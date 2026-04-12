import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { format } from "date-fns";
import { Search } from "lucide-react";

const statusColors: Record<string, string> = {
  queued: "bg-yellow-100 text-yellow-800",
  sent: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  bounced: "bg-red-100 text-red-800",
};

export default function PlatformEmailLog() {
  const [search, setSearch] = useState("");

  const { data: logs = [] } = useQuery({
    queryKey: ["email-log"],
    queryFn: async () => {
      const { data } = await supabase.from("email_log")
        .select("*, organizations(name)").order("created_at", { ascending: false }).limit(200);
      return data || [];
    },
  });

  const filtered = search ? logs.filter((l: any) =>
    l.to_email?.toLowerCase().includes(search.toLowerCase()) ||
    l.template_key?.toLowerCase().includes(search.toLowerCase()) ||
    l.subject?.toLowerCase().includes(search.toLowerCase())
  ) : logs;

  return (
    <div className="space-y-6">
      <PageHeader title="Email Log" subtitle="Track all sent emails" />

      <div className="flex gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search emails..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2 items-center text-sm text-muted-foreground">
          <span>Total: {filtered.length}</span>
          <span>|</span>
          <span className="text-green-600">{filtered.filter((l: any) => l.status === "sent").length} sent</span>
          <span className="text-red-600">{filtered.filter((l: any) => l.status === "failed").length} failed</span>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>To</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Agency</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell className="font-mono text-sm">{log.to_email}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{log.template_key}</Badge></TableCell>
                  <TableCell className="max-w-[200px] truncate">{log.subject}</TableCell>
                  <TableCell>{log.organizations?.name || "—"}</TableCell>
                  <TableCell><Badge className={statusColors[log.status] || ""}>{log.status}</Badge></TableCell>
                  <TableCell className="text-sm">{log.sent_at ? format(new Date(log.sent_at), "dd MMM HH:mm") : "—"}</TableCell>
                </TableRow>
              ))}
              {!filtered.length && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No emails found</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
