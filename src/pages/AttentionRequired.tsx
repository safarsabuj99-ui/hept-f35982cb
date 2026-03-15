import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LowBalanceAlerts } from "@/components/LowBalanceAlerts";
import { SystemHealthWidget } from "@/components/dashboard/SystemHealthWidget";
import { BillingHealthWidget } from "@/components/dashboard/BillingHealthWidget";
import { AlertTriangle, Shield, CreditCard } from "lucide-react";

export default function AttentionRequired() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Attention Required</h1>
        <p className="text-muted-foreground text-sm mt-1">Monitor alerts, system health, and billing across all accounts.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="glass-card glow-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Low Balance Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LowBalanceAlerts />
          </CardContent>
        </Card>

        <Card className="glass-card glow-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-primary" />
              System Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SystemHealthWidget />
          </CardContent>
        </Card>

        <Card className="glass-card glow-border md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4 text-primary" />
              Billing Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BillingHealthWidget />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
