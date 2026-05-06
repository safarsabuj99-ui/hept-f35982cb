import { useEffect, useState, useCallback, Fragment } from "react";
import { cn } from "@/lib/utils";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, ArrowLeftRight, Loader2, Banknote, Building2, Smartphone, Wallet, Trash2, ArrowDown, ArrowUp, MoveHorizontal, PiggyBank, HandCoins, RotateCcw, AlertTriangle, Landmark, ChevronRight, ChevronDown, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { TablePagination } from "@/components/TablePagination";
import { adjustAccountBalance } from "@/lib/adjustAccountBalance";
import { useProfile } from "@/hooks/useProfile";

interface AgencyAccount {
  id: string;
  name: string;
  type: string;
  account_number: string | null;
  current_balance_bdt: number;
  is_active: boolean;
  created_at: string;
  default_out_fee_percent?: number;
  default_out_fee_flat_bdt?: number;
}

interface FundTransfer {
  id: string;
  from_account_id: string;
  to_account_id: string;
  amount_bdt: number;
  note: string | null;
  created_by: string;
  created_at: string;
  fee_bdt?: number;
  fee_percent?: number | null;
}

interface RecentActivity {
  id: string;
  type: "in" | "out" | "transfer";
  description: string;
  amount_bdt: number;
  date: string;
  account_name?: string;
}

interface CashWithdrawal {
  id: string;
  from_account_id: string;
  amount_bdt: number;
  returned_bdt: number;
  category: string;
  status: string;
  borrower_name: string;
  date: string;
  expected_return_date: string | null;
  note: string | null;
  created_at: string;
  parent_withdrawal_id?: string | null;
}

interface LiquidFundLoan {
  id: string;
  liquid_fund_id: string | null;
  to_account_id: string;
  amount_bdt: number;
  returned_bdt: number;
  status: string;
  lender_name: string;
  date: string;
  expected_return_date: string | null;
  note: string | null;
  created_at: string;
}

interface CashWithdrawalReturn {
  id: string;
  withdrawal_id: string;
  amount_bdt: number;
  to_account_id: string;
  date: string;
  note: string | null;
  created_at: string;
}

const ACCOUNT_TYPE_ICONS: Record<string, any> = {
  Cash: Banknote,
  Bank: Building2,
  MFS: Smartphone,
};

const CATEGORY_LABELS: Record<string, string> = {
  personal_loan: "Personal Loan",
  business_loan: "Business Loan",
  others_loan: "Others Loan",
  advance: "Advance",
  other: "Other",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "destructive",
  partially_returned: "outline",
  fully_returned: "default",
};

