import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ChevronLeft, ChevronRight, CheckCircle2, Megaphone, Palette, DollarSign, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Strategy", "Creative", "Budget & Schedule", "Review"];
const STEP_ICONS = [Megaphone, Palette, DollarSign, ClipboardList];

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

export default function NewCampaignRequest() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [platform, setPlatform] = useState("");
  const [objective, setObjective] = useState("");
  const [creativeLink, setCreativeLink] = useState("");
  const [adCaption, setAdCaption] = useState("");
  const [landingPageUrl, setLandingPageUrl] = useState("");
  const [budgetUsd, setBudgetUsd] = useState("");
  const [startDate, setStartDate] = useState("");
  const [durationDays, setDurationDays] = useState("7");
  const [targetAudienceNote, setTargetAudienceNote] = useState("");

  const needsLandingPage = objective === "Traffic/Website";

  const canProceed = () => {
    if (step === 0) return !!platform && !!objective;
    if (step === 1) return !!creativeLink && (!needsLandingPage || !!landingPageUrl);
    if (step === 2) return !!budgetUsd && Number(budgetUsd) > 0 && !!startDate && Number(durationDays) > 0;
    return true;
  };

  const handleSubmit = async () => {
    if (!user) return;
    setSubmitting(true);
    const { error } = await supabase.from("campaign_requests" as any).insert({
      client_id: user.id,
      platform,
      objective,
      creative_link: creativeLink,
      ad_caption: adCaption || null,
      landing_page_url: landingPageUrl || null,
      budget_usd: Number(budgetUsd),
      start_date: startDate,
      duration_days: Number(durationDays),
      target_audience_note: targetAudienceNote || null,
    } as any);
    setSubmitting(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Campaign Request Submitted!", description: "Your request is now pending review." });
      navigate("/dashboard");
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Campaign Request</h1>
        <p className="text-sm text-muted-foreground mt-1">Submit a new ad order for your agency to set up.</p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => {
          const Icon = STEP_ICONS[i];
          return (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors flex-1 justify-center",
                i < step && "bg-primary/10 text-primary",
                i === step && "bg-primary text-primary-foreground",
                i > step && "bg-muted text-muted-foreground"
              )}>
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{s}</span>
              </div>
              {i < STEPS.length - 1 && <div className={cn("h-px w-4 flex-shrink-0", i < step ? "bg-primary" : "bg-border")} />}
            </div>
          );
        })}
      </div>

      <Card>
        <CardContent className="pt-6 space-y-5">
          {/* Step 0: Strategy */}
          {step === 0 && (
            <>
              <div className="space-y-2">
                <Label>Platform *</Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger><SelectValue placeholder="Select ad platform" /></SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Objective *</Label>
                <Select value={objective} onValueChange={setObjective}>
                  <SelectTrigger><SelectValue placeholder="Select campaign objective" /></SelectTrigger>
                  <SelectContent>
                    {OBJECTIVES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Step 1: Creative */}
          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label>Video / Post Link *</Label>
                <Input value={creativeLink} onChange={e => setCreativeLink(e.target.value)} placeholder="https://drive.google.com/..." />
                <p className="text-xs text-muted-foreground">Link to your video file, Google Drive, or social media post</p>
              </div>
              <div className="space-y-2">
                <Label>Ad Caption</Label>
                <Textarea value={adCaption} onChange={e => setAdCaption(e.target.value)} placeholder="Write the text that should appear on the ad..." rows={3} />
              </div>
              {needsLandingPage && (
                <div className="space-y-2">
                  <Label>Landing Page URL *</Label>
                  <Input value={landingPageUrl} onChange={e => setLandingPageUrl(e.target.value)} placeholder="https://yourwebsite.com/landing" />
                  <p className="text-xs text-muted-foreground">Required for Traffic/Website objective</p>
                </div>
              )}
            </>
          )}

          {/* Step 2: Budget & Schedule */}
          {step === 2 && (
            <>
              <div className="space-y-2">
                <Label>Budget (USD) *</Label>
                <Input type="number" step="0.01" min="1" value={budgetUsd} onChange={e => setBudgetUsd(e.target.value)} placeholder="100.00" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date *</Label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Duration (Days) *</Label>
                  <Input type="number" min="1" value={durationDays} onChange={e => setDurationDays(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Target Audience Notes</Label>
                <Textarea value={targetAudienceNote} onChange={e => setTargetAudienceNote(e.target.value)} placeholder="e.g. Dhaka, Age 20-30, Male..." rows={2} />
              </div>
            </>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Review Your Request</h3>
              <div className="grid grid-cols-2 gap-3">
                <ReviewItem label="Platform" value={PLATFORMS.find(p => p.value === platform)?.label || platform} />
                <ReviewItem label="Objective" value={objective} />
                <ReviewItem label="Budget" value={`$${Number(budgetUsd).toFixed(2)}`} />
                <ReviewItem label="Start Date" value={startDate} />
                <ReviewItem label="Duration" value={`${durationDays} days`} />
                <ReviewItem label="Creative Link" value={creativeLink} isLink />
              </div>
              {adCaption && <ReviewItem label="Ad Caption" value={adCaption} fullWidth />}
              {landingPageUrl && <ReviewItem label="Landing Page" value={landingPageUrl} isLink fullWidth />}
              {targetAudienceNote && <ReviewItem label="Target Audience" value={targetAudienceNote} fullWidth />}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        <Button variant="outline" disabled={step === 0} onClick={() => setStep(s => s - 1)}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        {step < 3 ? (
          <Button disabled={!canProceed()} onClick={() => setStep(s => s + 1)}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <CheckCircle2 className="h-4 w-4 mr-1" /> Submit Request
          </Button>
        )}
      </div>
    </div>
  );
}

function ReviewItem({ label, value, isLink, fullWidth }: { label: string; value: string; isLink?: boolean; fullWidth?: boolean }) {
  return (
    <div className={cn("rounded-lg bg-muted/50 p-3", fullWidth && "col-span-2")}>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      {isLink ? (
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline break-all">{value}</a>
      ) : (
        <p className="text-sm font-medium break-words">{value}</p>
      )}
    </div>
  );
}
