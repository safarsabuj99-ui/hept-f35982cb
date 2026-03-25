import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Users, PlusCircle, Shield, Loader2, Search, Power, AlertTriangle } from "lucide-react";
import {
  ALL_PERMISSION_KEYS,
  PERMISSION_GROUPS,
  ROLE_PRESETS,
  detectPreset,
  presetToPermissions,
  type PermissionKey,
  type RolePreset,
} from "@/hooks/usePermissions";
import { TablePagination } from "@/components/TablePagination";

interface ManagerRow {
  user_id: string;
  full_name: string;
  email: string;
  client_count: number;
  permissions: Record<string, boolean>;
  is_super_admin: boolean;
  is_active: boolean;
}

export default function TeamManagement() {
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editManager, setEditManager] = useState<ManagerRow | null>(null);
  const [editPerms, setEditPerms] = useState<Record<string, boolean>>({});
  const [fullAccess, setFullAccess] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<RolePreset>("custom");
  const [saving, setSaving] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { toast } = useToast();

  const fetchManagers = async () => {
    setLoading(true);
    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "manager");
    const managerIds = roles?.map((r) => r.user_id) ?? [];
    if (managerIds.length === 0) { setManagers([]); setLoading(false); return; }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, email, permissions, is_super_admin, is_active")
      .in("user_id", managerIds);

    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("manager_id")
      .in("manager_id", managerIds);

    const countMap: Record<string, number> = {};
    (allProfiles ?? []).forEach((p: any) => {
      if (p.manager_id) countMap[p.manager_id] = (countMap[p.manager_id] || 0) + 1;
    });

    const rows: ManagerRow[] = (profiles ?? []).map((p: any) => ({
      user_id: p.user_id,
      full_name: p.full_name,
      email: p.email,
      client_count: countMap[p.user_id] || 0,
      permissions: (p.permissions as Record<string, boolean>) ?? {},
      is_super_admin: p.is_super_admin ?? false,
      is_active: p.is_active ?? true,
    }));

    setManagers(rows);
    setLoading(false);
  };

  useEffect(() => { fetchManagers(); }, []);

  useEffect(() => {
    const channel = supabase
      .channel("team-management-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => fetchManagers())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filteredManagers = useMemo(() => {
    if (!searchQuery.trim()) return managers;
    const q = searchQuery.toLowerCase();
    return managers.filter(
      (m) => m.full_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
    );
  }, [managers, searchQuery]);

  const paginatedManagers = filteredManagers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const openEdit = (m: ManagerRow) => {
    setEditManager(m);
    setEditPerms(m.permissions);
    const allOn = ALL_PERMISSION_KEYS.every((k) => m.permissions[k] === true);
    setFullAccess(allOn);
    setSelectedPreset(detectPreset(m.permissions));
  };

  const toggleFullAccess = (checked: boolean) => {
    setFullAccess(checked);
    if (checked) {
      const all: Record<string, boolean> = {};
      ALL_PERMISSION_KEYS.forEach((k) => { all[k] = true; });
      setEditPerms(all);
      setSelectedPreset("full_manager");
    } else {
      setEditPerms({});
      setSelectedPreset("custom");
    }
  };

  const togglePerm = (key: PermissionKey, checked: boolean) => {
    const next = { ...editPerms, [key]: checked };
    setEditPerms(next);
    const allOn = ALL_PERMISSION_KEYS.every((k) => next[k] === true);
    setFullAccess(allOn);
    setSelectedPreset(detectPreset(next));
  };

  const applyPreset = (presetId: string) => {
    if (presetId === "custom") {
      setSelectedPreset("custom");
      return;
    }
    const preset = presetId as RolePreset;
    setSelectedPreset(preset);
    const perms = presetToPermissions(preset);
    setEditPerms(perms);
    setFullAccess(ALL_PERMISSION_KEYS.every((k) => perms[k] === true));
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

  const toggleActive = async (m: ManagerRow) => {
    setTogglingStatus(m.user_id);
    const newStatus = !m.is_active;
    const { error } = await supabase
      .from("profiles")
      .update({ is_active: newStatus } as any)
      .eq("user_id", m.user_id);

    setTogglingStatus(null);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: newStatus ? "Activated" : "Deactivated",
        description: `${m.full_name} has been ${newStatus ? "activated" : "deactivated"}`,
      });
      fetchManagers();
    }
  };

  const getPresetLabel = (perms: Record<string, boolean>) => {
    const preset = detectPreset(perms);
    if (preset === "custom") return "Custom";
    return ROLE_PRESETS.find((p) => p.id === preset)?.label ?? "Custom";
  };

  const enabledCount = (perms: Record<string, boolean>) => {
    const count = ALL_PERMISSION_KEYS.filter((k) => perms[k] === true).length;
    return count;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team Management</h1>
          <p className="text-muted-foreground">Manage managers, permissions, and account status</p>
        </div>
        <Button asChild className="self-start">
          <Link to="/admin/clients/new?role=manager">
            <PlusCircle className="mr-2 h-4 w-4" />
            New Manager
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Managers
              </CardTitle>
              <CardDescription>
                {managers.length} manager{managers.length !== 1 ? "s" : ""} in your team
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredManagers.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              {searchQuery ? "No managers match your search." : "No managers yet. Create one to get started."}
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role Preset</TableHead>
                    <TableHead>Clients</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedManagers.map((m) => (
                    <TableRow key={m.user_id} className={!m.is_active ? "opacity-50" : ""}>
                      <TableCell className="font-medium">
                        <Link to={`/admin/team/${m.user_id}`} className="hover:underline text-primary">
                          {m.full_name}
                        </Link>
                      </TableCell>
                      <TableCell>{m.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {getPresetLabel(m.permissions)}
                        </Badge>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {enabledCount(m.permissions)}/{ALL_PERMISSION_KEYS.length}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{m.client_count}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={m.is_active}
                            onCheckedChange={() => toggleActive(m)}
                            disabled={togglingStatus === m.user_id}
                          />
                          <Badge variant={m.is_active ? "default" : "destructive"} className="text-xs">
                            {m.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
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
              <TablePagination
                totalItems={filteredManagers.length}
                pageSize={pageSize}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Permissions Dialog */}
      <Dialog open={!!editManager} onOpenChange={(open) => !open && setEditManager(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Access Control — {editManager?.full_name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Role Preset Selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Role Preset</label>
              <Select value={selectedPreset} onValueChange={applyPreset}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a preset..." />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Full Access Toggle */}
            <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div>
                <p className="text-sm font-semibold">Full Access</p>
                <p className="text-xs text-muted-foreground">Grant all permissions</p>
              </div>
              <Switch checked={fullAccess} onCheckedChange={toggleFullAccess} />
            </div>

            <Separator />

            {/* Permission Groups */}
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