export default function CashFlowManagement() {
  const [accounts, setAccounts] = useState<AgencyAccount[]>([]);
  const [transfers, setTransfers] = useState<FundTransfer[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [withdrawals, setWithdrawals] = useState<CashWithdrawal[]>([]);
  const [withdrawalReturns, setWithdrawalReturns] = useState<CashWithdrawalReturn[]>([]);
  const [loans, setLoans] = useState<LiquidFundLoan[]>([]);
  const [loading, setLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [accName, setAccName] = useState("");
  const [accType, setAccType] = useState<string>("Cash");
  const [accNumber, setAccNumber] = useState("");
  const [accBalance, setAccBalance] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [transferOpen, setTransferOpen] = useState(false);
  const [fromAccId, setFromAccId] = useState("");
  const [toAccId, setToAccId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [transferFeePercent, setTransferFeePercent] = useState("");
  const [transferFeeFlat, setTransferFeeFlat] = useState("");
  const [accFeePct, setAccFeePct] = useState("");
  const [accFeeFlat, setAccFeeFlat] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Liquid Fund state
  const [fundOpen, setFundOpen] = useState(false);
  const [fundAccId, setFundAccId] = useState("");
  const [fundAmount, setFundAmount] = useState("");
  const [fundSource, setFundSource] = useState("Personal Fund");
  const [fundDate, setFundDate] = useState(new Date().toISOString().slice(0, 10));
  const [fundNote, setFundNote] = useState("");
  const [fundSubmitting, setFundSubmitting] = useState(false);
  // Loan-specific fields for Add Fund
  const [fundLenderName, setFundLenderName] = useState("");
  const [fundExpectedReturn, setFundExpectedReturn] = useState("");

  // Withdrawal state
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [wdCategory, setWdCategory] = useState<string>("personal_loan");
  const [wdBorrower, setWdBorrower] = useState("");
  const [wdAmount, setWdAmount] = useState("");
  const [wdFromAccId, setWdFromAccId] = useState("");
  const [wdExpectedDate, setWdExpectedDate] = useState("");
  const [wdNote, setWdNote] = useState("");
  const [wdSubmitting, setWdSubmitting] = useState(false);
  const [wdParentId, setWdParentId] = useState<string | null>(null); // root id when topping up existing borrower
  const [borrowerPickerOpen, setBorrowerPickerOpen] = useState(false);
  const [expandedBorrowers, setExpandedBorrowers] = useState<Set<string>>(new Set());

  // Return state (for withdrawals)
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnWithdrawal, setReturnWithdrawal] = useState<CashWithdrawal | null>(null);
  const [retAmount, setRetAmount] = useState("");
  const [retToAccId, setRetToAccId] = useState("");
  const [retDate, setRetDate] = useState(new Date().toISOString().slice(0, 10));
  const [retNote, setRetNote] = useState("");
  const [retSubmitting, setRetSubmitting] = useState(false);

  // Loan return state
  const [loanReturnOpen, setLoanReturnOpen] = useState(false);
  const [returnLoan, setReturnLoan] = useState<LiquidFundLoan | null>(null);
  const [loanRetAmount, setLoanRetAmount] = useState("");
  const [loanRetFromAccId, setLoanRetFromAccId] = useState("");
  const [loanRetDate, setLoanRetDate] = useState(new Date().toISOString().slice(0, 10));
  const [loanRetNote, setLoanRetNote] = useState("");
  const [loanRetSubmitting, setLoanRetSubmitting] = useState(false);

  // Withdrawal pagination
  const [wdPage, setWdPage] = useState(1);
  const [wdPageSize, setWdPageSize] = useState(20);

  // Loan pagination
  const [loanPage, setLoanPage] = useState(1);
  const [loanPageSize, setLoanPageSize] = useState(20);

  // Activity pagination
  const [actPage, setActPage] = useState(1);
  const [actPageSize, setActPageSize] = useState(20);

  const { user } = useAuth();
  const { profile } = useProfile();
  const { toast } = useToast();

  // Auto-fill transfer fee defaults from source account
  useEffect(() => {
    if (!fromAccId) {
      setTransferFeePercent("");
      setTransferFeeFlat("");
      return;
    }
    const acc = accounts.find(a => a.id === fromAccId);
    if (acc) {
      setTransferFeePercent(String(acc.default_out_fee_percent ?? 0));
      setTransferFeeFlat(String(acc.default_out_fee_flat_bdt ?? 0));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromAccId]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [accRes, transferRes, paymentRes, purchaseRes, expenseRes, liquidRes, wdRes, loanRes, loanRetRes] = await Promise.all([
      supabase.from("agency_accounts" as any).select("*").order("type").order("name"),
      supabase.from("fund_transfers" as any).select("*").order("created_at", { ascending: false }).limit(20),
      supabase.from("payment_requests" as any).select("amount_bdt, payment_method, created_at, status, received_in_account_id").eq("status", "approved").order("created_at", { ascending: false }).limit(10),
      supabase.from("usd_purchases" as any).select("bdt_amount_paid, date, created_at, paid_from_account_id, notes").order("created_at", { ascending: false }).limit(10),
      supabase.from("agency_expenses" as any).select("amount_bdt, category, date, created_at, paid_from_account_id, description").order("created_at", { ascending: false }).limit(10),
      supabase.from("liquid_fund_entries" as any).select("*").order("created_at", { ascending: false }).limit(20),
      supabase.from("cash_withdrawals" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("liquid_fund_loans" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("liquid_fund_loan_returns" as any).select("*").order("created_at", { ascending: false }).limit(20),
    ]);

    const accs = (accRes.data as any[]) ?? [];
    setAccounts(accs);
    setTransfers((transferRes.data as any[]) ?? []);
    setWithdrawals((wdRes.data as any[]) ?? []);
    setLoans((loanRes.data as any[]) ?? []);

    const accMap: Record<string, string> = {};
    for (const a of accs) accMap[a.id] = a.name;

    const activity: RecentActivity[] = [];

    for (const p of (paymentRes.data as any[]) ?? []) {
      activity.push({
        id: `pay-${p.created_at}`,
        type: "in",
        description: `Client deposit via ${p.payment_method}`,
        amount_bdt: Number(p.amount_bdt),
        date: p.created_at,
        account_name: p.received_in_account_id ? accMap[p.received_in_account_id] : undefined,
      });
    }
    for (const u of (purchaseRes.data as any[]) ?? []) {
      activity.push({
        id: `usd-${u.created_at}`,
        type: "out",
        description: `USD purchase${u.notes ? `: ${u.notes}` : ""}`,
        amount_bdt: Number(u.bdt_amount_paid),
        date: u.created_at,
        account_name: u.paid_from_account_id ? accMap[u.paid_from_account_id] : undefined,
      });
    }
    for (const e of (expenseRes.data as any[]) ?? []) {
      activity.push({
        id: `exp-${e.created_at}`,
        type: "out",
        description: `${e.category}${e.description ? `: ${e.description}` : ""}`,
        amount_bdt: Number(e.amount_bdt),
        date: e.created_at,
        account_name: e.paid_from_account_id ? accMap[e.paid_from_account_id] : undefined,
      });
    }
    for (const t of (transferRes.data as any[]) ?? []) {
      activity.push({
        id: `tfr-${t.id}`,
        type: "transfer",
        description: `${accMap[t.from_account_id] || "?"} → ${accMap[t.to_account_id] || "?"}`,
        amount_bdt: Number(t.amount_bdt),
        date: t.created_at,
      });
    }

    for (const lf of (liquidRes.data as any[]) ?? []) {
      activity.push({
        id: `lf-${lf.id}`,
        type: lf.type === "inflow" ? "in" as const : "out" as const,
        description: `Liquid Fund: ${lf.source}${lf.note ? ` — ${lf.note}` : ""}`,
        amount_bdt: Number(lf.amount_bdt),
        date: lf.created_at,
        account_name: lf.account_id ? accMap[lf.account_id] : undefined,
      });
    }

    // Add withdrawal activity
    for (const w of (wdRes.data as any[]) ?? []) {
      activity.push({
        id: `wd-${w.id}`,
        type: "out",
        description: `Withdrawal: ${CATEGORY_LABELS[w.category] || w.category}${w.borrower_name ? ` — ${w.borrower_name}` : ""}`,
        amount_bdt: Number(w.amount_bdt),
        date: w.created_at,
        account_name: w.from_account_id ? accMap[w.from_account_id] : undefined,
      });
    }

    // Add loan return activity
    for (const lr of (loanRetRes.data as any[]) ?? []) {
      const loan = (loanRes.data as any[])?.find((l: any) => l.id === lr.loan_id);
      activity.push({
        id: `lr-${lr.id}`,
        type: "out",
        description: `Loan Repayment${loan ? `: ${loan.lender_name}` : ""}`,
        amount_bdt: Number(lr.amount_bdt),
        date: lr.created_at,
        account_name: lr.to_account_id ? accMap[lr.to_account_id] : undefined,
      });
    }

    activity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setRecentActivity(activity);
    setActPage(1);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel("cashflow-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "agency_accounts" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "agency_expenses" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "fund_transfers" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "usd_purchases" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "liquid_fund_entries" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_withdrawals" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_withdrawal_returns" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "liquid_fund_loans" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "liquid_fund_loan_returns" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const handleAddAccount = async () => {
    if (!accName.trim()) {
      toast({ title: "Error", description: "Account name is required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("agency_accounts" as any).insert({
      name: accName.trim(),
      type: accType,
      account_number: accNumber || null,
      current_balance_bdt: Number(accBalance) || 0,
      default_out_fee_percent: Number(accFeePct) || 0,
      default_out_fee_flat_bdt: Number(accFeeFlat) || 0,
      org_id: profile?.org_id || null,
    } as any);
    setSubmitting(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Account created" });
      setAccName(""); setAccNumber(""); setAccBalance(""); setAccFeePct(""); setAccFeeFlat("");
      setAddOpen(false);
      fetchData();
    }
  };

  const handleTransfer = async () => {
    const amt = Number(transferAmount);
    const feePct = Number(transferFeePercent) || 0;
    const feeFlat = Number(transferFeeFlat) || 0;
    const fee = Math.round(((amt * feePct) / 100 + feeFlat) * 100) / 100;
    const totalDeduct = amt + fee;

    if (!fromAccId || !toAccId || fromAccId === toAccId || amt <= 0) {
      toast({ title: "Error", description: "Select different accounts and a valid amount", variant: "destructive" });
      return;
    }
    const { data: freshFrom } = await supabase.from("agency_accounts").select("current_balance_bdt, name").eq("id", fromAccId).single();
    if (freshFrom && Number((freshFrom as any).current_balance_bdt) < totalDeduct) {
      toast({ title: "Insufficient Balance", description: `${(freshFrom as any).name} has only ৳${Number((freshFrom as any).current_balance_bdt).toLocaleString()} (need ৳${totalDeduct.toLocaleString()} incl. fee)`, variant: "destructive" });
      return;
    }

    setTransferring(true);

    // Step 1: Debit source by amount only (fee handled by expense trigger)
    const debitOk = await adjustAccountBalance(fromAccId, -amt);
    if (!debitOk) {
      setTransferring(false);
      toast({ title: "Error", description: "Failed to debit account", variant: "destructive" });
      return;
    }

    // Step 2: Credit destination
    const creditOk = await adjustAccountBalance(toAccId, amt);
    if (!creditOk) {
      await adjustAccountBalance(fromAccId, amt);
      setTransferring(false);
      toast({ title: "Error", description: "Failed to credit account", variant: "destructive" });
      return;
    }

    // Step 3: Create fee expense (trigger debits source for fee automatically)
    let feeExpenseId: string | null = null;
    if (fee > 0) {
      const fromAcc = accounts.find(a => a.id === fromAccId);
      const toAcc = accounts.find(a => a.id === toAccId);
      const { data: expData, error: expErr } = await supabase
        .from("agency_expenses" as any)
        .insert({
          amount_bdt: fee,
          category: "Transfer_Fee",
          description: `Transfer fee: ${fromAcc?.name || "?"} → ${toAcc?.name || "?"} (৳${amt.toLocaleString()}${feePct ? ` @ ${feePct}%` : ""})`,
          paid_from_account_id: fromAccId,
          created_by: user?.id,
          org_id: profile?.org_id || null,
        } as any)
        .select("id")
        .single();
      if (expErr) {
        // Roll back the transfer if fee logging fails
        await adjustAccountBalance(toAccId, -amt);
        await adjustAccountBalance(fromAccId, amt);
        setTransferring(false);
        toast({ title: "Error", description: "Failed to log transfer fee: " + expErr.message, variant: "destructive" });
        return;
      }
      feeExpenseId = (expData as any)?.id || null;
    }

    // Step 4: Insert fund_transfers record
    await supabase.from("fund_transfers" as any).insert({
      from_account_id: fromAccId,
      to_account_id: toAccId,
      amount_bdt: amt,
      fee_bdt: fee,
      fee_percent: feePct || null,
      fee_expense_id: feeExpenseId,
      note: transferNote || null,
      created_by: user?.id,
      org_id: profile?.org_id || null,
    } as any);

    setTransferring(false);
    toast({
      title: "Transfer Complete",
      description: fee > 0
        ? `৳${amt.toLocaleString()} moved · ৳${fee.toLocaleString()} fee logged as today's expense`
        : `৳${amt.toLocaleString()} moved successfully`,
    });
    setTransferAmount(""); setTransferNote(""); setFromAccId(""); setToAccId("");
    setTransferFeePercent(""); setTransferFeeFlat("");
    setTransferOpen(false);
    fetchData();
  };

  const handleAddFund = async () => {
    const amt = Number(fundAmount);
    if (!fundAccId || amt <= 0) {
      toast({ title: "Error", description: "Select an account and enter a valid amount", variant: "destructive" });
      return;
    }
    if (fundSource === "Loan" && !fundLenderName.trim()) {
      toast({ title: "Error", description: "Lender name is required for loan-funded deposits", variant: "destructive" });
      return;
    }
    setFundSubmitting(true);

    // Insert liquid fund entry
    const { data: lfData, error: insertErr } = await supabase.from("liquid_fund_entries" as any).insert({
      account_id: fundAccId,
      amount_bdt: amt,
      type: "inflow",
      source: fundSource,
      date: fundDate,
      note: fundNote || null,
      created_by: user?.id,
      org_id: profile?.org_id || null,
    } as any).select("id").single();

    if (insertErr) {
      setFundSubmitting(false);
      toast({ title: "Error", description: insertErr.message, variant: "destructive" });
      return;
    }

    // If source is Loan, also create a liquid_fund_loans record
    if (fundSource === "Loan" && lfData) {
      const { error: loanErr } = await supabase.from("liquid_fund_loans" as any).insert({
        liquid_fund_id: (lfData as any).id,
        to_account_id: fundAccId,
        amount_bdt: amt,
        lender_name: fundLenderName.trim(),
        date: fundDate,
        expected_return_date: fundExpectedReturn || null,
        note: fundNote || null,
        created_by: user?.id,
        org_id: profile?.org_id || null,
      } as any);
      if (loanErr) {
        setFundSubmitting(false);
        toast({ title: "Warning", description: "Fund added but loan tracking failed: " + loanErr.message, variant: "destructive" });
      }
    }

    await adjustAccountBalance(fundAccId, amt);
    const accNameFound = accounts.find(a => a.id === fundAccId)?.name;
    setFundSubmitting(false);
    toast({ title: "Fund Added", description: `৳${amt.toLocaleString()} deposited to ${accNameFound}` });
    setFundAmount(""); setFundNote(""); setFundAccId(""); setFundSource("Personal Fund");
    setFundDate(new Date().toISOString().slice(0, 10));
    setFundLenderName(""); setFundExpectedReturn("");
    setFundOpen(false);
    fetchData();
  };

  const handleWithdraw = async () => {
    const amt = Number(wdAmount);
    if (!wdFromAccId || amt <= 0 || !wdBorrower.trim()) {
      toast({ title: "Error", description: "Fill in account, borrower name, and amount", variant: "destructive" });
      return;
    }
    const { data: freshAcc } = await supabase.from("agency_accounts").select("current_balance_bdt, name").eq("id", wdFromAccId).single();
    if (freshAcc && Number((freshAcc as any).current_balance_bdt) < amt) {
      toast({ title: "Insufficient Balance", description: `${(freshAcc as any).name} has only ৳${Number((freshAcc as any).current_balance_bdt).toLocaleString()}`, variant: "destructive" });
      return;
    }
    setWdSubmitting(true);

    // Resolve root id: if wdParentId is itself a top-up, walk to its root.
    let rootId: string | null = wdParentId;
    if (rootId) {
      const node = withdrawals.find(w => w.id === rootId);
      if (node?.parent_withdrawal_id) rootId = node.parent_withdrawal_id;
    }

    const { error: insertErr } = await supabase.from("cash_withdrawals" as any).insert({
      from_account_id: wdFromAccId,
      amount_bdt: amt,
      category: wdCategory,
      borrower_name: wdBorrower.trim(),
      expected_return_date: wdExpectedDate || null,
      note: wdNote || null,
      created_by: user?.id,
      org_id: profile?.org_id || null,
      parent_withdrawal_id: rootId,
    } as any);

    if (insertErr) {
      setWdSubmitting(false);
      toast({ title: "Error", description: insertErr.message, variant: "destructive" });
      return;
    }

    await adjustAccountBalance(wdFromAccId, -amt);

    setWdSubmitting(false);
    toast({
      title: rootId ? "Top-Up Recorded" : "Withdrawal Recorded",
      description: `৳${amt.toLocaleString()} ${rootId ? "added to" : "withdrawn from"} ${(freshAcc as any)?.name}`,
    });
    setWdCategory("personal_loan"); setWdBorrower(""); setWdAmount("");
    setWdFromAccId(""); setWdExpectedDate(""); setWdNote(""); setWdParentId(null);
    setWithdrawOpen(false);
    fetchData();
  };

  const openReturnDialog = (w: CashWithdrawal) => {
    setReturnWithdrawal(w);
    setRetAmount("");
    setRetToAccId(w.from_account_id);
    setRetDate(new Date().toISOString().slice(0, 10));
    setRetNote("");
    setReturnOpen(true);
  };

  const handleRecordReturn = async () => {
    if (!returnWithdrawal) return;
    const amt = Number(retAmount);
    const remaining = Number(returnWithdrawal.amount_bdt) - Number(returnWithdrawal.returned_bdt);
    if (!retToAccId || amt <= 0 || amt > remaining) {
      toast({ title: "Error", description: `Enter a valid amount (max ৳${remaining.toLocaleString()})`, variant: "destructive" });
      return;
    }
    setRetSubmitting(true);

    const { error: insertErr } = await supabase.from("cash_withdrawal_returns" as any).insert({
      withdrawal_id: returnWithdrawal.id,
      amount_bdt: amt,
      to_account_id: retToAccId,
      date: retDate,
      note: retNote || null,
      created_by: user?.id,
      org_id: profile?.org_id || null,
    } as any);

    if (insertErr) {
      setRetSubmitting(false);
      toast({ title: "Error", description: insertErr.message, variant: "destructive" });
      return;
    }

    const newReturned = Number(returnWithdrawal.returned_bdt) + amt;
    const newStatus = newReturned >= Number(returnWithdrawal.amount_bdt) ? "fully_returned" : "partially_returned";
    await supabase.from("cash_withdrawals" as any)
      .update({ returned_bdt: newReturned, status: newStatus } as any)
      .eq("id", returnWithdrawal.id);

    await adjustAccountBalance(retToAccId, amt);

    setRetSubmitting(false);
    toast({ title: "Return Recorded", description: `৳${amt.toLocaleString()} returned` });
    setReturnOpen(false);
    setReturnWithdrawal(null);
    fetchData();
  };

  // Loan return handlers
  const openLoanReturnDialog = (loan: LiquidFundLoan) => {
    setReturnLoan(loan);
    setLoanRetAmount("");
    setLoanRetFromAccId(loan.to_account_id);
    setLoanRetDate(new Date().toISOString().slice(0, 10));
    setLoanRetNote("");
    setLoanReturnOpen(true);
  };

  const handleRecordLoanReturn = async () => {
    if (!returnLoan) return;
    const amt = Number(loanRetAmount);
    const remaining = Number(returnLoan.amount_bdt) - Number(returnLoan.returned_bdt);
    if (!loanRetFromAccId || amt <= 0 || amt > remaining) {
      toast({ title: "Error", description: `Enter a valid amount (max ৳${remaining.toLocaleString()})`, variant: "destructive" });
      return;
    }

    // Check balance
    const { data: freshAcc } = await supabase.from("agency_accounts").select("current_balance_bdt, name").eq("id", loanRetFromAccId).single();
    if (freshAcc && Number((freshAcc as any).current_balance_bdt) < amt) {
      toast({ title: "Insufficient Balance", description: `${(freshAcc as any).name} has only ৳${Number((freshAcc as any).current_balance_bdt).toLocaleString()}`, variant: "destructive" });
      return;
    }

    setLoanRetSubmitting(true);

    const { error: insertErr } = await supabase.from("liquid_fund_loan_returns" as any).insert({
      loan_id: returnLoan.id,
      amount_bdt: amt,
      to_account_id: loanRetFromAccId,
      date: loanRetDate,
      note: loanRetNote || null,
      created_by: user?.id,
      org_id: profile?.org_id || null,
    } as any);

    if (insertErr) {
      setLoanRetSubmitting(false);
      toast({ title: "Error", description: insertErr.message, variant: "destructive" });
      return;
    }

    const newReturned = Number(returnLoan.returned_bdt) + amt;
    const newStatus = newReturned >= Number(returnLoan.amount_bdt) ? "fully_returned" : "partially_returned";
    await supabase.from("liquid_fund_loans" as any)
      .update({ returned_bdt: newReturned, status: newStatus } as any)
      .eq("id", returnLoan.id);

    // Debit the account (money leaving to repay lender)
    await adjustAccountBalance(loanRetFromAccId, -amt);

    setLoanRetSubmitting(false);
    toast({ title: "Loan Repayment Recorded", description: `৳${amt.toLocaleString()} repaid` });
    setLoanReturnOpen(false);
    setReturnLoan(null);
    fetchData();
  };

  const handleToggleActive = async (acc: AgencyAccount) => {
    await supabase.from("agency_accounts" as any).update({ is_active: !acc.is_active } as any).eq("id", acc.id);
    fetchData();
  };

  const handleDeleteAccount = async (id: string) => {
    const acc = accounts.find(a => a.id === id);
    if (acc && Number(acc.current_balance_bdt) !== 0) {
      toast({ title: "Cannot Delete", description: "Transfer or zero out balance first", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("agency_accounts" as any).delete().eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else fetchData();
  };

  const totalBalance = accounts.reduce((s, a) => s + Number(a.current_balance_bdt), 0);
  const balanceByType: Record<string, number> = {};
  for (const a of accounts) {
    balanceByType[a.type] = (balanceByType[a.type] || 0) + Number(a.current_balance_bdt);
  }

  const activeAccounts = accounts.filter(a => a.is_active);
  const outstandingWithdrawals = withdrawals
    .filter(w => w.status !== "fully_returned")
    .reduce((s, w) => s + (Number(w.amount_bdt) - Number(w.returned_bdt)), 0);

  const outstandingLoans = loans
    .filter(l => l.status !== "fully_returned")
    .reduce((s, l) => s + (Number(l.amount_bdt) - Number(l.returned_bdt)), 0);

  const activityIcon = (type: string) => {
    if (type === "in") return <ArrowDown className="h-3.5 w-3.5 text-success" />;
    if (type === "out") return <ArrowUp className="h-3.5 w-3.5 text-destructive" />;
    return <MoveHorizontal className="h-3.5 w-3.5 text-primary" />;
  };

  const isOverdue = (item: { status: string; expected_return_date: string | null }) => {
    if (item.status === "fully_returned" || !item.expected_return_date) return false;
    return new Date(item.expected_return_date) < new Date();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-row sm:justify-end gap-1.5 sm:gap-3 p-1.5 sm:p-0 rounded-xl sm:rounded-none border border-border/30 sm:border-0 bg-card/30 sm:bg-transparent backdrop-blur-md sm:backdrop-blur-none">
        {/* 1. Add Fund — most-used, success accent */}
        <Dialog open={fundOpen} onOpenChange={setFundOpen}>
          <DialogTrigger asChild>
            <Button
              variant="success"
              size="sm"
              style={{ animationDelay: "0ms" }}
              className="animate-slide-up-fade flex-1 sm:flex-none text-[11px] sm:text-sm tracking-tight"
            >
              <PiggyBank />
              <span>Add Fund</span>
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Liquid Fund</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Deposit To Account</Label>
                <Select value={fundAccId} onValueChange={setFundAccId}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    {activeAccounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} (৳{Number(a.current_balance_bdt).toLocaleString()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Amount (BDT)</Label>
                <Input type="number" placeholder="e.g. 50000" value={fundAmount} onChange={e => setFundAmount(e.target.value)} />
              </div>
              <div>
                <Label>Source</Label>
                <Select value={fundSource} onValueChange={setFundSource}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Personal Fund">Personal Fund</SelectItem>
                    <SelectItem value="Other Business">Other Business</SelectItem>
                    <SelectItem value="Freelance">Freelance</SelectItem>
                    <SelectItem value="Loan">Loan</SelectItem>
                    <SelectItem value="Investment">Investment</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Loan-specific fields */}
              {fundSource === "Loan" && (
                <>
                  <div>
                    <Label>Lender Name <span className="text-destructive">*</span></Label>
                    <Input placeholder="Who gave you this loan?" value={fundLenderName} onChange={e => setFundLenderName(e.target.value)} />
                  </div>
                  <div>
                    <Label>Expected Return Date (optional)</Label>
                    <Input type="date" value={fundExpectedReturn} onChange={e => setFundExpectedReturn(e.target.value)} />
                  </div>
                </>
              )}

              <div>
                <Label>Date</Label>
                <Input type="date" value={fundDate} onChange={e => setFundDate(e.target.value)} />
              </div>
              <div>
                <Label>Note (optional)</Label>
                <Textarea value={fundNote} onChange={e => setFundNote(e.target.value)} placeholder="e.g. Freelance project payment received" />
              </div>
              <Button className="w-full" onClick={handleAddFund} disabled={fundSubmitting}>
                {fundSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Deposit Fund
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* 2. Withdraw — warning accent */}
        <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
          <DialogTrigger asChild>
            <Button
              variant="warning"
              size="sm"
              style={{ animationDelay: "60ms" }}
              className="animate-slide-up-fade flex-1 sm:flex-none text-[11px] sm:text-sm tracking-tight"
            >
              <HandCoins />
              <span>Withdraw</span>
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{wdParentId ? "Add Top-Up Borrow" : "Record Withdrawal / Loan"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>From Account</Label>
                <Select
                  value={wdFromAccId}
                  onValueChange={(v) => {
                    setWdFromAccId(v);
                    // Clear top-up linkage if account changes
                    if (wdParentId) {
                      const root = withdrawals.find(w => w.id === wdParentId);
                      if (root && root.from_account_id !== v) {
                        setWdParentId(null);
                        setWdBorrower("");
                      }
                    }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    {activeAccounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} (৳{Number(a.current_balance_bdt).toLocaleString()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Smart Borrower picker: lists existing active borrowers for the chosen account */}
              <div>
                <Label>Borrower Name</Label>
                {(() => {
                  // Build active borrower list (root rows only) for this account
                  const activeBorrowers = withdrawals.filter(
                    w => !w.parent_withdrawal_id
                      && w.status !== "fully_returned"
                      && (!wdFromAccId || w.from_account_id === wdFromAccId)
                  );
                  const computeOutstanding = (rootId: string) => {
                    const rows = withdrawals.filter(w => w.id === rootId || w.parent_withdrawal_id === rootId);
                    return rows.reduce((s, r) => s + (Number(r.amount_bdt) - Number(r.returned_bdt)), 0);
                  };
                  return (
                    <Popover open={borrowerPickerOpen} onOpenChange={setBorrowerPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          className="w-full justify-between font-normal"
                        >
                          <span className={wdBorrower ? "" : "text-muted-foreground"}>
                            {wdBorrower || "Type or pick a borrower"}
                          </span>
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                        <Command shouldFilter={true}>
                          <CommandInput
                            placeholder="Search or create new..."
                            value={wdBorrower}
                            onValueChange={(v) => {
                              setWdBorrower(v);
                              // Typing breaks the link unless they re-pick
                              if (wdParentId) {
                                const root = withdrawals.find(w => w.id === wdParentId);
                                if (!root || root.borrower_name.toLowerCase() !== v.trim().toLowerCase()) {
                                  setWdParentId(null);
                                }
                              }
                            }}
                          />
                          <CommandList>
                            {activeBorrowers.length > 0 && (
                              <CommandGroup heading="Active borrowers (top-up)">
                                {activeBorrowers.map(b => {
                                  const outstanding = computeOutstanding(b.id);
                                  const acc = accounts.find(a => a.id === b.from_account_id);
                                  return (
                                    <CommandItem
                                      key={b.id}
                                      value={b.borrower_name + " " + b.id}
                                      onSelect={() => {
                                        setWdBorrower(b.borrower_name);
                                        setWdCategory(b.category);
                                        setWdFromAccId(b.from_account_id);
                                        setWdParentId(b.id);
                                        setBorrowerPickerOpen(false);
                                      }}
                                    >
                                      {wdParentId === b.id && <Check className="mr-2 h-3.5 w-3.5" />}
                                      <div className="flex-1 min-w-0">
                                        <div className="font-medium truncate">{b.borrower_name}</div>
                                        <div className="text-xs text-muted-foreground">
                                          {acc?.name || "?"} · Outstanding ৳{outstanding.toLocaleString()}
                                        </div>
                                      </div>
                                    </CommandItem>
                                  );
                                })}
                              </CommandGroup>
                            )}
                            <CommandEmpty>
                              {wdBorrower.trim()
                                ? `Press enter to create "${wdBorrower.trim()}" as new borrower`
                                : "No active borrowers"}
                            </CommandEmpty>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  );
                })()}
              </div>

              {/* Top-up summary card */}
              {wdParentId && (() => {
                const root = withdrawals.find(w => w.id === wdParentId);
                if (!root) return null;
                const rows = withdrawals.filter(w => w.id === root.id || w.parent_withdrawal_id === root.id);
                const totalBorrowed = rows.reduce((s, r) => s + Number(r.amount_bdt), 0);
                const totalReturned = rows.reduce((s, r) => s + Number(r.returned_bdt), 0);
                const outstanding = totalBorrowed - totalReturned;
                return (
                  <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-warning">Top-Up Mode</span>
                      <button
                        type="button"
                        onClick={() => { setWdParentId(null); setWdBorrower(""); }}
                        className="text-xs underline text-muted-foreground hover:text-foreground"
                      >
                        Make new instead
                      </button>
                    </div>
                    <div className="text-xs text-muted-foreground grid grid-cols-3 gap-2 pt-1">
                      <div><div>Borrowed</div><div className="font-mono font-semibold text-foreground">৳{totalBorrowed.toLocaleString()}</div></div>
                      <div><div>Returned</div><div className="font-mono font-semibold text-success">৳{totalReturned.toLocaleString()}</div></div>
                      <div><div>Outstanding</div><div className="font-mono font-semibold text-destructive">৳{outstanding.toLocaleString()}</div></div>
                    </div>
                  </div>
                );
              })()}

              <div>
                <Label>Category</Label>
                <Select value={wdCategory} onValueChange={setWdCategory} disabled={!!wdParentId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal_loan">Personal Loan</SelectItem>
                    <SelectItem value="business_loan">Business Loan</SelectItem>
                    <SelectItem value="others_loan">Others Loan</SelectItem>
                    <SelectItem value="advance">Advance</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Amount (BDT)</Label>
                <Input type="number" placeholder="e.g. 50000" value={wdAmount} onChange={e => setWdAmount(e.target.value)} />
              </div>
              <div>
                <Label>Expected Return Date (optional)</Label>
                <Input type="date" value={wdExpectedDate} onChange={e => setWdExpectedDate(e.target.value)} />
              </div>
              <div>
                <Label>Note (optional)</Label>
                <Textarea value={wdNote} onChange={e => setWdNote(e.target.value)} placeholder="e.g. Lending to friend for 2 weeks" />
              </div>
              <Button className="w-full" onClick={handleWithdraw} disabled={wdSubmitting}>
                {wdSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {wdParentId ? "Add Top-Up" : "Record Withdrawal"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* 3. Transfer — primary outline */}
        <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              style={{ animationDelay: "120ms" }}
              className="animate-slide-up-fade flex-1 sm:flex-none text-[11px] sm:text-sm tracking-tight border-primary/30 text-primary"
            >
              <ArrowLeftRight />
              <span>Transfer</span>
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Fund Transfer</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>From Account</Label>
                <Select value={fromAccId} onValueChange={setFromAccId}>
                  <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                  <SelectContent>
                    {activeAccounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} (৳{Number(a.current_balance_bdt).toLocaleString()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>To Account</Label>
                <Select value={toAccId} onValueChange={setToAccId}>
                  <SelectTrigger><SelectValue placeholder="Select destination" /></SelectTrigger>
                  <SelectContent>
                    {activeAccounts.filter(a => a.id !== fromAccId).map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} (৳{Number(a.current_balance_bdt).toLocaleString()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Amount (BDT)</Label>
                <Input type="number" placeholder="e.g. 10000" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Fee % (cash-out charge)</Label>
                  <Input type="number" step="0.01" placeholder="0" value={transferFeePercent} onChange={e => setTransferFeePercent(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Flat Fee (৳)</Label>
                  <Input type="number" step="0.01" placeholder="0" value={transferFeeFlat} onChange={e => setTransferFeeFlat(e.target.value)} />
                </div>
              </div>
              {(() => {
                const amt = Number(transferAmount) || 0;
                const fp = Number(transferFeePercent) || 0;
                const ff = Number(transferFeeFlat) || 0;
                const fee = Math.round(((amt * fp) / 100 + ff) * 100) / 100;
                if (amt <= 0) return null;
                return (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs space-y-1">
                    <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-mono">৳{amt.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Transfer fee</span><span className="font-mono text-destructive">৳{fee.toLocaleString()}</span></div>
                    <div className="flex justify-between border-t pt-1 mt-1 font-semibold"><span>Total deducted from source</span><span className="font-mono">৳{(amt + fee).toLocaleString()}</span></div>
                    <div className="flex justify-between text-muted-foreground"><span>Destination receives</span><span className="font-mono">৳{amt.toLocaleString()}</span></div>
                    {fee > 0 && <p className="text-[10px] text-muted-foreground pt-1">Fee will be auto-logged as today's expense (Transfer_Fee)</p>}
                  </div>
                );
              })()}
              <div>
                <Label>Reference / Note (optional)</Label>
                <Textarea value={transferNote} onChange={e => setTransferNote(e.target.value)} placeholder="e.g. Moving to bank for vendor payment" />
              </div>
              <Button className="w-full" onClick={handleTransfer} disabled={transferring}>
                {transferring && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Execute Transfer
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* 4. Add Account — primary solid CTA */}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button
              variant="premium"
              size="sm"
              style={{ animationDelay: "180ms" }}
              className="animate-slide-up-fade flex-1 sm:flex-none text-[11px] sm:text-sm tracking-tight"
            >
              <Plus />
              <span><span className="hidden sm:inline">Add </span>Account</span>
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Agency Account</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Account Name</Label>
                <Input placeholder="e.g. Office Cash" value={accName} onChange={e => setAccName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Type</Label>
                  <Select value={accType} onValueChange={setAccType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Bank">Bank</SelectItem>
                      <SelectItem value="MFS">MFS (bKash/Nagad)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Account # (optional)</Label>
                  <Input placeholder="e.g. 1234567890" value={accNumber} onChange={e => setAccNumber(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Opening Balance (BDT)</Label>
                <Input type="number" placeholder="0" value={accBalance} onChange={e => setAccBalance(e.target.value)} />
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                <p className="text-xs font-medium text-muted-foreground">Default Out-Transfer Fee</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Fee % (e.g. bKash 1.85)</Label>
                    <Input type="number" step="0.01" placeholder="0" value={accFeePct} onChange={e => setAccFeePct(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Flat Fee (৳)</Label>
                    <Input type="number" step="0.01" placeholder="0" value={accFeeFlat} onChange={e => setAccFeeFlat(e.target.value)} />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">Auto-applied when transferring out from this account. Editable per transfer.</p>
              </div>
              <Button className="w-full" onClick={handleAddAccount} disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create Account
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Premium KPI Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3">
        <KpiCard
          title="Total Liquid Funds"
          value={`৳${totalBalance.toLocaleString()}`}
          subtitle="All accounts combined"
          icon={Wallet}
          loading={loading}
          accentColor="hsl(var(--primary))"
          staggerIndex={0}
        />
        <KpiCard
          title="Outstanding Withdrawals"
          value={`৳${outstandingWithdrawals.toLocaleString()}`}
          subtitle="Money owed back"
          icon={HandCoins}
          loading={loading}
          accentColor="hsl(var(--warning))"
          staggerIndex={1}
        />
        <KpiCard
          title="Loan Outstanding"
          value={`৳${outstandingLoans.toLocaleString()}`}
          subtitle="Loan amount to repay"
          icon={Landmark}
          loading={loading}
          accentColor="hsl(var(--destructive))"
          staggerIndex={2}
        />
        <KpiCard
          title="Cash"
          value={`৳${(balanceByType["Cash"] || 0).toLocaleString()}`}
          icon={Banknote}
          loading={loading}
          accentColor="hsl(var(--chart-meta))"
          staggerIndex={3}
        />
        <KpiCard
          title="Bank"
          value={`৳${(balanceByType["Bank"] || 0).toLocaleString()}`}
          icon={Building2}
          loading={loading}
          accentColor="hsl(var(--chart-google))"
          staggerIndex={4}
        />
        <KpiCard
          title="MFS"
          value={`৳${(balanceByType["MFS"] || 0).toLocaleString()}`}
          icon={Smartphone}
          loading={loading}
          accentColor="hsl(var(--chart-tiktok))"
          staggerIndex={5}
        />
      </div>

      <Tabs defaultValue="accounts">
        <TabsList className="flex w-full overflow-x-auto scrollbar-hide justify-start">
          <TabsTrigger value="accounts" className="flex-shrink-0">Accounts ({accounts.length})</TabsTrigger>
          <TabsTrigger value="withdrawals" className="flex-shrink-0">
            Withdrawals ({withdrawals.filter(w => w.status !== "fully_returned").length})
          </TabsTrigger>
          <TabsTrigger value="loans" className="flex-shrink-0">
            Loans ({loans.filter(l => l.status !== "fully_returned").length})
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex-shrink-0">Recent Activity</TabsTrigger>
          <TabsTrigger value="transfers" className="flex-shrink-0">Transfer History</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts">
          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : accounts.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No accounts. Click "Add Account" to get started.</p>
              ) : (
                <>
                  {/* Mobile card view */}
                  <div className="flex flex-col gap-3 md:hidden">
                    {accounts.map(a => (
                      <div key={a.id} className="rounded-xl border p-4 space-y-3 bg-card">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{a.name}</span>
                            <Badge variant="secondary" className="text-xs">{a.type}</Badge>
                          </div>
                          <Switch checked={a.is_active} onCheckedChange={() => handleToggleActive(a)} />
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="font-mono font-semibold text-lg">৳{Number(a.current_balance_bdt).toLocaleString()}</p>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteAccount(a.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                        {a.account_number && (
                          <p className="text-xs text-muted-foreground font-mono"># {a.account_number}</p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Account</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="hidden sm:table-cell">Account #</TableHead>
                          <TableHead className="text-right">Balance (BDT)</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {accounts.map(a => (
                          <TableRow key={a.id}>
                            <TableCell className="font-medium">{a.name}</TableCell>
                            <TableCell><Badge variant="secondary">{a.type}</Badge></TableCell>
                            <TableCell className="hidden sm:table-cell font-mono text-sm text-muted-foreground">{a.account_number || "—"}</TableCell>
                            <TableCell className="text-right font-mono font-semibold">৳{Number(a.current_balance_bdt).toLocaleString()}</TableCell>
                            <TableCell className="text-center">
                              <Switch checked={a.is_active} onCheckedChange={() => handleToggleActive(a)} />
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteAccount(a.id)}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="withdrawals">
          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : withdrawals.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No withdrawals recorded yet</p>
              ) : (
                <>
                  {(() => {
                    // Build groups: rootId -> { root, children, totals }
                    const rootMap = new Map<string, { root: CashWithdrawal; children: CashWithdrawal[] }>();
                    for (const w of withdrawals) {
                      if (!w.parent_withdrawal_id) {
                        if (!rootMap.has(w.id)) rootMap.set(w.id, { root: w, children: [] });
                        else rootMap.get(w.id)!.root = w;
                      }
                    }
                    for (const w of withdrawals) {
                      if (w.parent_withdrawal_id) {
                        const g = rootMap.get(w.parent_withdrawal_id);
                        if (g) g.children.push(w);
                        else rootMap.set(w.id, { root: w, children: [] }); // orphan fallback
                      }
                    }
                    const groups = Array.from(rootMap.values()).map(g => {
                      const all = [g.root, ...g.children];
                      const totalBorrowed = all.reduce((s, r) => s + Number(r.amount_bdt), 0);
                      const totalReturned = all.reduce((s, r) => s + Number(r.returned_bdt), 0);
                      const outstanding = totalBorrowed - totalReturned;
                      const allReturned = all.every(r => r.status === "fully_returned");
                      const anyOverdue = all.some(r => isOverdue(r));
                      const latestDate = all.reduce((m, r) => (r.created_at > m ? r.created_at : m), g.root.created_at);
                      return { ...g, all, totalBorrowed, totalReturned, outstanding, allReturned, anyOverdue, latestDate };
                    }).sort((a, b) => b.latestDate.localeCompare(a.latestDate));

                    const pagedGroups = groups.slice((wdPage - 1) * wdPageSize, wdPage * wdPageSize);

                    const toggleExpand = (rootId: string) => {
                      setExpandedBorrowers(prev => {
                        const next = new Set(prev);
                        if (next.has(rootId)) next.delete(rootId);
                        else next.add(rootId);
                        return next;
                      });
                    };

                    return (
                      <>
                        {/* Mobile card view */}
                        <div className="flex flex-col gap-3 md:hidden">
                          {pagedGroups.map(g => {
                            const fromAcc = accounts.find(a => a.id === g.root.from_account_id);
                            const isOpen = expandedBorrowers.has(g.root.id);
                            return (
                              <div key={g.root.id} className={`rounded-xl border bg-card ${g.anyOverdue ? "border-destructive/50" : ""}`}>
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(g.root.id)}
                                  className="w-full p-4 space-y-3 text-left"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Badge variant="secondary" className="text-xs">{CATEGORY_LABELS[g.root.category] || g.root.category}</Badge>
                                      {g.children.length > 0 && (
                                        <Badge variant="outline" className="text-xs">{g.all.length} entries</Badge>
                                      )}
                                      {g.anyOverdue && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                                    </div>
                                    {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">{g.root.borrower_name || "—"}</p>
                                    <p className="text-xs text-muted-foreground">{fromAcc?.name || "?"}</p>
                                  </div>
                                  <div className="grid grid-cols-3 gap-2 text-xs">
                                    <div><div className="text-muted-foreground">Borrowed</div><div className="font-mono font-semibold">৳{g.totalBorrowed.toLocaleString()}</div></div>
                                    <div><div className="text-muted-foreground">Returned</div><div className="font-mono font-semibold text-success">৳{g.totalReturned.toLocaleString()}</div></div>
                                    <div><div className="text-muted-foreground">Outstanding</div><div className={`font-mono font-semibold ${g.outstanding > 0 ? "text-destructive" : "text-success"}`}>৳{g.outstanding.toLocaleString()}</div></div>
                                  </div>
                                </button>
                                {isOpen && (
                                  <div className="border-t bg-muted/20 divide-y">
                                    {g.all.map(child => {
                                      const remaining = Number(child.amount_bdt) - Number(child.returned_bdt);
                                      return (
                                        <div key={child.id} className="p-3 flex items-center justify-between">
                                          <div>
                                            <p className="text-xs text-muted-foreground">{new Date(child.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                                            <p className="font-mono text-sm">৳{Number(child.amount_bdt).toLocaleString()}</p>
                                            {remaining > 0 && remaining < Number(child.amount_bdt) && (
                                              <p className="text-[10px] text-muted-foreground">Outstanding: ৳{remaining.toLocaleString()}</p>
                                            )}
                                          </div>
                                          {child.status !== "fully_returned" && (
                                            <Button size="sm" variant="outline" onClick={() => openReturnDialog(child)}>
                                              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Return
                                            </Button>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Desktop table */}
                        <div className="hidden md:block overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-8"></TableHead>
                                <TableHead>Last Date</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Borrower</TableHead>
                                <TableHead>From</TableHead>
                                <TableHead className="text-right">Total Borrowed</TableHead>
                                <TableHead className="text-right">Returned</TableHead>
                                <TableHead className="text-right">Outstanding</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {pagedGroups.map(g => {
                                const fromAcc = accounts.find(a => a.id === g.root.from_account_id);
                                const isOpen = expandedBorrowers.has(g.root.id);
                                const hasChildren = g.children.length > 0;
                                return (
                                  <Fragment key={g.root.id}>
                                    <TableRow
                                      className={`${g.anyOverdue ? "bg-destructive/5" : ""} cursor-pointer`}
                                      onClick={() => hasChildren && toggleExpand(g.root.id)}
                                    >
                                      <TableCell>
                                        {hasChildren ? (
                                          isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                                        ) : null}
                                      </TableCell>
                                      <TableCell className="font-mono text-sm">{new Date(g.latestDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</TableCell>
                                      <TableCell>
                                        <Badge variant="secondary" className="text-xs">{CATEGORY_LABELS[g.root.category] || g.root.category}</Badge>
                                      </TableCell>
                                      <TableCell className="font-medium">
                                        {g.root.borrower_name || "—"}
                                        {hasChildren && (
                                          <span className="ml-2 text-xs text-muted-foreground">({g.all.length}×)</span>
                                        )}
                                      </TableCell>
                                      <TableCell className="text-sm text-muted-foreground">{fromAcc?.name || "?"}</TableCell>
                                      <TableCell className="text-right font-mono font-semibold">৳{g.totalBorrowed.toLocaleString()}</TableCell>
                                      <TableCell className="text-right font-mono text-success">৳{g.totalReturned.toLocaleString()}</TableCell>
                                      <TableCell className={`text-right font-mono font-semibold ${g.outstanding > 0 ? "text-destructive" : "text-success"}`}>
                                        ৳{g.outstanding.toLocaleString()}
                                      </TableCell>
                                      <TableCell>
                                        <Badge variant={g.allReturned ? "secondary" : (g.totalReturned > 0 ? "warning" as any : "destructive")} className="text-xs capitalize">
                                          {g.allReturned ? "Fully returned" : (g.totalReturned > 0 ? "Partially returned" : "Active")}
                                        </Badge>
                                      </TableCell>
                                      <TableCell onClick={(e) => e.stopPropagation()}>
                                        {!g.allReturned && (
                                          <Button size="sm" variant="outline" onClick={() => openReturnDialog(g.root)}>
                                            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Return
                                          </Button>
                                        )}
                                      </TableCell>
                                    </TableRow>
                                    {isOpen && g.all.map(child => {
                                      const remaining = Number(child.amount_bdt) - Number(child.returned_bdt);
                                      const overdue = isOverdue(child);
                                      return (
                                        <TableRow key={child.id} className="bg-muted/20 text-xs">
                                          <TableCell></TableCell>
                                          <TableCell className="font-mono pl-8">↳ {new Date(child.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</TableCell>
                                          <TableCell colSpan={2} className="text-muted-foreground">
                                            {child.parent_withdrawal_id ? "Top-up" : "Original"}
                                            {child.note ? ` · ${child.note}` : ""}
                                          </TableCell>
                                          <TableCell className="text-muted-foreground">
                                            {child.expected_return_date ? `Due ${new Date(child.expected_return_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                                            {overdue && <AlertTriangle className="inline h-3 w-3 ml-1 text-destructive" />}
                                          </TableCell>
                                          <TableCell className="text-right font-mono">৳{Number(child.amount_bdt).toLocaleString()}</TableCell>
                                          <TableCell className="text-right font-mono text-success">৳{Number(child.returned_bdt).toLocaleString()}</TableCell>
                                          <TableCell className={`text-right font-mono ${remaining > 0 ? "text-destructive" : "text-success"}`}>৳{remaining.toLocaleString()}</TableCell>
                                          <TableCell>
                                            <Badge variant={STATUS_VARIANTS[child.status] || "secondary"} className="text-[10px] capitalize">
                                              {child.status.replace(/_/g, " ")}
                                            </Badge>
                                          </TableCell>
                                          <TableCell>
                                            {child.status !== "fully_returned" && (
                                              <Button size="sm" variant="ghost" onClick={() => openReturnDialog(child)}>
                                                <RotateCcw className="mr-1 h-3 w-3" /> Return
                                              </Button>
                                            )}
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </Fragment>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                        <TablePagination
                          totalItems={groups.length}
                          pageSize={wdPageSize}
                          currentPage={wdPage}
                          onPageChange={setWdPage}
                          onPageSizeChange={setWdPageSize}
                        />
                      </>
                    );
                  })()}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Loans Tab */}
        <TabsContent value="loans">
          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : loans.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No loans recorded yet. Use "Add Fund" with source "Loan" to track loan-funded deposits.</p>
              ) : (
                <>
                  {/* Mobile card view */}
                  <div className="flex flex-col gap-3 md:hidden">
                    {loans.slice((loanPage - 1) * loanPageSize, loanPage * loanPageSize).map(l => {
                      const remaining = Number(l.amount_bdt) - Number(l.returned_bdt);
                      const overdue = isOverdue(l);
                      const toAcc = accounts.find(a => a.id === l.to_account_id);
                      return (
                        <div key={l.id} className={`rounded-xl border p-4 space-y-3 bg-card ${overdue ? "border-destructive/50" : ""}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant={STATUS_VARIANTS[l.status] || "secondary"} className="text-xs capitalize">
                                {l.status.replace(/_/g, " ")}
                              </Badge>
                              {overdue && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                            </div>
                          </div>
                          <div>
                            <p className="text-sm font-medium">{l.lender_name || "—"}</p>
                            <p className="text-xs text-muted-foreground">{toAcc?.name || "?"} · {new Date(l.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-mono font-semibold">৳{Number(l.amount_bdt).toLocaleString()}</p>
                              {remaining > 0 && remaining < Number(l.amount_bdt) && (
                                <p className="text-xs text-muted-foreground">Outstanding: ৳{remaining.toLocaleString()}</p>
                              )}
                            </div>
                            {l.status !== "fully_returned" && (
                              <Button size="sm" variant="outline" onClick={() => openLoanReturnDialog(l)}>
                                <RotateCcw className="mr-1 h-3.5 w-3.5" /> Repay
                              </Button>
                            )}
                          </div>
                          {l.expected_return_date && (
                            <p className={`text-xs ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                              {overdue ? "Overdue" : "Due"}: {new Date(l.expected_return_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Lender</TableHead>
                          <TableHead>To Account</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Repaid</TableHead>
                          <TableHead className="text-right">Outstanding</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loans.slice((loanPage - 1) * loanPageSize, loanPage * loanPageSize).map(l => {
                          const remaining = Number(l.amount_bdt) - Number(l.returned_bdt);
                          const overdue = isOverdue(l);
                          const toAcc = accounts.find(a => a.id === l.to_account_id);
                          return (
                            <TableRow key={l.id} className={overdue ? "bg-destructive/5" : ""}>
                              <TableCell className="font-mono text-sm">{new Date(l.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</TableCell>
                              <TableCell className="font-medium">{l.lender_name || "—"}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{toAcc?.name || "?"}</TableCell>
                              <TableCell className="text-right font-mono font-semibold">৳{Number(l.amount_bdt).toLocaleString()}</TableCell>
                              <TableCell className="text-right font-mono text-success">৳{Number(l.returned_bdt).toLocaleString()}</TableCell>
                              <TableCell className={`text-right font-mono font-semibold ${remaining > 0 ? "text-destructive" : "text-success"}`}>
                                ৳{remaining.toLocaleString()}
                              </TableCell>
                              <TableCell className={`text-sm ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                                {l.expected_return_date ? (
                                  <span className="flex items-center gap-1">
                                    {overdue && <AlertTriangle className="h-3 w-3" />}
                                    {new Date(l.expected_return_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                  </span>
                                ) : "—"}
                              </TableCell>
                              <TableCell>
                                <Badge variant={STATUS_VARIANTS[l.status] || "secondary"} className="text-xs capitalize">
                                  {l.status.replace(/_/g, " ")}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {l.status !== "fully_returned" && (
                                  <Button size="sm" variant="outline" onClick={() => openLoanReturnDialog(l)}>
                                    <RotateCcw className="mr-1 h-3.5 w-3.5" /> Repay
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <TablePagination
                    totalItems={loans.length}
                    pageSize={loanPageSize}
                    currentPage={loanPage}
                    onPageChange={setLoanPage}
                    onPageSizeChange={setLoanPageSize}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : recentActivity.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No activity yet</p>
              ) : (
                <>
                  <div className="space-y-3">
                    {recentActivity.slice((actPage - 1) * actPageSize, actPage * actPageSize).map(a => (
                      <div key={a.id} className="flex items-center justify-between rounded-lg border p-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {activityIcon(a.type)}
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{a.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(a.date).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                              {a.account_name && ` · ${a.account_name}`}
                            </p>
                          </div>
                        </div>
                        <span className={`font-mono text-sm font-semibold flex-shrink-0 ml-2 ${a.type === "in" ? "text-success" : a.type === "out" ? "text-destructive" : "text-primary"}`}>
                          {a.type === "in" ? "+" : a.type === "out" ? "-" : ""}৳{a.amount_bdt.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                  <TablePagination
                    totalItems={recentActivity.length}
                    pageSize={actPageSize}
                    currentPage={actPage}
                    onPageChange={setActPage}
                    onPageSizeChange={setActPageSize}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transfers">
          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : transfers.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No transfers yet</p>
              ) : (
                <>
                  {/* Mobile card view */}
                  <div className="flex flex-col gap-3 md:hidden">
                    {transfers.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(t => {
                      const from = accounts.find(a => a.id === t.from_account_id);
                      const to = accounts.find(a => a.id === t.to_account_id);
                      return (
                        <div key={t.id} className="rounded-xl border p-4 space-y-2 bg-card">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{from?.name || "?"} → {to?.name || "?"}</span>
                            <span className="font-mono font-semibold">৳{Number(t.amount_bdt).toLocaleString()}</span>
                          </div>
                          {Number(t.fee_bdt) > 0 && (
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Fee{t.fee_percent ? ` (${t.fee_percent}%)` : ""}</span>
                              <span className="font-mono text-destructive">৳{Number(t.fee_bdt).toLocaleString()}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span className="font-mono">{new Date(t.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                            {t.note && <span className="truncate ml-2 max-w-[150px]">{t.note}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>From → To</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Fee</TableHead>
                          <TableHead>Note</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transfers.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(t => {
                          const from = accounts.find(a => a.id === t.from_account_id);
                          const to = accounts.find(a => a.id === t.to_account_id);
                          const fee = Number(t.fee_bdt) || 0;
                          return (
                            <TableRow key={t.id}>
                              <TableCell className="font-mono text-sm">{new Date(t.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</TableCell>
                              <TableCell className="text-sm">{from?.name || "?"} → {to?.name || "?"}</TableCell>
                              <TableCell className="text-right font-mono font-semibold">৳{Number(t.amount_bdt).toLocaleString()}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{fee > 0 ? <span className="text-destructive">৳{fee.toLocaleString()}{t.fee_percent ? ` (${t.fee_percent}%)` : ""}</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                              <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{t.note || "—"}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <TablePagination
                    totalItems={transfers.length}
                    pageSize={pageSize}
                    currentPage={currentPage}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={setPageSize}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Record Return Dialog (Withdrawals) */}
      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Return</DialogTitle></DialogHeader>
          {returnWithdrawal && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted p-3 space-y-1">
                <p className="text-sm font-medium">{returnWithdrawal.borrower_name} — {CATEGORY_LABELS[returnWithdrawal.category] || returnWithdrawal.category}</p>
                <p className="text-xs text-muted-foreground">
                  Total: ৳{Number(returnWithdrawal.amount_bdt).toLocaleString()} · Returned: ৳{Number(returnWithdrawal.returned_bdt).toLocaleString()} · 
                  <span className="text-destructive font-medium"> Outstanding: ৳{(Number(returnWithdrawal.amount_bdt) - Number(returnWithdrawal.returned_bdt)).toLocaleString()}</span>
                </p>
              </div>
              <div>
                <Label>Return Amount (BDT)</Label>
                <Input
                  type="number"
                  placeholder={`Max ৳${(Number(returnWithdrawal.amount_bdt) - Number(returnWithdrawal.returned_bdt)).toLocaleString()}`}
                  value={retAmount}
                  onChange={e => setRetAmount(e.target.value)}
                />
              </div>
              <div>
                <Label>Return To Account</Label>
                <Select value={retToAccId} onValueChange={setRetToAccId}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    {activeAccounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} (৳{Number(a.current_balance_bdt).toLocaleString()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={retDate} onChange={e => setRetDate(e.target.value)} />
              </div>
              <div>
                <Label>Note (optional)</Label>
                <Textarea value={retNote} onChange={e => setRetNote(e.target.value)} placeholder="e.g. Partial return" />
              </div>
              <Button className="w-full" onClick={handleRecordReturn} disabled={retSubmitting}>
                {retSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Record Return
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Loan Repayment Dialog */}
      <Dialog open={loanReturnOpen} onOpenChange={setLoanReturnOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Loan Repayment</DialogTitle></DialogHeader>
          {returnLoan && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted p-3 space-y-1">
                <p className="text-sm font-medium">Lender: {returnLoan.lender_name}</p>
                <p className="text-xs text-muted-foreground">
                  Total: ৳{Number(returnLoan.amount_bdt).toLocaleString()} · Repaid: ৳{Number(returnLoan.returned_bdt).toLocaleString()} · 
                  <span className="text-destructive font-medium"> Outstanding: ৳{(Number(returnLoan.amount_bdt) - Number(returnLoan.returned_bdt)).toLocaleString()}</span>
                </p>
              </div>
              <div>
                <Label>Repayment Amount (BDT)</Label>
                <Input
                  type="number"
                  placeholder={`Max ৳${(Number(returnLoan.amount_bdt) - Number(returnLoan.returned_bdt)).toLocaleString()}`}
                  value={loanRetAmount}
                  onChange={e => setLoanRetAmount(e.target.value)}
                />
              </div>
              <div>
                <Label>Pay From Account</Label>
                <Select value={loanRetFromAccId} onValueChange={setLoanRetFromAccId}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    {activeAccounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} (৳{Number(a.current_balance_bdt).toLocaleString()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={loanRetDate} onChange={e => setLoanRetDate(e.target.value)} />
              </div>
              <div>
                <Label>Note (optional)</Label>
                <Textarea value={loanRetNote} onChange={e => setLoanRetNote(e.target.value)} placeholder="e.g. Monthly installment" />
              </div>
              <Button className="w-full" onClick={handleRecordLoanReturn} disabled={loanRetSubmitting}>
                {loanRetSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Record Repayment
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
