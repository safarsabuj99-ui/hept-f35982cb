import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserCog } from "lucide-react";
import { TablePagination } from "@/components/TablePagination";

interface Profile {
  user_id: string;
  full_name: string;
  email: string;
  business_name: string | null;
  manager_id: string | null;
}

interface Manager {
  user_id: string;
  full_name: string;
}

export default function ClientAssignment() {
  const [clients, setClients] = useState<Profile[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { toast } = useToast();

  const fetchData = async () => {
    // Get all roles
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const clientIds = new Set((roles ?? []).filter((r) => r.role === "client").map((r) => r.user_id));
    const managerIds = new Set((roles ?? []).filter((r) => r.role === "manager").map((r) => r.user_id));

    // Get all profiles
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, email, business_name, manager_id" as any);

    const allProfiles = (profiles ?? []) as any[];
    setClients(allProfiles.filter((p) => clientIds.has(p.user_id)));
    setManagers(allProfiles.filter((p) => managerIds.has(p.user_id)).map((p) => ({ user_id: p.user_id, full_name: p.full_name })));
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAssign = async (clientUserId: string, managerId: string | null) => {
    setSaving(clientUserId);
    const { error } = await supabase
      .from("profiles")
      .update({ manager_id: managerId } as any)
      .eq("user_id", clientUserId);

    setSaving(null);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Updated", description: "Manager assignment saved" });
      fetchData();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <UserCog className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Client Assignment</h1>
          <p className="text-muted-foreground">Assign managers to client accounts</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : clients.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No clients to assign</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead className="hidden sm:table-cell">Business</TableHead>
                    <TableHead>Assigned Manager</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((client) => (
                    <TableRow key={client.user_id}>
                      <TableCell className="font-medium">{client.full_name}</TableCell>
                      <TableCell className="hidden sm:table-cell">{client.business_name || "—"}</TableCell>
                      <TableCell>
                        <Select
                          value={client.manager_id || "unassigned"}
                          onValueChange={(v) => handleAssign(client.user_id, v === "unassigned" ? null : v)}
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">— Unassigned —</SelectItem>
                            {managers.map((m) => (
                              <SelectItem key={m.user_id} value={m.user_id}>{m.full_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {saving === client.user_id && <Loader2 className="h-4 w-4 animate-spin" />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination totalItems={clients.length} pageSize={pageSize} currentPage={currentPage} onPageChange={setCurrentPage} onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }} />
            </div>
          )}
          {managers.length === 0 && !loading && (
            <p className="mt-4 text-sm text-muted-foreground">
              No managers exist yet. Create a manager account first via "New Client" with manager role.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

