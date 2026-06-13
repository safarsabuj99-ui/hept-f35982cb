import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RotateCw, CheckCircle2, AlertCircle, ShieldCheck } from "lucide-react";

export interface FailedJob {
  id: string;
  ad_account_id: string;
  function_name: string;
  attempts: number;
  last_error: string | null;
  error_code: string | null;
  completed_at: string | null;
  date_from: string | null;
  date_to: string | null;
  chunk_index: number | null;
  chunk_total: number | null;
  account_name?: string;
}

interface Props {
  jobs: FailedJob[];
  onRefresh: () => void;
}

export function SyncErrorPanel({ jobs, onRefresh }: Props) {
  const { toast } = useToast();
  const [retrying, setRetrying] = useState<string | null>(null);

  const handleRetry = async (id: string) => {
    setRetrying(id);
    const { error } = await (supabase.from("sync_jobs" as any) as any)
      .update({ status: "pending", attempts: 0, last_error: null, error_code: null, scheduled_at: new Date().toISOString(), completed_at: null, started_at: null })
      .eq("id", id);
    setRetrying(null);
    if (error) toast({ title: "Retry failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Job re-queued" }); onRefresh(); }
  };

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center gap-3 py-8 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
        <div className="relative">
          <div className="absolute inset-0 bg-emerald-500/30 blur-2xl rounded-full" />
          <div className="relative h-14 w-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <ShieldCheck className="h-7 w-7 text-emerald-500" />
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-emerald-600">All systems clean</p>
          <p className="text-xs text-muted-foreground mt-0.5">No failed jobs in the last 24 hours.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <AlertCircle className="h-4 w-4 text-destructive" />
        <p className="text-sm font-semibold">Failed Jobs</p>
        <Badge variant="destructive" className="text-[10px] h-5">{jobs.length}</Badge>
      </div>

      <Accordion type="multiple" className="space-y-2">
        {jobs.map(job => (
          <AccordionItem
            key={job.id}
            value={job.id}
            className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 data-[state=open]:bg-destructive/10 transition-colors"
          >
            <AccordionTrigger className="hover:no-underline py-3">
              <div className="flex items-center gap-2 flex-wrap text-left flex-1 min-w-0">
                <span className="font-medium text-sm truncate">{job.account_name}</span>
                <Badge variant="outline" className="text-[10px] h-5">{job.function_name.replace("sync-", "")}</Badge>
                {job.error_code && <Badge variant="destructive" className="text-[10px] h-5">{job.error_code}</Badge>}
                {job.error_code && (job.error_code === "cpu_timeout" || job.error_code === "proxy_upstream") && (
                  <Badge variant="outline" className="text-[10px] h-5 gap-1 border-primary/30 text-primary bg-primary/5">
                    ↻ auto-split
                  </Badge>
                )}
                {job.date_from && job.date_to && (
                  <Badge variant="outline" className="text-[10px] h-5 font-mono bg-background/40">
                    {job.date_from} → {job.date_to}
                  </Badge>
                )}
                <span className="text-[10px] text-muted-foreground ml-auto pr-2">
                  attempt {job.attempts}{job.completed_at && ` · ${formatDistanceToNow(new Date(job.completed_at), { addSuffix: true })}`}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-3 space-y-3">
              {job.last_error && (
                <div className="rounded-lg bg-background/60 border border-border/50 p-3">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Error Stack</p>
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words text-destructive/90 leading-relaxed">{job.last_error}</pre>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div className="rounded-md bg-background/40 p-2">
                  <p className="text-muted-foreground">Function</p>
                  <p className="font-mono">{job.function_name}</p>
                </div>
                <div className="rounded-md bg-background/40 p-2">
                  <p className="text-muted-foreground">Chunk</p>
                  <p className="font-mono">{job.chunk_index != null ? `${job.chunk_index}/${job.chunk_total}` : "—"}</p>
                </div>
                <div className="rounded-md bg-background/40 p-2">
                  <p className="text-muted-foreground">Attempts</p>
                  <p className="font-mono">{job.attempts}</p>
                </div>
                <div className="rounded-md bg-background/40 p-2">
                  <p className="text-muted-foreground">Code</p>
                  <p className="font-mono">{job.error_code || "—"}</p>
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" variant="outline" className="gap-1.5" disabled={retrying === job.id} onClick={() => handleRetry(job.id)}>
                  {retrying === job.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                  Retry this chunk
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
