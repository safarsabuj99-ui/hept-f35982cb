import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Users, PlusCircle, Shield, Loader2 } from "lucide-react";

interface ManagerRow {
  user_id: string;
  full_name: string;
  email: string;
  client_count: number;
  permissions: Permissions | null;
}

interface Permissions {
  can_view_dashboard: boolean;
  can_view_transactions: boolean;
  can_add_funds: boolean;
  can_log_spend: boolean;
  can_edit_clients: boolean;
}

const defaultPerms: Permissions = {
  can_view_dashboard: true,
  can_view_transactions: true,
  can_add_funds: true,
  can_log_spend: true,
  can_edit_clients: false,
};

const permLabels: { key: keyof Permissions; label: string; category: string }[] = [
  { key: "can_view_dashboard", label: "View Client Dashboards", category: "View" },
  { key: "can_view_transactions", label: "View Transaction History", category: "View" },
  { key: "can_add_funds", label: "Add Funds (Pending Approval)", category: "Action" },
  { key: "can_log_spend", label: "Log Daily Spend", category: "Action" },
  { key: "can_edit_clients", label: "Edit Client Profiles", category: "Action" },
];

export default function TeamManagement() {
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editManager, setEditManager] = useState<ManagerRow | null>(null);
  const [editPerms, setEditPerms] = useState<Permissions>(defaultPerms);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchManagers = async () => {
    setLoading(true);
    // Get all manager user_ids
    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "manager");
    const managerIds = roles?.map((r) => r.user_id) ?? [];
    if (managerIds.length === 0) { setManagers([]); setLoading(false); return; }

    // Get profiles
    const { data: profiles } = await (supabase
      .from("profiles")
      .select("user_id, full_name, email") as any)
      .in("user_id", managerIds);

    // Get client counts per manager
    const { data: allProfiles } = await (supabase
      .from("profiles")
      .select("manager_id") as any)
      .in("manager_id", managerIds);

    const countMap: Record<string, number> = {};
    (allProfiles ?? []).forEach((p: any) => {
      if (p.manager_id) countMap[p.manager_id] = (countMap[p.manager_id] || 0) + 1;
    });

    // Get permissions
    const { data: permsData } = await supabase
      .from("manager_permissions" as any)
      .select("user_id, can_view_dashboard, can_view_transactions, can_add_funds, can_log_spend, can_edit_clients")
      .in("user_id", managerIds);

    const permsMap: Record<string, Permissions> = {};
    (permsData ?? []).forEach((p: any) => { permsMap[p.user_id] = p; });

    const rows: ManagerRow[] = (profiles ?? []).map((p) => ({
      user_id: p.user_id,
      full_name: p.full_name,
      email: p.email,
      client_count: countMap[p.user_id] || 0,
      permissions: permsMap[p.user_id] || null,
    }));

    setManagers(rows);
    setLoading(false);
  };

  useEffect(() => { fetchManagers(); }, []);

  const openEdit = (m: ManagerRow) => {
    setEditManager(m);
    setEditPerms(m.permissions ?? defaultPerms);
  };

  const handleSave = async () => {
    if (!editManager) return;
    setSaving(true);

    // Upsert permissions
    const { error } = await supabase
      .from("manager_permissions" as any)
      .upsert({ user_id: editManager.user_id, ...editPerms } as any, { onConflict: "user_id" });

    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: `Permissions updated for ${editManager.full_name}` });
      setEditManager(null);
      fetchManagers();
    }
  };

  const enabledCount = (p: Permissions | null) => {
    if (!p) return "No permissions set";
    const count = permLabels.filter((l) => p[l.key]).length;
    return `${count}/${permLabels.length} enabled`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team Management</h1>
          <p className="text-muted-foreground">Manage managers and their permissions</p>
        </div>
        <Button asChild>
          <Link to="/admin/clients/new?role=manager">
            <PlusCircle className="mr-2 h-4 w-4" />
            New Manager
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Managers
          </CardTitle>
          <CardDescription>
            {managers.length} manager{managers.length !== 1 ? "s" : ""} in your team
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : managers.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No managers yet. Create one to get started.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Clients</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {managers.map((m) => (
                  <TableRow key={m.user_id}>
                    <TableCell className="font-medium">{m.full_name}</TableCell>
                    <TableCell>{m.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{m.client_count}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {enabledCount(m.permissions)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => openEdit(m)}>
                        <Shield className="mr-1.5 h-3.5 w-3.5" />
                        Permissions
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Permissions Dialog */}
      <Dialog open={!!editManager} onOpenChange={(open) => !open && setEditManager(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Permissions — {editManager?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {["View", "Action"].map((cat) => (
              <div key={cat} className="space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{cat} Permissions</h4>
                {permLabels
                  .filter((l) => l.category === cat)
                  .map((l) => (
                    <div key={l.key} className="flex items-center justify-between">
                      <Label className="cursor-pointer">{l.label}</Label>
                      <Switch
                        checked={editPerms[l.key]}
                        onCheckedChange={(checked) =>
                          setEditPerms((prev) => ({ ...prev, [l.key]: checked }))
                        }
                      />
                    </div>
                  ))}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditManager(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Permissions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
