import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type PermissionKey =
  | "can_view_dashboard_stats"
  | "can_manage_finance"
  | "can_manage_clients"
  | "can_manage_campaigns"
  | "can_manage_team"
  | "can_configure_system"
  | "can_view_ad_accounts"
  | "can_approve_payments"
  | "can_manage_expenses"
  | "can_view_audit_logs"
  | "can_manage_wallets"
  | "can_view_reports"
  | "can_view_profit";

export const ALL_PERMISSION_KEYS: PermissionKey[] = [
  "can_view_dashboard_stats",
  "can_manage_finance",
  "can_manage_clients",
  "can_manage_campaigns",
  "can_manage_team",
  "can_configure_system",
  "can_view_ad_accounts",
  "can_approve_payments",
  "can_manage_expenses",
  "can_view_audit_logs",
  "can_manage_wallets",
  "can_view_reports",
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
    keys: [
      { key: "can_manage_finance", label: "Finance Hub & Cash Flow" },
      { key: "can_approve_payments", label: "Approve / Reject Payments" },
      { key: "can_manage_expenses", label: "Log & Manage Expenses" },
      { key: "can_manage_wallets", label: "Add Funds & Platform Transfers" },
      { key: "can_view_reports", label: "View Finance Reports & Profitability" },
    ],
  },
  {
    label: "Operations",
    keys: [
      { key: "can_manage_clients", label: "Create / Edit / Delete Clients" },
      { key: "can_manage_campaigns", label: "Manage Campaign Requests" },
      { key: "can_view_ad_accounts", label: "View Ad Accounts" },
    ],
  },
  {
    label: "System",
    keys: [
      { key: "can_manage_team", label: "Manage Team Members" },
      { key: "can_configure_system", label: "API Tokens & Global Settings" },
      { key: "can_view_audit_logs", label: "View System Audit Logs" },
    ],
  },
];

export type RolePreset = "finance_manager" | "campaign_manager" | "full_manager" | "view_only" | "custom";

export interface RolePresetConfig {
  id: RolePreset;
  label: string;
  permissions: PermissionKey[];
}

export const ROLE_PRESETS: RolePresetConfig[] = [
  {
    id: "finance_manager",
    label: "Finance Manager",
    permissions: [
      "can_view_dashboard_stats",
      "can_manage_finance",
      "can_approve_payments",
      "can_manage_expenses",
      "can_manage_wallets",
      "can_view_reports",
    ],
  },
  {
    id: "campaign_manager",
    label: "Campaign Manager",
    permissions: [
      "can_view_dashboard_stats",
      "can_manage_campaigns",
      "can_view_ad_accounts",
      "can_manage_clients",
    ],
  },
  {
    id: "full_manager",
    label: "Full Manager",
    permissions: [...ALL_PERMISSION_KEYS],
  },
  {
    id: "view_only",
    label: "View Only",
    permissions: ["can_view_dashboard_stats"],
  },
];

/** Given a permissions map, detect which preset matches (or "custom") */
export function detectPreset(perms: Record<string, boolean>): RolePreset {
  const enabledKeys = ALL_PERMISSION_KEYS.filter((k) => perms[k] === true);
  for (const preset of ROLE_PRESETS) {
    if (
      preset.permissions.length === enabledKeys.length &&
      preset.permissions.every((k) => perms[k] === true)
    ) {
      return preset.id;
    }
  }
  return "custom";
}

/** Build a permissions map from a preset */
export function presetToPermissions(presetId: RolePreset): Record<string, boolean> {
  const preset = ROLE_PRESETS.find((p) => p.id === presetId);
  if (!preset) return {};
  const map: Record<string, boolean> = {};
  ALL_PERMISSION_KEYS.forEach((k) => {
    map[k] = preset.permissions.includes(k);
  });
  return map;
}

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
      if (role === "admin" || isSuperAdmin) return true;
      return permissions[key] === true;
    },
    [role, isSuperAdmin, permissions]
  );

  return { permissions, isSuperAdmin, hasPermission, loading };
}
