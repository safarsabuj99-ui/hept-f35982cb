import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useBranding } from "@/hooks/useBranding";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Upload, X, BarChart3, Paintbrush } from "lucide-react";

export function BrandingTab() {
  const { user } = useAuth();
  const { brandName, logoUrl, primaryColor, accentColor, refetch } = useBranding();
  const { toast } = useToast();

  const [name, setName] = useState(brandName);
  const [primary, setPrimary] = useState(primaryColor);
  const [accent, setAccent] = useState(accentColor);
  const [logo, setLogo] = useState<string | null>(logoUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sync state when branding loads
  const [synced, setSynced] = useState(false);
  if (!synced && brandName !== "HEPT" || logoUrl) {
    if (brandName !== name && !synced) { setName(brandName); }
    if (primaryColor !== primary && !synced) { setPrimary(primaryColor); }
    if (accentColor !== accent && !synced) { setAccent(accentColor); }
    if (logoUrl !== logo && !synced) { setLogo(logoUrl); }
    setSynced(true);
  }

  // Get org_id
  const { data: orgId } = useQuery({
    queryKey: ["my-org-id", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data?.org_id || null;
    },
    enabled: !!user?.id,
  });

  const handleLogoUpload = useCallback(async (file: File) => {
    if (!orgId) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${orgId}/logo.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("brand-assets")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("brand-assets")
        .getPublicUrl(path);

      setLogo(urlData.publicUrl + "?t=" + Date.now());
      toast({ title: "Logo uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [orgId, toast]);

  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({
          brand_name: name.trim() || "HEPT",
          logo_url: logo,
          primary_color: primary,
          accent_color: accent,
        })
        .eq("id", orgId);

      if (error) throw error;
      refetch();
      toast({ title: "Branding saved", description: "Changes applied across all pages." });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Logo Upload */}
      <Card className="glass-card glow-border animate-slide-up-fade">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Upload className="h-5 w-5 text-primary" />
            Logo
          </CardTitle>
          <CardDescription>Upload your brand logo (PNG, JPG, SVG). Recommended: 200×200px or larger, square.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            {/* Preview */}
            <div className="relative h-20 w-20 shrink-0 rounded-xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center overflow-hidden bg-muted/30">
              {logo ? (
                <>
                  <img src={logo} alt="Logo" className="h-full w-full object-contain p-1" />
                  <button
                    onClick={() => setLogo(null)}
                    className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs hover:scale-110 transition-transform"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </>
              ) : (
                <BarChart3 className="h-8 w-8 text-muted-foreground/40" />
              )}
            </div>

            <div className="flex-1 space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleLogoUpload(f);
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="gap-2"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? "Uploading…" : "Choose File"}
              </Button>
              <p className="text-xs text-muted-foreground">Max 2MB. Appears in sidebar, header, and login page.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Brand Name & Colors */}
      <Card className="glass-card glow-border animate-slide-up-fade" style={{ animationDelay: "0.1s" }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Paintbrush className="h-5 w-5 text-primary" />
            Brand Identity
          </CardTitle>
          <CardDescription>Set your brand name and theme colors.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Brand Name */}
          <div className="space-y-2">
            <Label>Brand Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your Agency Name"
              maxLength={30}
            />
            <p className="text-xs text-muted-foreground">Replaces "HEPT" across the platform.</p>
          </div>

          {/* Colors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Primary Color</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={primary}
                  onChange={(e) => setPrimary(e.target.value)}
                  className="h-10 w-14 rounded-lg border border-input cursor-pointer"
                />
                <Input
                  value={primary}
                  onChange={(e) => setPrimary(e.target.value)}
                  placeholder="#6d28d9"
                  className="font-mono text-sm"
                  maxLength={7}
                />
              </div>
              <p className="text-xs text-muted-foreground">Buttons, links, sidebar accents.</p>
            </div>
            <div className="space-y-2">
              <Label>Accent Color</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                  className="h-10 w-14 rounded-lg border border-input cursor-pointer"
                />
                <Input
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                  placeholder="#f59e0b"
                  className="font-mono text-sm"
                  maxLength={7}
                />
              </div>
              <p className="text-xs text-muted-foreground">Badges, hover states, secondary highlights.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Live Preview */}
      <Card className="glass-card glow-border animate-slide-up-fade" style={{ animationDelay: "0.2s" }}>
        <CardHeader>
          <CardTitle className="text-lg">Live Preview</CardTitle>
          <CardDescription>How your branding will appear in the sidebar.</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="rounded-xl p-4 w-full max-w-xs"
            style={{
              background: "linear-gradient(180deg, hsl(224 35% 10%), hsl(224 35% 14%))",
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
                style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}
              >
                {logo ? (
                  <img src={logo} alt="" className="h-full w-full object-contain p-1" />
                ) : (
                  <BarChart3 className="h-5 w-5 text-white" />
                )}
              </div>
              <div>
                <span className="text-sm font-bold text-white">{name || "HEPT"}</span>
                <span className="block text-[10px] text-white/40">v2.0</span>
              </div>
            </div>
            {/* Fake nav items */}
            {["Dashboard", "Clients", "Settings"].map((item, i) => (
              <div
                key={item}
                className="flex items-center gap-2 px-3 py-2 rounded-lg mb-1 text-xs"
                style={{
                  background: i === 0 ? `${primary}22` : "transparent",
                  color: i === 0 ? primary : "rgba(255,255,255,0.5)",
                }}
              >
                <div
                  className="h-3 w-3 rounded"
                  style={{ background: i === 0 ? primary : "rgba(255,255,255,0.2)" }}
                />
                {item}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2 press-effect">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save Branding
        </Button>
      </div>
    </div>
  );
}
