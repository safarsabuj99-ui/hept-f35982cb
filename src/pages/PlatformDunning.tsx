import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle, Pause, SkipForward, XCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  active: "bg-red-100 text-red-800",
  recovered: "bg-green-100 text-green-800",
  exhausted: "bg-muted text-muted-foreground",
  cancelled: "bg-yellow-100 text-yellow-800",
};

export default function PlatformDunning() {
  const queryClient = useQueryClient();

  const { data: runs = [] } = useQuery({
    queryKey: ["dunning-runs"],
    queryFn: async () => {
      const { data } = await supabase.from("dunning_runs")
        .select("*, organizations(name), dunning_schedules(name, steps)")
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: schedules = [] } = useQuery({
    queryKey: ["dunning-schedules"],
    queryFn: async () => {
      const { data } = await supabase.from("dunning_schedules").select("*").order("created_at");
      return data || [];
    },
  });

  const updateRun = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("dunning_runs").update({ status: status as any }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["dunning-runs"] }); toast.success("Dunning run updated"); },
  });

  const activeRuns = runs.filter((r: any) => r.status === "active");
  const totalOverdue = activeRuns.reduce((s: number, r: any) => s + (r.recovery_amount_bdt || 0), 0);
  const recoveredRuns = runs.filter((r: any) => r.status === "recovered");
  const recoveryRate = runs.length ? Math.round((recoveredRuns.length / runs.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Dunning Management" subtitle="Revenue recovery for overdue payments" />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-red-600">৳{totalOverdue.toLocaleString()}</div><p className="text-sm text-muted-foreground">Total Overdue</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-green-600">{recoveryRate}%</div><p className="text-sm text-muted-foreground">Recovery Rate</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{activeRuns.length}</div><p className="text-sm text-muted-foreground">Active Dunning</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{recoveredRuns.length}</div><p className="text-sm text-muted-foreground">Recovered</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Dunning Pipeline</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agency</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Step</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Last Action</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run: any) => {
                const steps = run.dunning_schedules?.steps || [];
                const currentStepInfo = steps[run.current_step];
                return (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium">{run.organizations?.name || "—"}</TableCell>
                    <TableCell>{run.dunning_schedules?.name || "—"}</TableCell>
                    <TableCell>
                      <span className="text-sm">{run.current_step + 1}/{steps.length}</span>
                      {currentStepInfo && <span className="text-xs text-muted-foreground ml-1">({currentStepInfo.action})</span>}
                    </TableCell>
                    <TableCell><Badge className={statusColors[run.status] || ""}>{run.status}</Badge></TableCell>
                    <TableCell className="text-sm">{format(new Date(run.started_at), "dd MMM")}</TableCell>
                    <TableCell className="text-sm">{run.last_action_at ? format(new Date(run.last_action_at), "dd MMM HH:mm") : "—"}</TableCell>
                    <TableCell>
                      {run.status === "active" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => updateRun.mutate({ id: run.id, status: "cancelled" })} title="Pause Dunning"><Pause className="h-3 w-3" /></Button>
                          <Button size="sm" variant="outline" onClick={() => updateRun.mutate({ id: run.id, status: "recovered" })} title="Mark Recovered"><CheckCircle className="h-3 w-3" /></Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!runs.length && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No dunning runs</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Dunning Schedules</CardTitle></CardHeader>
        <CardContent>
          {schedules.map((s: any) => (
            <div key={s.id} className="border rounded-lg p-4 mb-3">
              <div className="flex items-center gap-2 mb-2">
                <h4 className="font-semibold">{s.name}</h4>
                {s.is_default && <Badge>Default</Badge>}
              </div>
              <div className="flex gap-2 flex-wrap">
                {(s.steps || []).map((step: any, idx: number) => (
                  <div key={idx} className="bg-muted rounded-md px-3 py-1.5 text-sm flex items-center gap-1.5">
                    <span className="font-medium">Day {step.day}:</span>
                    <Badge variant="outline" className="text-xs">{step.action}</Badge>
                    {step.template && <span className="text-xs text-muted-foreground">{step.template}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
