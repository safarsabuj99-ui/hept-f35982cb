import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type PermissionKey =
  | "can_view_dashboard_stats"
  | "can_manage_finance"
  | "can_manage_clients"
  | "can_manage_campaigns"
  | "can_manage_team"
  | "can_configure_system";

export const ALL_PERMISSION_KEYS: PermissionKey[] = [
  "can_view_dashboard_stats",
  "can_manage_finance",
  "can_manage_clients",
  "can_manage_campaigns",
  "can_manage_team",
  "can_configure_system",
];

export interface PermissionGroup {
  label: string;
  keys: { key: PermissionKey; label: string }[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    label: "Dashboard",
    keys: [{ key: "can_view_dashboard_stats", label: "View Dashboard & Stats" }],
  },
  {
    label: "Financials",
    keys: [{ key: "can_manage_finance", label: "Finance, Wallet, Payments & Expenses" }],
  },
  {
    label: "Operations",
    keys: [
      { key: "can_manage_clients", label: "Create / Edit / Delete Clients" },
      { key: "can_manage_campaigns", label: "Manage Campaign Requests" },
    ],
  },
  {
    label: "System",
    keys: [
      { key: "can_manage_team", label: "Manage Team Members" },
      { key: "can_configure_system", label: "API Tokens & Global Settings" },
    ],
  },
];

export function usePermissions() {
  const { user, role } = useAuth();
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setPermissions({});
      setIsSuperAdmin(false);
      setLoading(false);
      return;
    }

    const fetchPerms = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("permissions, is_super_admin")
        .eq("user_id", user.id)
        .single();

      if (data) {
        setPermissions((data.permissions as Record<string, boolean>) ?? {});
        setIsSuperAdmin(data.is_super_admin ?? false);
      }
      setLoading(false);
    };
    fetchPerms();
  }, [user]);

  const hasPermission = useCallback(
    (key: PermissionKey): boolean => {
      // Admins who are super admin bypass all checks
      if (role === "admin" || isSuperAdmin) return true;
      return permissions[key] === true;
    },
    [role, isSuperAdmin, permissions]
  );

  return { permissions, isSuperAdmin, hasPermission, loading };
}
