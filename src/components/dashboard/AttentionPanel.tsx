import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LowBalanceAlerts } from "@/components/LowBalanceAlerts";
import { SystemHealthWidget } from "@/components/dashboard/SystemHealthWidget";
import { UnassignedSpendAlert } from "@/components/dashboard/UnassignedSpendAlert";
import { AlertTriangle, Shield, Unlink, CreditCard } from "lucide-react";
import { BillingHealthWidget } from "@/components/dashboard/BillingHealthWidget";

export function AttentionPanel() {
  return (
    <Card className="glass-card glow-border">
      <Tabs defaultValue="alerts" className="w-full">
        <div className="flex items-center justify-between border-b border-border/50 px-4 pt-3 pb-0">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <AlertTriangle className="h-4 w-4" />
            Attention Required
          </div>
          <TabsList className="h-8 bg-transparent p-0 gap-1 overflow-x-auto flex-nowrap">
            <TabsTrigger value="alerts" className="h-7 gap-1.5 rounded-md px-3 text-xs data-[state=active]:bg-muted">
              <AlertTriangle className="h-3 w-3" /> Alerts
            </TabsTrigger>
            <TabsTrigger value="health" className="h-7 gap-1.5 rounded-md px-3 text-xs data-[state=active]:bg-muted">
              <Shield className="h-3 w-3" /> Health
            </TabsTrigger>
            <TabsTrigger value="risks" className="h-7 gap-1.5 rounded-md px-3 text-xs data-[state=active]:bg-muted">
              <Unlink className="h-3 w-3" /> Risks
            </TabsTrigger>
            <TabsTrigger value="billing" className="h-7 gap-1.5 rounded-md px-3 text-xs data-[state=active]:bg-muted">
              <CreditCard className="h-3 w-3" /> Billing
            </TabsTrigger>
          </TabsList>
        </div>
        <CardContent className="p-4">
          <TabsContent value="alerts" className="mt-0">
            <LowBalanceAlerts />
          </TabsContent>
          <TabsContent value="health" className="mt-0">
            <SystemHealthWidget />
          </TabsContent>
          <TabsContent value="risks" className="mt-0">
            <UnassignedSpendAlert />
          </TabsContent>
          <TabsContent value="billing" className="mt-0">
            <BillingHealthWidget />
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  );
}
