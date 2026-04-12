import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";

export default function PaymentSuccess() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full text-center">
        <CardContent className="pt-8 pb-8 space-y-4">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
          <h1 className="text-2xl font-bold">Payment Successful!</h1>
          <p className="text-muted-foreground">Your payment has been processed successfully. Your subscription has been renewed.</p>
          <Button onClick={() => navigate("/admin/subscription")} className="w-full">Go to Subscription</Button>
        </CardContent>
      </Card>
    </div>
  );
}
