import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";

const plans = [
  {
    name: "Starter",
    key: "starter",
    price: "৳2,000/mo",
    limits: { clients: 5, adAccounts: 10, managers: 2 },
    features: ["Basic dashboard", "Manual spend logging", "Client portal"],
  },
  {
    name: "Growth",
    key: "growth",
    price: "৳5,000/mo",
    limits: { clients: 20, adAccounts: 50, managers: 5 },
    features: ["API integrations", "Auto-sync ad spend", "Campaign mapping", "Finance hub"],
    popular: true,
  },
  {
    name: "Agency Pro",
    key: "agency_pro",
    price: "৳10,000/mo",
    limits: { clients: "Unlimited", adAccounts: "Unlimited", managers: "Unlimited" },
    features: ["Everything in Growth", "Ad Guard automation", "White-label portal", "Priority support"],
  },
];

export default function PlatformPlans() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Plan Tiers</h1>
        <p className="text-sm text-muted-foreground">Subscription plans available to agencies</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.key} className={p.popular ? "border-primary ring-1 ring-primary/20" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{p.name}</CardTitle>
                {p.popular && <Badge className="bg-primary/10 text-primary border-primary/20">Popular</Badge>}
              </div>
              <p className="text-2xl font-bold text-foreground">{p.price}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-md bg-muted p-2">
                  <p className="font-bold text-foreground">{p.limits.clients}</p>
                  <p className="text-muted-foreground">Clients</p>
                </div>
                <div className="rounded-md bg-muted p-2">
                  <p className="font-bold text-foreground">{p.limits.adAccounts}</p>
                  <p className="text-muted-foreground">Ad Accts</p>
                </div>
                <div className="rounded-md bg-muted p-2">
                  <p className="font-bold text-foreground">{p.limits.managers}</p>
                  <p className="text-muted-foreground">Managers</p>
                </div>
              </div>
              <ul className="space-y-2">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 text-success shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
