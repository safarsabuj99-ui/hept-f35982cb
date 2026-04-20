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
import { Loader2, Plus, Trash2, Send, Link2, Sparkles, Package } from "lucide-react";
import { cn } from "@/lib/utils";

interface TaskEntry {
  productName: string;
  creativeLink: string;
  platform: string;
  objective: string;
  dailyBudget: string;
  adCaption: string;
  quantity: string;
}

const EMPTY_TASK: TaskEntry = {
  productName: "",
  creativeLink: "",
  platform: "",
  objective: "",
  dailyBudget: "",
  adCaption: "",
  quantity: "1",
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

function isTaskValid(t: TaskEntry): boolean {
  return !!t.productName.trim() && !!t.creativeLink && !!t.platform && !!t.objective && Number(t.dailyBudget) > 0 && Number(t.quantity) >= 1;
}

export default function NewCampaignRequest() {
  const { user } = useAuth();
  const { effectiveClientId } = useImpersonation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [tasks, setTasks] = useState<TaskEntry[]>([{ ...EMPTY_TASK }]);
  const [submitting, setSubmitting] = useState(false);

  const updateTask = useCallback((index: number, field: keyof TaskEntry, value: string) => {
    setTasks(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === "creativeLink") {
        const detected = detectPlatform(value);
        if (detected) next[index].platform = detected;
      }
      return next;
    });
  }, []);

  const addTask = () => setTasks(prev => [...prev, { ...EMPTY_TASK }]);
  const removeTask = (index: number) => setTasks(prev => prev.filter((_, i) => i !== index));

  const allValid = title.trim().length > 0 && tasks.length > 0 && tasks.every(isTaskValid);
  const totalDaily = tasks.reduce((sum, t) => sum + (Number(t.dailyBudget) || 0) * (Number(t.quantity) || 1), 0);
  const totalTasks = tasks.reduce((sum, t) => sum + (Number(t.quantity) || 1), 0);

  const platformBreakdown = tasks.reduce<Record<string, number>>((acc, t) => {
    if (t.platform) {
      acc[t.platform] = (acc[t.platform] || 0) + (Number(t.quantity) || 1);
    }
    return acc;
  }, {});

  const handleSubmit = async () => {
    if (!user || !effectiveClientId || !allValid) return;
    setSubmitting(true);

    // Create parent request
    const { data: parentData, error: parentError } = await (supabase.from("campaign_requests" as any).insert({
      client_id: effectiveClientId,
      title: title.trim(),
      ad_caption: notes || null,
      total_budget_usd: totalDaily,
      task_count: tasks.length,
      // Legacy fields (use first task's values for backward compat)
      platform: tasks[0].platform,
      objective: tasks[0].objective,
      budget_usd: totalDaily,
      creative_link: tasks[0].creativeLink,
      start_date: new Date().toISOString().split("T")[0],
      duration_days: 1,
    }).select("id").single() as any);

    if (parentError || !parentData) {
      setSubmitting(false);
      toast({ title: "Error", description: parentError?.message || "Failed to create request", variant: "destructive" });
      return;
    }

    // Create child tasks
    const taskRows = tasks.map(t => ({
      request_id: parentData.id,
      platform: t.platform,
      objective: t.objective,
      budget_usd: Number(t.dailyBudget),
      creative_link: t.creativeLink,
      ad_caption: t.adCaption || null,
      quantity: Number(t.quantity) || 1,
      product_name: t.productName.trim() || null,
    }));

    const { error: taskError } = await (supabase.from("campaign_tasks" as any).insert(taskRows) as any);
    setSubmitting(false);

    if (taskError) {
      toast({ title: "Error", description: taskError.message, variant: "destructive" });
    } else {
      toast({ title: "Submitted!", description: `Campaign request "${title}" with ${tasks.length} task(s) sent for review.` });
      navigate("/dashboard/campaigns");
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Campaign Request</h1>
        <p className="text-sm text-muted-foreground mt-1">Create a campaign request with one or more tasks.</p>
      </div>

      {/* Request Info */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Package className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Request Info</span>
          </div>
          <div className="space-y-1.5">
            <Label>Request Title *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Week 47 Campaigns" />
          </div>
          <div className="space-y-1.5">
            <Label>General Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Overall instructions, target audience, goals..." rows={2} />
          </div>
        </CardContent>
      </Card>

      {/* Tasks */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Campaign Tasks</span>
        <Button variant="outline" size="sm" onClick={addTask} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add Task
        </Button>
      </div>

      <div className="space-y-4">
        {tasks.map((t, i) => (
          <Card key={i} className="relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-primary rounded-l-lg" />
            <CardContent className="pt-5 pb-4 pl-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Task {i + 1}</span>
                {tasks.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeTask(i)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              {/* Creative Link */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" /> Post / Video Link *</Label>
                <Input
                  value={t.creativeLink}
                  onChange={e => updateTask(i, "creativeLink", e.target.value)}
                  placeholder="https://www.tiktok.com/@user/video/... or drive link"
                />
                {t.creativeLink && t.platform && (
                  <p className="text-xs text-primary">
                    <Sparkles className="inline h-3 w-3 mr-1" />
                    Auto-detected: {PLATFORMS.find(p => p.value === t.platform)?.label}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                {/* Platform */}
                <div className="space-y-1.5">
                  <Label>Platform *</Label>
                  <Select value={t.platform} onValueChange={v => updateTask(i, "platform", v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Objective */}
                <div className="space-y-1.5">
                  <Label>Objective *</Label>
                  <Select value={t.objective} onValueChange={v => updateTask(i, "objective", v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {OBJECTIVES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Daily Budget */}
                <div className="space-y-1.5">
                  <Label>Daily Budget (USD) *</Label>
                  <Input type="number" step="0.01" min="1" value={t.dailyBudget} onChange={e => updateTask(i, "dailyBudget", e.target.value)} placeholder="10.00" />
                </div>

                {/* Quantity */}
                <div className="space-y-1.5">
                  <Label>Quantity</Label>
                  <Input type="number" min="1" value={t.quantity} onChange={e => updateTask(i, "quantity", e.target.value)} placeholder="1" />
                </div>
              </div>

              {/* Ad Caption */}
              <div className="space-y-1.5">
                <Label>Ad Caption / Notes</Label>
                <Textarea value={t.adCaption} onChange={e => updateTask(i, "adCaption", e.target.value)} placeholder="Target audience, hashtags, special instructions..." rows={2} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Summary & Submit */}
      <Card>
        <CardContent className="py-4 space-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span><span className="font-semibold text-foreground">{tasks.length}</span> task{tasks.length > 1 ? "s" : ""}</span>
            {totalTasks !== tasks.length && (
              <span><span className="font-semibold text-foreground">{totalTasks}</span> total campaigns</span>
            )}
            {totalDaily > 0 && (
              <span><span className="font-semibold text-foreground">${totalDaily.toFixed(2)}</span>/day total</span>
            )}
            {Object.keys(platformBreakdown).length > 0 && (
              <span className="text-xs">
                {Object.entries(platformBreakdown).map(([p, count]) => `${count} ${PLATFORMS.find(pl => pl.value === p)?.label || p}`).join(", ")}
              </span>
            )}
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={submitting || !allValid} className="gap-1.5">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Submit Request
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
