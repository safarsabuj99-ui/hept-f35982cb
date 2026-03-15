import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Brain, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ChurnResult {
  org_id: string;
  org_name: string;
  risk_score: number;
  risk_level: string;
  factors: string[];
}

export default function PlatformChurnPrediction() {
  const { toast } = useToast();
  const [results, setResults] = useState<ChurnResult[]>([]);
  const [analyzing, setAnalyzing] = useState(false);

  const { data: orgs = [] } = useQuery({
    queryKey: ["churn-orgs"],
    queryFn: async () => {
      const { data } = await supabase.from("organizations").select("id, name, status, plan, created_at, status_changed_at");
      return data || [];
    },
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["churn-invoices"],
    queryFn: async () => {
      const { data } = await supabase.from("platform_invoices").select("org_id, status, due_date, payment_date");
      return data || [];
    },
  });

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("churn-predict", {
        body: { org_ids: orgs.map((o) => o.id) },
      });
      if (error) throw error;
      setResults(data?.predictions || []);
      toast({ title: "Analysis complete", description: `Analyzed ${orgs.length} agencies` });
    } catch (e: any) {
      toast({ title: "Analysis failed", description: e.message, variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  const getRiskBadge = (level: string) => {
    switch (level) {
      case "high": return <Badge variant="destructive">High Risk</Badge>;
      case "medium": return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Medium</Badge>;
      default: return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Low</Badge>;
    }
  };

  const highRisk = results.filter((r) => r.risk_level === "high").length;
  const medRisk = results.filter((r) => r.risk_level === "medium").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Churn Prediction</h1>
          <p className="text-muted-foreground">AI-powered risk scoring for all agencies</p>
        </div>
        <Button onClick={handleAnalyze} disabled={analyzing || orgs.length === 0}>
          {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
          {analyzing ? "Analyzing..." : "Analyze All"}
        </Button>
      </div>

      {results.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <div>
                  <p className="text-sm text-muted-foreground">High Risk</p>
                  <p className="text-2xl font-bold text-destructive">{highRisk}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Medium Risk</p>
              <p className="text-2xl font-bold text-yellow-500">{medRisk}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Low Risk</p>
              <p className="text-2xl font-bold text-emerald-500">{results.length - highRisk - medRisk}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Agency Risk Assessment</CardTitle>
        </CardHeader>
        <CardContent>
          {results.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Brain className="mx-auto h-12 w-12 mb-4 opacity-30" />
              <p>Click "Analyze All" to run AI-powered churn prediction</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agency</TableHead>
                  <TableHead>Risk Score</TableHead>
                  <TableHead>Risk Level</TableHead>
                  <TableHead>Key Factors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results
                  .sort((a, b) => b.risk_score - a.risk_score)
                  .map((r) => (
                    <TableRow key={r.org_id}>
                      <TableCell className="font-medium">{r.org_name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full ${r.risk_score >= 70 ? "bg-destructive" : r.risk_score >= 40 ? "bg-yellow-500" : "bg-emerald-500"}`}
                              style={{ width: `${r.risk_score}%` }}
                            />
                          </div>
                          <span className="text-sm font-mono">{r.risk_score}</span>
                        </div>
                      </TableCell>
                      <TableCell>{getRiskBadge(r.risk_level)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {r.factors.join(", ")}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
