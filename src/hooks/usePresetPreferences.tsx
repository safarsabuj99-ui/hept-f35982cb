import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

type PresetType = "auto" | "messages" | "sales" | "performance" | "tiktok_messages";
type PlatformTab = "all" | "meta" | "tiktok" | "google";

interface PresetPreferences {
  campaign_presets?: Record<string, PresetType>;
  column_order?: Record<string, string[]>;
  ui_prefs?: Record<string, any>;
}

export function usePresetPreferences() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<PresetPreferences>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("profiles")
      .select("permissions")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.permissions && typeof data.permissions === "object") {
          const p = data.permissions as Record<string, any>;
          setPrefs({
            campaign_presets: p.campaign_presets || {},
            column_order: p.column_order || {},
          });
        }
        setLoading(false);
      });
  }, [user?.id]);

  const getDefaultPreset = useCallback(
    (platform: PlatformTab): PresetType => {
      return prefs.campaign_presets?.[platform] || "auto";
    },
    [prefs]
  );

  const setDefaultPreset = useCallback(
    async (platform: PlatformTab, preset: PresetType) => {
      if (!user?.id) return;
      const newPresets = { ...prefs.campaign_presets, [platform]: preset };
      setPrefs((p) => ({ ...p, campaign_presets: newPresets }));

      const { data: current } = await supabase
        .from("profiles")
        .select("permissions")
        .eq("user_id", user.id)
        .maybeSingle();

      const currentPerms = (current?.permissions && typeof current.permissions === "object" ? current.permissions : {}) as Record<string, any>;

      await supabase
        .from("profiles")
        .update({ permissions: { ...currentPerms, campaign_presets: newPresets } })
        .eq("user_id", user.id);

      toast({ title: "Default preset saved", description: `${preset} set as default for ${platform}` });
    },
    [user?.id, prefs]
  );

  const getColumnOrder = useCallback(
    (platform: PlatformTab): string[] | undefined => {
      return prefs.column_order?.[platform];
    },
    [prefs]
  );

  const setColumnOrder = useCallback(
    async (platform: PlatformTab, order: string[]) => {
      if (!user?.id) return;
      const newOrder = { ...prefs.column_order, [platform]: order };
      setPrefs((p) => ({ ...p, column_order: newOrder }));

      const { data: current } = await supabase
        .from("profiles")
        .select("permissions")
        .eq("user_id", user.id)
        .maybeSingle();

      const currentPerms = (current?.permissions && typeof current.permissions === "object" ? current.permissions : {}) as Record<string, any>;

      await supabase
        .from("profiles")
        .update({ permissions: { ...currentPerms, column_order: newOrder } })
        .eq("user_id", user.id);
    },
    [user?.id, prefs]
  );

  return { loading, getDefaultPreset, setDefaultPreset, getColumnOrder, setColumnOrder };
}
