import { useCurrency } from "@/hooks/useCurrency";
import { Button } from "@/components/ui/button";
import { ArrowLeftRight } from "lucide-react";

export function CurrencyToggle() {
  const { currency, toggleCurrency, exchangeRate } = useCurrency();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleCurrency}
      className="gap-2 text-xs"
    >
      <ArrowLeftRight className="h-3 w-3" />
      {currency === "USD" ? "Show BDT" : "Show USD"}
      <span className="text-muted-foreground">({exchangeRate} BDT/USD)</span>
    </Button>
  );
}
