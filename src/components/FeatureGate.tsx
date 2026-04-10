import { useOrgFeatures, type FeatureKey, FEATURE_LABELS } from "@/hooks/useOrgFeatures";
import { Card, CardContent } from "@/components/ui/card";
import { Lock } from "lucide-react";

interface FeatureGateProps {
  feature: FeatureKey;
  children: React.ReactNode;
}

export function FeatureGate({ feature, children }: FeatureGateProps) {
  const { hasFeature, loading } = useOrgFeatures();

  if (loading) return null;

  if (!hasFeature(feature)) {
    return (
      <Card className="border-dashed border-2 border-muted">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">
            {FEATURE_LABELS[feature]} — Upgrade Required
          </h3>
          <p className="text-sm text-muted-foreground max-w-md">
            This feature is not included in your current plan. Contact your platform administrator to upgrade and unlock {FEATURE_LABELS[feature]}.
          </p>
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}
