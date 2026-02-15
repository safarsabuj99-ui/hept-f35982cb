import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface ManagerPermissions {
  can_view_dashboard: boolean;
  can_view_transactions: boolean;
  can_add_funds: boolean;
  can_log_spend: boolean;
  can_edit_clients: boolean;
}

const defaultPermissions: ManagerPermissions = {
  can_view_dashboard: true,
  can_view_transactions: true,
  can_add_funds: true,
  can_log_spend: true,
  can_edit_clients: false,
};

export function usePermissions() {
  const { user, role } = useAuth();
  const [permissions, setPermissions] = useState<ManagerPermissions>(defaultPermissions);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (role !== "manager" || !user) {
      setPermissions(defaultPermissions);
      setLoading(false);
      return;
    }

    const fetch = async () => {
      const { data } = await supabase
        .from("manager_permissions" as any)
        .select("can_view_dashboard, can_view_transactions, can_add_funds, can_log_spend, can_edit_clients")
        .eq("user_id", user.id)
        .single();

      if (data) {
        setPermissions(data as unknown as ManagerPermissions);
      }
      setLoading(false);
    };
    fetch();
  }, [user, role]);

  return { permissions, loading };
}
