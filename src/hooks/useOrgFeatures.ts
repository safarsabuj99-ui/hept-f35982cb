import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type FeatureKey =
  | "ad_guard"
  | "advanced_analytics"
  | "api_access"
  | "white_label"
  | "campaign_requests"
  | "multi_manager"
  | "priority_support"
  | "expense_tracking"
  | "cash_flow"
  | "usd_inventory"
  | "custom_exchange_rate"
  | "client_notices";

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  ad_guard: "Ad Guard (Auto-Pause)",
  advanced_analytics: "Advanced Analytics",
  api_access: "API Integrations",
  white_label: "White Label Branding",
  campaign_requests: "Campaign Requests",
  multi_manager: "Multi-Manager",
  priority_support: "Priority Support",
  expense_tracking: "Expense Tracking",
  cash_flow: "Cash Flow Management",
  usd_inventory: "USD Inventory",
  custom_exchange_rate: "Custom Exchange Rates",
  client_notices: "Client Notices",
};

export const ALL_FEATURE_KEYS: FeatureKey[] = Object.keys(FEATURE_LABELS) as FeatureKey[];

export function useOrgFeatures() {
  const { session, authReady } = useAuth();
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authReady || !session?.user?.id) {
      if (authReady) setLoading(false);
      return;
    }

    const fetchFeatures = async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("user_id", session.user.id)
        .single();

      if (!profile?.org_id) {
        setLoading(false);
        return;
      }

      const { data: org } = await supabase
        .from("organizations")
        .select("allowed_features")
        .eq("id", profile.org_id)
        .single();

      if (org?.allowed_features && typeof org.allowed_features === "object") {
        setFeatures(org.allowed_features as Record<string, boolean>);
      }
      setLoading(false);
    };

    fetchFeatures();
  }, [authReady, session?.user?.id]);

  const hasFeature = (key: FeatureKey): boolean => {
    return features[key] === true;
  };

  return { hasFeature, features, loading };
}
