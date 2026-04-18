import { createContext, useContext, useEffect, ReactNode, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface BrandingData {
  brandName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  loading: boolean;
  refetch: () => void;
}

const defaultBranding: BrandingData = {
  brandName: "HEPT",
  logoUrl: null,
  primaryColor: "#2655cc",
  accentColor: "#e8eef8",
  loading: true,
  refetch: () => {},
};

const BrandingContext = createContext<BrandingData>(defaultBranding);

function hexToHsl(hex: string): string | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { user, authReady } = useAuth();
  const queryClient = useQueryClient();

  const { data: org, isLoading } = useQuery({
    queryKey: ["branding", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!profile?.org_id) return null;

      const { data, error } = await supabase
        .from("organizations")
        .select("brand_name, logo_url, primary_color, accent_color")
        .eq("id", profile.org_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: authReady && !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Only re-apply CSS variables when the actual color values change.
  // Depend on the primitive hex strings — not the org object identity —
  // so realtime react-query invalidations don't cause a full color repaint flash.
  useEffect(() => {
    if (!org) return;
    const root = document.documentElement;
    const primaryHsl = hexToHsl(org.primary_color || "#2655cc");
    const accentHsl = hexToHsl(org.accent_color || "#e8eef8");
    if (primaryHsl && root.style.getPropertyValue("--primary").trim() !== primaryHsl) {
      root.style.setProperty("--primary", primaryHsl);
      root.style.setProperty("--sidebar-primary", primaryHsl);
    }
    if (accentHsl && root.style.getPropertyValue("--accent").trim() !== accentHsl) {
      root.style.setProperty("--accent", accentHsl);
    }
    // No cleanup — removing vars on every effect run causes the visible flash.
  }, [org?.primary_color, org?.accent_color]);

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["branding"] });
  }, [queryClient]);

  const value: BrandingData = {
    brandName: org?.brand_name || "HEPT",
    logoUrl: org?.logo_url || null,
    primaryColor: org?.primary_color || "#2655cc",
    accentColor: org?.accent_color || "#e8eef8",
    loading: isLoading,
    refetch,
  };

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}
