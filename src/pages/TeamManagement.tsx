import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Users, PlusCircle, Shield, Loader2 } from "lucide-react";
import { ALL_PERMISSION_KEYS, PERMISSION_GROUPS, type PermissionKey } from "@/hooks/usePermissions";

interface ManagerRow {
  user_id: string;
  full_name: string;
  email: string;
  client_count: number;
  permissions: Record<string, boolean>;
  is_super_admin: boolean;
}

export default function TeamManagement() {
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editManager, setEditManager] = useState<ManagerRow | null>(null);
  const [editPerms, setEditPerms] = useState<Record<string, boolean>>({});
  const [fullAccess, setFullAccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchManagers = async () => {
    setLoading(true);
    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "manager");
    const managerIds = roles?.map((r) => r.user_id) ?? [];
    if (managerIds.length === 0) { setManagers([]); setLoading(false); return; }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, email, permissions, is_super_admin")
      .in("user_id", managerIds);

    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("manager_id")
      .in("manager_id", managerIds);

    const countMap: Record<string, number> = {};
    (allProfiles ?? []).forEach((p: any) => {
      if (p.manager_id) countMap[p.manager_id] = (countMap[p.manager_id] || 0) + 1;
    });

    const rows: ManagerRow[] = (profiles ?? []).map((p) => ({
      user_id: p.user_id,
      full_name: p.full_name,
      email: p.email,
      client_count: countMap[p.user_id] || 0,
      permissions: (p.permissions as Record<string, boolean>) ?? {},
      is_super_admin: p.is_super_admin ?? false,
    }));

    setManagers(rows);
    setLoading(false);
  };

  useEffect(() => { fetchManagers(); }, []);

  const openEdit = (m: ManagerRow) => {
    setEditManager(m);
    setEditPerms(m.permissions);
    const allOn = ALL_PERMISSION_KEYS.every((k) => m.permissions[k] === true);
    setFullAccess(allOn);
  };

  const toggleFullAccess = (checked: boolean) => {
    setFullAccess(checked);
    if (checked) {
      const all: Record<string, boolean> = {};
      ALL_PERMISSION_KEYS.forEach((k) => { all[k] = true; });
      setEditPerms(all);
    } else {
      setEditPerms({});
    }
  };

  const togglePerm = (key: PermissionKey, checked: boolean) => {
    const next = { ...editPerms, [key]: checked };
    setEditPerms(next);
    const allOn = ALL_PERMISSION_KEYS.every((k) => next[k] === true);
    setFullAccess(allOn);
  };

  const handleSave = async () => {
    if (!editManager) return;
    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({ permissions: editPerms } as any)
      .eq("user_id", editManager.user_id);

    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: `Permissions updated for ${editManager.full_name}` });
      setEditManager(null);
      fetchManagers();
    }
  };

  const enabledCount = (perms: Record<string, boolean>) => {
    const count = ALL_PERMISSION_KEYS.filter((k) => perms[k] === true).length;
    return `${count}/${ALL_PERMISSION_KEYS.length} enabled`;
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Access Control — {editManager?.full_name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Full Access Toggle */}
            <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div>
                <p className="text-sm font-semibold">Full Access</p>
                <p className="text-xs text-muted-foreground">Grant all permissions</p>
              </div>
              <Switch checked={fullAccess} onCheckedChange={toggleFullAccess} />
            </div>

            <Separator />

            {/* Grouped Permissions */}
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.label} className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </h4>
                {group.keys.map((perm) => (
                  <label
                    key={perm.key}
                    className="flex items-center gap-3 cursor-pointer rounded-md p-2 hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      checked={editPerms[perm.key] === true}
                      onCheckedChange={(checked) => togglePerm(perm.key, checked === true)}
                    />
                    <span className="text-sm">{perm.label}</span>
                  </label>
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
