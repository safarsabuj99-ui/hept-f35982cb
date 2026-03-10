import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FinanceDashboard from "./FinanceDashboard";
import WalletInventory from "./WalletInventory";
import ExpenseManager from "./ExpenseManager";
import CashFlowManagement from "./CashFlowManagement";

const VALID_TABS = ["overview", "wallet", "expenses", "cash-flow"] as const;

export default function FinanceHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab = VALID_TABS.includes(tabParam as any) ? tabParam! : "overview";

  const handleTabChange = (value: string) => {
    setSearchParams(value === "overview" ? {} : { tab: value }, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Finance</h1>
        <p className="text-sm text-muted-foreground">P&L, USD inventory, expenses & cash flow</p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="flex w-full overflow-x-auto scrollbar-hide justify-start">
          <TabsTrigger value="overview" className="flex-shrink-0">P&L Overview</TabsTrigger>
          <TabsTrigger value="wallet" className="flex-shrink-0">Wallet & USD</TabsTrigger>
          <TabsTrigger value="expenses" className="flex-shrink-0">Expenses</TabsTrigger>
          <TabsTrigger value="cash-flow" className="flex-shrink-0">Cash Flow</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><FinanceDashboard /></TabsContent>
        <TabsContent value="wallet"><WalletInventory /></TabsContent>
        <TabsContent value="expenses"><ExpenseManager /></TabsContent>
        <TabsContent value="cash-flow"><CashFlowManagement /></TabsContent>
      </Tabs>
    </div>
  );
}
