import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Grid3X3 } from "lucide-react";
import { useMemo } from "react";

const FEATURES = ["clients", "ad_accounts", "campaigns", "finance", "integrations"] as const;

export default function PlatformFeatureAdoption() {
  const { data: orgs = [] } = useQuery({ queryKey: ["adoption-orgs"], queryFn: async () => { const { data } = await supabase.from("organizations").select("id, name, status"); return data || []; } });
  const { data: profiles = [] } = useQuery({ queryKey: ["adoption-profiles"], queryFn: async () => { const { data } = await supabase.from("profiles").select("org_id"); return data || []; } });
  const { data: adAccounts = [] } = useQuery({ queryKey: ["adoption-accounts"], queryFn: async () => { const { data } = await supabase.from("ad_accounts").select("org_id"); return data || []; } });
  const { data: campaigns = [] } = useQuery({ queryKey: ["adoption-campaigns"], queryFn: async () => { const { data } = await supabase.from("campaigns").select("org_id"); return data || []; } });
  const { data: transactions = [] } = useQuery({ queryKey: ["adoption-transactions"], queryFn: async () => { const { data } = await supabase.from("transactions").select("org_id"); return data || []; } });
  const { data: integrations = [] } = useQuery({ queryKey: ["adoption-integrations"], queryFn: async () => { const { data } = await supabase.from("api_integrations").select("org_id"); return data || []; } });

  const heatmapData = useMemo(() => orgs.map((org) => ({
    org,
    counts: {
      clients: profiles.filter((p) => p.org_id === org.id).length,
      ad_accounts: adAccounts.filter((a) => a.org_id === org.id).length,
      campaigns: campaigns.filter((c) => c.org_id === org.id).length,
      finance: transactions.filter((t) => t.org_id === org.id).length,
      integrations: integrations.filter((i) => i.org_id === org.id).length,
    },
  })), [orgs, profiles, adAccounts, campaigns, transactions, integrations]);

  const maxCounts = useMemo(() => {
    const maxes: Record<string, number> = {};
    FEATURES.forEach((f) => { maxes[f] = Math.max(1, ...heatmapData.map((d) => d.counts[f])); });
    return maxes;
  }, [heatmapData]);

  const adoptionPct = useMemo(() => {
    const pcts: Record<string, number> = {};
    FEATURES.forEach((f) => { const using = heatmapData.filter((d) => d.counts[f] > 0).length; pcts[f] = orgs.length > 0 ? Math.round((using / orgs.length) * 100) : 0; });
    return pcts;
  }, [heatmapData, orgs.length]);

  const getIntensityClass = (value: number, max: number) => {
    if (value === 0) return "bg-muted text-muted-foreground";
    const pct = value / max;
    if (pct >= 0.75) return "bg-primary/80 text-primary-foreground";
    if (pct >= 0.5) return "bg-primary/50 text-foreground";
    if (pct >= 0.25) return "bg-primary/25 text-foreground";
    return "bg-primary/10 text-foreground";
  };

  return (
    <div className="space-y-8">
      <PageHeader title="Feature Adoption" subtitle="Track which features each agency uses" icon={<Grid3X3 className="h-6 w-6 text-primary" />} />

      <div>
        <p className="section-label mb-3">Adoption Rates</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {FEATURES.map((f, i) => (
            <KpiCard key={f} title={f.replace("_", " ")} value={`${adoptionPct[f]}%`} subtitle="adoption" icon={Grid3X3} staggerIndex={i} />
          ))}
        </div>
      </div>

      <div className="glass-card glow-border animate-slide-up-fade" style={{ animationDelay: "300ms", animationFillMode: "forwards" }}>
        <Card className="border-0 bg-transparent shadow-none">
          <CardHeader><CardTitle>Usage Heatmap</CardTitle></CardHeader>
          <CardContent>
            {heatmapData.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No agencies found</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agency</TableHead>
                    {FEATURES.map((f) => <TableHead key={f} className="text-center capitalize">{f.replace("_", " ")}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {heatmapData.map((d) => (
                    <TableRow key={d.org.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium">{d.org.name}</TableCell>
                      {FEATURES.map((f) => (
                        <TableCell key={f} className="text-center">
                          <span className={`inline-flex items-center justify-center w-10 h-8 rounded-md text-xs font-mono transition-colors ${getIntensityClass(d.counts[f], maxCounts[f])}`}>{d.counts[f]}</span>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
