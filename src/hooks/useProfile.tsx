import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCallback } from "react";

export function useProfile() {
  const { user, authReady } = useAuth();
  const queryClient = useQueryClient();

  const { data: profile, isLoading: loading } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, business_name, email, phone, preferred_timezone")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: authReady && !!user?.id,
  });

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
  }, [queryClient, user?.id]);

  return { profile, loading, refetch };
}
