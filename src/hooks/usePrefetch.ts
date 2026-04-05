import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const prefetchFns: Record<string, () => Promise<any>> = {
  "/admin/clients": () =>
    supabase.from("profiles").select("user_id, full_name, email, business_name, is_active").then(r => r.data),
  "/admin/ad-accounts": () =>
    supabase.from("ad_accounts").select("*").then(r => r.data),
  "/admin/finance": () =>
    supabase.from("agency_accounts").select("*").eq("is_active", true).then(r => r.data),
  "/admin/payment-requests": () =>
    supabase.from("payment_requests").select("*").order("created_at", { ascending: false }).limit(50).then(r => r.data),
  "/admin/orders": () =>
    supabase.from("campaign_requests").select("*").order("created_at", { ascending: false }).limit(50).then(r => r.data),
  "/admin/team": () =>
    supabase.from("profiles").select("user_id, full_name, email, is_active").then(r => r.data),
};

export function usePrefetch() {
  const queryClient = useQueryClient();

  const prefetch = useCallback(
    (path: string) => {
      const fn = prefetchFns[path];
      if (!fn) return;
      queryClient.prefetchQuery({
        queryKey: ["prefetch", path],
        queryFn: fn,
        staleTime: 60_000,
      });
    },
    [queryClient]
  );

  return prefetch;
}
