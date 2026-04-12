import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wallet, TrendingUp, Receipt, ArrowDownUp } from "lucide-react";
import PlatformFinanceOverview from "@/components/platform-finance/FinanceOverview";
import PlatformRevenueTab from "@/components/platform-finance/RevenueTab";
import PlatformExpensesTab from "@/components/platform-finance/ExpensesTab";
import PlatformCashFlowTab from "@/components/platform-finance/CashFlowTab";

const VALID_TABS = ["overview", "revenue", "expenses", "cash-flow"] as const;

export default function PlatformFinanceHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab = VALID_TABS.includes(tabParam as any) ? tabParam! : "overview";

  const handleTabChange = (value: string) => {
    setSearchParams(value === "overview" ? {} : { tab: value }, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Finance Hub</h1>
        <p className="text-sm text-muted-foreground">P&L, revenue analytics, expenses & cash flow management</p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="flex w-full overflow-x-auto scrollbar-hide justify-start">
          <TabsTrigger value="overview" className="flex-shrink-0 gap-1.5">
            <Wallet className="h-3.5 w-3.5" /> P&L Overview
          </TabsTrigger>
          <TabsTrigger value="revenue" className="flex-shrink-0 gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" /> Revenue
          </TabsTrigger>
          <TabsTrigger value="expenses" className="flex-shrink-0 gap-1.5">
            <Receipt className="h-3.5 w-3.5" /> Expenses
          </TabsTrigger>
          <TabsTrigger value="cash-flow" className="flex-shrink-0 gap-1.5">
            <ArrowDownUp className="h-3.5 w-3.5" /> Cash Flow
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><PlatformFinanceOverview /></TabsContent>
        <TabsContent value="revenue"><PlatformRevenueTab /></TabsContent>
        <TabsContent value="expenses"><PlatformExpensesTab /></TabsContent>
        <TabsContent value="cash-flow"><PlatformCashFlowTab /></TabsContent>
      </Tabs>
    </div>
  );
}
