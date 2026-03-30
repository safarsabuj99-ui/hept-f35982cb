import { useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useImpersonation } from "@/hooks/useImpersonation";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, Send, Link2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface CampaignEntry {
  creativeLink: string;
  platform: string;
  objective: string;
  dailyBudget: string;
  description: string;
}

const EMPTY_CAMPAIGN: CampaignEntry = {
  creativeLink: "",
  platform: "",
  objective: "",
  dailyBudget: "",
  description: "",
};

const PLATFORMS = [
  { value: "meta", label: "Meta (Facebook/Instagram)" },
  { value: "tiktok", label: "TikTok" },
  { value: "google", label: "Google Ads" },
];

const OBJECTIVES = [
  { value: "Message", label: "Message / Lead" },
  { value: "Traffic/Website", label: "Traffic / Website" },
  { value: "Video Views", label: "Video Views" },
  { value: "Sales", label: "Sales / Conversion" },
];

function detectPlatform(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes("tiktok.com")) return "tiktok";
  if (lower.includes("facebook.com") || lower.includes("instagram.com") || lower.includes("fb.watch")) return "meta";
  return "";
}

function isValid(c: CampaignEntry): boolean {
  return !!c.creativeLink && !!c.platform && !!c.objective && Number(c.dailyBudget) > 0;
}

export default function NewCampaignRequest() {
  const { user } = useAuth();
  const { effectiveClientId } = useImpersonation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<CampaignEntry[]>([{ ...EMPTY_CAMPAIGN }]);
  const [submitting, setSubmitting] = useState(false);

  const update = useCallback((index: number, field: keyof CampaignEntry, value: string) => {
    setCampaigns(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      // Auto-detect platform when link changes
      if (field === "creativeLink") {
        const detected = detectPlatform(value);
        if (detected) next[index].platform = detected;
      }
      return next;
    });
  }, []);

  const addCampaign = () => setCampaigns(prev => [...prev, { ...EMPTY_CAMPAIGN }]);

  const removeCampaign = (index: number) => {
    setCampaigns(prev => prev.filter((_, i) => i !== index));
  };

  const allValid = campaigns.every(isValid);
  const totalDaily = campaigns.reduce((sum, c) => sum + (Number(c.dailyBudget) || 0), 0);

  const handleSubmit = async () => {
    if (!user || !effectiveClientId || !allValid) return;
    setSubmitting(true);

    const rows = campaigns.map(c => ({
      client_id: effectiveClientId,
      creative_link: c.creativeLink,
      platform: c.platform,
      objective: c.objective,
      budget_usd: Number(c.dailyBudget),
      duration_days: 1,
      start_date: new Date().toISOString().split("T")[0],
      ad_caption: c.description || null,
    }));

    const { error } = await supabase.from("campaign_requests" as any).insert(rows as any);
    setSubmitting(false);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Submitted!", description: `${campaigns.length} campaign request${campaigns.length > 1 ? "s" : ""} sent for review.` });
      navigate("/dashboard/campaigns");
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Campaign Request</h1>
          <p className="text-sm text-muted-foreground mt-1">Add one or more campaigns to submit as a batch.</p>
        </div>
        <Button variant="outline" size="sm" onClick={addCampaign} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add Campaign
        </Button>
      </div>

      <div className="space-y-4">
        {campaigns.map((c, i) => (
          <Card key={i} className="relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-primary rounded-l-lg" />
            <CardContent className="pt-5 pb-4 pl-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Campaign {i + 1}</span>
                {campaigns.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeCampaign(i)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              {/* Link */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" /> Post / Video Link *</Label>
                <Input
                  value={c.creativeLink}
                  onChange={e => update(i, "creativeLink", e.target.value)}
                  placeholder="https://www.tiktok.com/@user/video/... or drive link"
                />
                {c.creativeLink && c.platform && (
                  <p className="text-xs text-primary">
                    <Sparkles className="inline h-3 w-3 mr-1" />
                    Auto-detected: {PLATFORMS.find(p => p.value === c.platform)?.label}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Platform */}
                <div className="space-y-1.5">
                  <Label>Platform *</Label>
                  <Select value={c.platform} onValueChange={v => update(i, "platform", v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Objective */}
                <div className="space-y-1.5">
                  <Label>Objective *</Label>
                  <Select value={c.objective} onValueChange={v => update(i, "objective", v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {OBJECTIVES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Daily Budget */}
                <div className="space-y-1.5">
                  <Label>Daily Budget (USD) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="1"
                    value={c.dailyBudget}
                    onChange={e => update(i, "dailyBudget", e.target.value)}
                    placeholder="10.00"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label>Description / Notes</Label>
                <Textarea
                  value={c.description}
                  onChange={e => update(i, "description", e.target.value)}
                  placeholder="Target audience, special instructions, hashtags..."
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Summary & Submit */}
      <Card>
        <CardContent className="py-4 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{campaigns.length}</span> campaign{campaigns.length > 1 ? "s" : ""}
            {totalDaily > 0 && <> · <span className="font-semibold text-foreground">${totalDaily.toFixed(2)}</span>/day total</>}
          </div>
          <Button onClick={handleSubmit} disabled={submitting || !allValid} className="gap-1.5">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Submit {campaigns.length > 1 ? "All" : "Request"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
