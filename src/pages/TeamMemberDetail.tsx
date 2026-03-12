import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { TablePagination } from "@/components/TablePagination";
import {
  ArrowLeft, User, Shield, Users, History, Loader2, Save, KeyRound,
  Power, Search, UserPlus, UserMinus, Calendar,
} from "lucide-react";
import {
  ALL_PERMISSION_KEYS,
  PERMISSION_GROUPS,
  ROLE_PRESETS,
  detectPreset,
  presetToPermissions,
  type PermissionKey,
  type RolePreset,
} from "@/hooks/usePermissions";
import { format } from "date-fns";

interface ProfileData {
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  business_name: string | null;
  created_at: string;
  permissions: Record<string, boolean>;
  is_super_admin: boolean;
  is_active: boolean;
}

interface ClientRow {
  user_id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  balance: number;
}

interface AuditRow {
  id: string;
  action_type: string;
  description: string;
  created_at: string;
}

export default function TeamMemberDetail() {
  const { userId } = useParams<{ userId: string }>();
  const { toast } = useToast();

  // Profile state
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editBusiness, setEditBusiness] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [resettingPw, setResettingPw] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);

  // Permissions state
  const [editPerms, setEditPerms] = useState<Record<string, boolean>>({});
  const [fullAccess, setFullAccess] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<RolePreset>("custom");
  const [savingPerms, setSavingPerms] = useState(false);

  // Clients state
  const [assignedClients, setAssignedClients] = useState<ClientRow[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [clientSearch, setClientSearch] = useState("");
  const [clientPage, setClientPage] = useState(1);
  const [clientPageSize, setClientPageSize] = useState(10);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [unassignedClients, setUnassignedClients] = useState<ClientRow[]>([]);
  const [assignSearch, setAssignSearch] = useState("");
  const [loadingUnassigned, setLoadingUnassigned] = useState(false);
  const [selectedAssigned, setSelectedAssigned] = useState<Set<string>>(new Set());
  const [selectedUnassigned, setSelectedUnassigned] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Activity state
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [logPage, setLogPage] = useState(1);
  const [logPageSize, setLogPageSize] = useState(15);
  const [totalLogs, setTotalLogs] = useState(0);

  // ─── Fetch profile ───
  const fetchProfile = async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("user_id, full_name, email, phone, business_name, created_at, permissions, is_super_admin, is_active")
      .eq("user_id", userId)
      .single();

    if (data) {
      const p: ProfileData = {
        user_id: data.user_id,
        full_name: data.full_name,
        email: data.email,
        phone: data.phone,
        business_name: data.business_name,
        created_at: data.created_at,
        permissions: (data.permissions as Record<string, boolean>) ?? {},
        is_super_admin: data.is_super_admin ?? false,
        is_active: data.is_active ?? true,
      };
      setProfile(p);
      setEditName(p.full_name);
      setEditPhone(p.phone ?? "");
      setEditBusiness(p.business_name ?? "");
      setEditPerms(p.permissions);
      const allOn = ALL_PERMISSION_KEYS.every((k) => p.permissions[k] === true);
      setFullAccess(allOn);
      setSelectedPreset(detectPreset(p.permissions));
    }
    setLoading(false);
  };

  // ─── Fetch assigned clients ───
  const fetchClients = async () => {
    if (!userId) return;
    setLoadingClients(true);
    const { data: clientProfiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, email, is_active")
      .eq("manager_id", userId);

    if (clientProfiles) {
      // Calculate balance for each client
      const rows: ClientRow[] = [];
      for (const cp of clientProfiles) {
        const { data: txns } = await supabase
          .from("transactions")
          .select("type, amount, status")
          .eq("client_id", cp.user_id)
          .eq("status", "completed");

        let balance = 0;
        (txns ?? []).forEach((t: any) => {
          if (t.type === "credit") balance += Number(t.amount);
          else balance -= Number(t.amount);
        });

        rows.push({
          user_id: cp.user_id,
          full_name: cp.full_name,
          email: cp.email,
          is_active: cp.is_active ?? true,
          balance,
        });
      }
      setAssignedClients(rows);
    }
    setLoadingClients(false);
  };

  // ─── Fetch audit logs ───
  const fetchLogs = async () => {
    if (!userId) return;
    setLoadingLogs(true);
    const from = (logPage - 1) * logPageSize;
    const to = from + logPageSize - 1;

    const { data, count } = await supabase
      .from("audit_logs")
      .select("id, action_type, description, created_at", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(from, to);

    setAuditLogs(data ?? []);
    setTotalLogs(count ?? 0);
    setLoadingLogs(false);
  };

  useEffect(() => { fetchProfile(); fetchClients(); }, [userId]);
  useEffect(() => { fetchLogs(); }, [userId, logPage, logPageSize]);

  // ─── Profile actions ───
  const handleSaveProfile = async () => {
    if (!userId) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: editName,
        phone: editPhone || null,
        business_name: editBusiness || null,
      } as any)
      .eq("user_id", userId);

    setSavingProfile(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: "Profile updated successfully" });
      fetchProfile();
    }
  };

  const handleResetPassword = async () => {
    if (!profile) return;
    setResettingPw(true);
    const { error } = await supabase.functions.invoke("reset-client-password", {
      body: { userId: profile.user_id },
    });
    setResettingPw(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Password Reset", description: `Password reset email sent to ${profile.email}` });
    }
  };

  const handleToggleStatus = async () => {
    if (!profile) return;
    setTogglingStatus(true);
    const newStatus = !profile.is_active;
    const { error } = await supabase
      .from("profiles")
      .update({ is_active: newStatus } as any)
      .eq("user_id", profile.user_id);

    setTogglingStatus(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: newStatus ? "Activated" : "Deactivated",
        description: `${profile.full_name} has been ${newStatus ? "activated" : "deactivated"}`,
      });
      fetchProfile();
    }
  };

  // ─── Permission actions ───
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
    setFullAccess(ALL_PERMISSION_KEYS.every((k) => next[k] === true));
    setSelectedPreset(detectPreset(next));
  };

  const applyPreset = (presetId: string) => {
    if (presetId === "custom") { setSelectedPreset("custom"); return; }
    const preset = presetId as RolePreset;
    setSelectedPreset(preset);
    const perms = presetToPermissions(preset);
    setEditPerms(perms);
    setFullAccess(ALL_PERMISSION_KEYS.every((k) => perms[k] === true));
  };

  const handleSavePerms = async () => {
    if (!userId) return;
    setSavingPerms(true);
    const { error } = await supabase
      .from("profiles")
      .update({ permissions: editPerms } as any)
      .eq("user_id", userId);

    setSavingPerms(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: "Permissions updated successfully" });
      fetchProfile();
    }
  };

  const enabledCount = ALL_PERMISSION_KEYS.filter((k) => editPerms[k] === true).length;

  // ─── Client assignment actions ───
  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return assignedClients;
    const q = clientSearch.toLowerCase();
    return assignedClients.filter(
      (c) => c.full_name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    );
  }, [assignedClients, clientSearch]);

  const paginatedClients = filteredClients.slice(
    (clientPage - 1) * clientPageSize,
    clientPage * clientPageSize
  );

  const openAssignDialog = async () => {
    setAssignDialogOpen(true);
    setLoadingUnassigned(true);
    setAssignSearch("");

    // Fetch clients with role=client that have no manager
    const { data: clientRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "client");

    const clientIds = clientRoles?.map((r) => r.user_id) ?? [];
    if (clientIds.length === 0) { setUnassignedClients([]); setLoadingUnassigned(false); return; }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, email, is_active")
      .in("user_id", clientIds)
      .is("manager_id", null);

    setUnassignedClients(
      (profiles ?? []).map((p: any) => ({
        user_id: p.user_id,
        full_name: p.full_name,
        email: p.email,
        is_active: p.is_active ?? true,
        balance: 0,
      }))
    );
    setLoadingUnassigned(false);
  };

  const handleAssignClient = async (clientId: string) => {
    const { error } = await supabase
      .from("profiles")
      .update({ manager_id: userId } as any)
      .eq("user_id", clientId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Assigned", description: "Client assigned successfully" });
      setUnassignedClients((prev) => prev.filter((c) => c.user_id !== clientId));
      fetchClients();
    }
  };

  const handleUnassignClient = async (clientId: string) => {
    const { error } = await supabase
      .from("profiles")
      .update({ manager_id: null } as any)
      .eq("user_id", clientId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Unassigned", description: "Client removed from this manager" });
      fetchClients();
    }
  };

  // ─── Bulk actions ───
  const toggleAssignedSelection = (id: string) => {
    setSelectedAssigned((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllAssigned = () => {
    if (selectedAssigned.size === paginatedClients.length) {
      setSelectedAssigned(new Set());
    } else {
      setSelectedAssigned(new Set(paginatedClients.map((c) => c.user_id)));
    }
  };

  const toggleUnassignedSelection = (id: string) => {
    setSelectedUnassigned((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllUnassigned = () => {
    if (selectedUnassigned.size === filteredUnassigned.length) {
      setSelectedUnassigned(new Set());
    } else {
      setSelectedUnassigned(new Set(filteredUnassigned.map((c) => c.user_id)));
    }
  };

  const handleBulkUnassign = async () => {
    if (selectedAssigned.size === 0) return;
    setBulkProcessing(true);
    const ids = Array.from(selectedAssigned);
    const { error } = await supabase
      .from("profiles")
      .update({ manager_id: null } as any)
      .in("user_id", ids);

    setBulkProcessing(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Bulk Unassigned", description: `${ids.length} client(s) removed from this manager` });
      setSelectedAssigned(new Set());
      fetchClients();
    }
  };

  const handleBulkAssign = async () => {
    if (selectedUnassigned.size === 0) return;
    setBulkProcessing(true);
    const ids = Array.from(selectedUnassigned);
    const { error } = await supabase
      .from("profiles")
      .update({ manager_id: userId } as any)
      .in("user_id", ids);

    setBulkProcessing(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Bulk Assigned", description: `${ids.length} client(s) assigned to this manager` });
      setSelectedUnassigned(new Set());
      setUnassignedClients((prev) => prev.filter((c) => !ids.includes(c.user_id)));
      fetchClients();
    }
  };

  const filteredUnassigned = useMemo(() => {
    if (!assignSearch.trim()) return unassignedClients;
    const q = assignSearch.toLowerCase();
    return unassignedClients.filter(
      (c) => c.full_name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    );
  }, [unassignedClients, assignSearch]);

  // ─── Action type badge color ───
  const actionBadgeVariant = (type: string): "default" | "destructive" | "secondary" | "outline" => {
    if (type.includes("rejected") || type.includes("deactivat")) return "destructive";
    if (type.includes("approved") || type.includes("created") || type.includes("added")) return "default";
    return "secondary";
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" asChild>
          <Link to="/admin/team"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Team</Link>
        </Button>
        <p className="text-center text-muted-foreground py-10">Team member not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/admin/team"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{profile.full_name}</h1>
            <p className="text-muted-foreground">{profile.email}</p>
          </div>
          <Badge variant={profile.is_active ? "default" : "destructive"}>
            {profile.is_active ? "Active" : "Inactive"}
          </Badge>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile" className="gap-1.5">
            <User className="h-4 w-4" /> Profile
          </TabsTrigger>
          <TabsTrigger value="permissions" className="gap-1.5">
            <Shield className="h-4 w-4" /> Access Control
          </TabsTrigger>
          <TabsTrigger value="clients" className="gap-1.5">
            <Users className="h-4 w-4" /> Clients ({assignedClients.length})
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5">
            <History className="h-4 w-4" /> Activity
          </TabsTrigger>
        </TabsList>

        {/* ─── TAB 1: PROFILE ─── */}
        <TabsContent value="profile">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>Update basic details for this team member</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={profile.email} disabled className="opacity-60" />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Optional" />
                </div>
                <div className="space-y-2">
                  <Label>Business Name</Label>
                  <Input value={editBusiness} onChange={(e) => setEditBusiness(e.target.value)} placeholder="Optional" />
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Joined {format(new Date(profile.created_at), "PPP")}
                </div>
                <Button onClick={handleSaveProfile} disabled={savingProfile} className="w-full">
                  {savingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Changes
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Account Status</CardTitle>
                  <CardDescription>Control whether this member can access the system</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <p className="font-medium">Account {profile.is_active ? "Active" : "Inactive"}</p>
                      <p className="text-xs text-muted-foreground">
                        {profile.is_active
                          ? "This member can log in and perform actions"
                          : "This member is blocked from accessing the system"}
                      </p>
                    </div>
                    <Switch
                      checked={profile.is_active}
                      onCheckedChange={handleToggleStatus}
                      disabled={togglingStatus}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Security</CardTitle>
                  <CardDescription>Password and credential management</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" onClick={handleResetPassword} disabled={resettingPw} className="w-full">
                    {resettingPw ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                    Send Password Reset Email
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ─── TAB 2: ACCESS CONTROL ─── */}
        <TabsContent value="permissions">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Access Control</CardTitle>
                  <CardDescription>
                    {enabledCount} of {ALL_PERMISSION_KEYS.length} permissions enabled
                  </CardDescription>
                </div>
                <Button onClick={handleSavePerms} disabled={savingPerms}>
                  {savingPerms ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Permissions
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Role Preset */}
              <div className="space-y-2">
                <Label>Role Preset</Label>
                <Select value={selectedPreset} onValueChange={applyPreset}>
                  <SelectTrigger className="max-w-xs">
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
                  <p className="text-xs text-muted-foreground">Grant all permissions to this member</p>
                </div>
                <Switch checked={fullAccess} onCheckedChange={toggleFullAccess} />
              </div>

              <Separator />

              {/* Permission Groups */}
              <div className="grid gap-6 md:grid-cols-2">
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── TAB 3: ASSIGNED CLIENTS ─── */}
        <TabsContent value="clients">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Assigned Clients</CardTitle>
                  <CardDescription>
                    {assignedClients.length} client{assignedClients.length !== 1 ? "s" : ""} assigned to this manager
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative w-56">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search clients..."
                      className="pl-9"
                      value={clientSearch}
                      onChange={(e) => { setClientSearch(e.target.value); setClientPage(1); }}
                    />
                  </div>
                  <Button onClick={openAssignDialog}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Assign Client
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingClients ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredClients.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  {clientSearch ? "No clients match your search." : "No clients assigned yet."}
                </p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead className="text-right">Balance (USD)</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedClients.map((c) => (
                        <TableRow key={c.user_id}>
                          <TableCell className="font-medium">
                            <Link to={`/admin/clients/${c.user_id}`} className="hover:underline text-primary">
                              {c.full_name}
                            </Link>
                          </TableCell>
                          <TableCell>{c.email}</TableCell>
                          <TableCell className="text-right font-mono">
                            ${c.balance.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={c.is_active ? "default" : "destructive"} className="text-xs">
                              {c.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleUnassignClient(c.user_id)}
                            >
                              <UserMinus className="mr-1.5 h-3.5 w-3.5" />
                              Unassign
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePagination
                    totalItems={filteredClients.length}
                    pageSize={clientPageSize}
                    currentPage={clientPage}
                    onPageChange={setClientPage}
                    onPageSizeChange={setClientPageSize}
                  />
                </>
              )}
            </CardContent>
          </Card>

          {/* Assign Client Dialog */}
          <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
            <DialogContent className="sm:max-w-md max-h-[70vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Assign Client</DialogTitle>
              </DialogHeader>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search unassigned clients..."
                  className="pl-9"
                  value={assignSearch}
                  onChange={(e) => setAssignSearch(e.target.value)}
                />
              </div>
              {loadingUnassigned ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredUnassigned.length === 0 ? (
                <p className="text-center text-muted-foreground py-6 text-sm">
                  No unassigned clients found.
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredUnassigned.map((c) => (
                    <div
                      key={c.user_id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div>
                        <p className="font-medium text-sm">{c.full_name}</p>
                        <p className="text-xs text-muted-foreground">{c.email}</p>
                      </div>
                      <Button size="sm" onClick={() => handleAssignClient(c.user_id)}>
                        Assign
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Close</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ─── TAB 4: ACTIVITY LOG ─── */}
        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Activity Log</CardTitle>
              <CardDescription>Recent actions performed by this team member</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingLogs ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : auditLogs.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No activity recorded yet.</p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="whitespace-nowrap text-sm">
                            {format(new Date(log.created_at), "MMM d, yyyy HH:mm")}
                          </TableCell>
                          <TableCell>
                            <Badge variant={actionBadgeVariant(log.action_type)} className="text-xs">
                              {log.action_type.replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-md truncate">
                            {log.description}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePagination
                    totalItems={totalLogs}
                    pageSize={logPageSize}
                    currentPage={logPage}
                    onPageChange={setLogPage}
                    onPageSizeChange={setLogPageSize}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
