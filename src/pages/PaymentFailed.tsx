import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";

export default function PaymentFailed() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full text-center">
        <CardContent className="pt-8 pb-8 space-y-4">
          <XCircle className="h-16 w-16 text-red-500 mx-auto" />
          <h1 className="text-2xl font-bold">Payment Failed</h1>
          <p className="text-muted-foreground">Your payment could not be processed. Please try again or contact support.</p>
          <div className="flex gap-2">
            <Button onClick={() => navigate("/admin/subscription")} variant="outline" className="flex-1">Back to Billing</Button>
            <Button onClick={() => navigate("/admin/support")} className="flex-1">Contact Support</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
