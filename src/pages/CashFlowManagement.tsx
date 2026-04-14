import { useEffect, useState, useCallback } from "react";
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
import { Plus, ArrowLeftRight, Loader2, Banknote, Building2, Smartphone, Wallet, Trash2, ArrowDown, ArrowUp, MoveHorizontal, PiggyBank, HandCoins, RotateCcw, AlertTriangle, Landmark } from "lucide-react";
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
}

interface FundTransfer {
  id: string;
  from_account_id: string;
  to_account_id: string;
  amount_bdt: number;
  note: string | null;
  created_by: string;
  created_at: string;
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
      org_id: profile?.org_id || null,
    } as any);
    setSubmitting(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Account created" });
      setAccName(""); setAccNumber(""); setAccBalance("");
      setAddOpen(false);
      fetchData();
    }
  };

  const handleTransfer = async () => {
    const amt = Number(transferAmount);
    if (!fromAccId || !toAccId || fromAccId === toAccId || amt <= 0) {
      toast({ title: "Error", description: "Select different accounts and a valid amount", variant: "destructive" });
      return;
    }
    const { data: freshFrom } = await supabase.from("agency_accounts").select("current_balance_bdt, name").eq("id", fromAccId).single();
    if (freshFrom && Number((freshFrom as any).current_balance_bdt) < amt) {
      toast({ title: "Insufficient Balance", description: `${(freshFrom as any).name} has only ৳${Number((freshFrom as any).current_balance_bdt).toLocaleString()}`, variant: "destructive" });
      return;
    }

    setTransferring(true);

    const debitOk = await adjustAccountBalance(fromAccId, -amt);
    if (!debitOk) {
      setTransferring(false);
      toast({ title: "Error", description: "Failed to debit account", variant: "destructive" });
      return;
    }

    const creditOk = await adjustAccountBalance(toAccId, amt);
    if (!creditOk) {
      await adjustAccountBalance(fromAccId, amt);
      setTransferring(false);
      toast({ title: "Error", description: "Failed to credit account", variant: "destructive" });
      return;
    }

    await supabase.from("fund_transfers" as any).insert({
      from_account_id: fromAccId,
      to_account_id: toAccId,
      amount_bdt: amt,
      note: transferNote || null,
      created_by: user?.id,
      org_id: profile?.org_id || null,
    } as any);

    setTransferring(false);
    toast({ title: "Transfer Complete", description: `৳${amt.toLocaleString()} moved successfully` });
    setTransferAmount(""); setTransferNote(""); setFromAccId(""); setToAccId("");
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

    const { error: insertErr } = await supabase.from("cash_withdrawals" as any).insert({
      from_account_id: wdFromAccId,
      amount_bdt: amt,
      category: wdCategory,
      borrower_name: wdBorrower.trim(),
      expected_return_date: wdExpectedDate || null,
      note: wdNote || null,
      created_by: user?.id,
      org_id: profile?.org_id || null,
    } as any);

    if (insertErr) {
      setWdSubmitting(false);
      toast({ title: "Error", description: insertErr.message, variant: "destructive" });
      return;
    }

    await adjustAccountBalance(wdFromAccId, -amt);

    setWdSubmitting(false);
    toast({ title: "Withdrawal Recorded", description: `৳${amt.toLocaleString()} withdrawn from ${(freshAcc as any)?.name}` });
    setWdCategory("personal_loan"); setWdBorrower(""); setWdAmount("");
    setWdFromAccId(""); setWdExpectedDate(""); setWdNote("");
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
      <div className="grid grid-cols-2 sm:flex sm:flex-row justify-end gap-2">
        <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full sm:w-auto"><HandCoins className="mr-2 h-4 w-4" /> Withdraw</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Record Withdrawal / Loan</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Category</Label>
                <Select value={wdCategory} onValueChange={setWdCategory}>
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
                <Label>Borrower Name</Label>
                <Input placeholder="Who is this for?" value={wdBorrower} onChange={e => setWdBorrower(e.target.value)} />
              </div>
              <div>
                <Label>Amount (BDT)</Label>
                <Input type="number" placeholder="e.g. 50000" value={wdAmount} onChange={e => setWdAmount(e.target.value)} />
              </div>
              <div>
                <Label>From Account</Label>
                <Select value={wdFromAccId} onValueChange={setWdFromAccId}>
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
                <Label>Expected Return Date (optional)</Label>
                <Input type="date" value={wdExpectedDate} onChange={e => setWdExpectedDate(e.target.value)} />
              </div>
              <div>
                <Label>Note (optional)</Label>
                <Textarea value={wdNote} onChange={e => setWdNote(e.target.value)} placeholder="e.g. Lending to friend for 2 weeks" />
              </div>
              <Button className="w-full" onClick={handleWithdraw} disabled={wdSubmitting}>
                {wdSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Record Withdrawal
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={fundOpen} onOpenChange={setFundOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full sm:w-auto"><PiggyBank className="mr-2 h-4 w-4" /> Add Fund</Button>
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
        <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full sm:w-auto"><ArrowLeftRight className="mr-2 h-4 w-4" /> Transfer</Button>
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

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto"><Plus className="mr-2 h-4 w-4" /> Add Account</Button>
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
              <Button className="w-full" onClick={handleAddAccount} disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create Account
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Premium KPI Widget */}
      <div className="glass-card glow-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-3 divide-x divide-y divide-border/40">
          {/* Row 1: Summary KPIs */}
          {[
            {
              label: "Total Liquid Funds",
              value: totalBalance,
              icon: Wallet,
              accent: "primary",
              sub: "All accounts combined",
            },
            {
              label: "Outstanding Withdrawals",
              value: outstandingWithdrawals,
              icon: HandCoins,
              accent: "warning",
              sub: "Money owed back",
            },
            {
              label: "Loan Outstanding",
              value: outstandingLoans,
              icon: Landmark,
              accent: "destructive",
              sub: "Loan amount to repay",
            },
            {
              label: "Cash",
              value: balanceByType["Cash"] || 0,
              icon: ACCOUNT_TYPE_ICONS["Cash"],
              accent: "muted-foreground",
            },
            {
              label: "Bank",
              value: balanceByType["Bank"] || 0,
              icon: ACCOUNT_TYPE_ICONS["Bank"],
              accent: "muted-foreground",
            },
            {
              label: "MFS",
              value: balanceByType["MFS"] || 0,
              icon: ACCOUNT_TYPE_ICONS["MFS"],
              accent: "muted-foreground",
            },
          ].map((kpi, i) => {
            const Icon = kpi.icon;
            const isSummary = i < 3;
            return (
              <div
                key={kpi.label}
                className={cn(
                  "relative p-3 sm:p-4 opacity-0 animate-slide-up-fade",
                  isSummary && `border-l-2 border-l-${kpi.accent}`
                )}
                style={{ animationDelay: `${i * 80}ms`, animationFillMode: "forwards" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] sm:text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 truncate">
                      {kpi.label}
                    </p>
                    {loading ? (
                      <Skeleton className="h-6 sm:h-8 w-20 sm:w-28 mt-1" />
                    ) : (
                      <p className={cn(
                        "text-lg sm:text-2xl font-bold font-mono tracking-tight mt-0.5",
                        isSummary && kpi.accent !== "primary" && kpi.value > 0 && `text-${kpi.accent}`
                      )}>
                        ৳{kpi.value.toLocaleString()}
                      </p>
                    )}
                    {kpi.sub && !loading && (
                      <p className="text-[10px] sm:text-xs text-muted-foreground/60 mt-0.5 truncate">{kpi.sub}</p>
                    )}
                  </div>
                  <div className={cn(
                    "flex h-7 w-7 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg",
                    isSummary ? `bg-${kpi.accent}/10` : "bg-muted"
                  )}>
                    <Icon className={cn(
                      "h-3.5 w-3.5 sm:h-4 sm:w-4",
                      isSummary ? `text-${kpi.accent}` : "text-muted-foreground"
                    )} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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
                  {/* Mobile card view */}
                  <div className="flex flex-col gap-3 md:hidden">
                    {withdrawals.slice((wdPage - 1) * wdPageSize, wdPage * wdPageSize).map(w => {
                      const remaining = Number(w.amount_bdt) - Number(w.returned_bdt);
                      const overdue = isOverdue(w);
                      const fromAcc = accounts.find(a => a.id === w.from_account_id);
                      return (
                        <div key={w.id} className={`rounded-xl border p-4 space-y-3 bg-card ${overdue ? "border-destructive/50" : ""}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant={STATUS_VARIANTS[w.status] || "secondary"} className="text-xs">
                                {CATEGORY_LABELS[w.category] || w.category}
                              </Badge>
                              <Badge variant={STATUS_VARIANTS[w.status] || "secondary"} className="text-xs capitalize">
                                {w.status.replace(/_/g, " ")}
                              </Badge>
                              {overdue && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                            </div>
                          </div>
                          <div>
                            <p className="text-sm font-medium">{w.borrower_name || "—"}</p>
                            <p className="text-xs text-muted-foreground">{fromAcc?.name || "?"} · {new Date(w.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-mono font-semibold">৳{Number(w.amount_bdt).toLocaleString()}</p>
                              {remaining > 0 && remaining < Number(w.amount_bdt) && (
                                <p className="text-xs text-muted-foreground">Outstanding: ৳{remaining.toLocaleString()}</p>
                              )}
                            </div>
                            {w.status !== "fully_returned" && (
                              <Button size="sm" variant="outline" onClick={() => openReturnDialog(w)}>
                                <RotateCcw className="mr-1 h-3.5 w-3.5" /> Return
                              </Button>
                            )}
                          </div>
                          {w.expected_return_date && (
                            <p className={`text-xs ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                              {overdue ? "Overdue" : "Due"}: {new Date(w.expected_return_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
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
                          <TableHead>Category</TableHead>
                          <TableHead>Borrower</TableHead>
                          <TableHead>From</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Outstanding</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {withdrawals.slice((wdPage - 1) * wdPageSize, wdPage * wdPageSize).map(w => {
                          const remaining = Number(w.amount_bdt) - Number(w.returned_bdt);
                          const overdue = isOverdue(w);
                          const fromAcc = accounts.find(a => a.id === w.from_account_id);
                          return (
                            <TableRow key={w.id} className={overdue ? "bg-destructive/5" : ""}>
                              <TableCell className="font-mono text-sm">{new Date(w.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-xs">{CATEGORY_LABELS[w.category] || w.category}</Badge>
                              </TableCell>
                              <TableCell className="font-medium">{w.borrower_name || "—"}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{fromAcc?.name || "?"}</TableCell>
                              <TableCell className="text-right font-mono font-semibold">৳{Number(w.amount_bdt).toLocaleString()}</TableCell>
                              <TableCell className={`text-right font-mono font-semibold ${remaining > 0 ? "text-destructive" : "text-success"}`}>
                                ৳{remaining.toLocaleString()}
                              </TableCell>
                              <TableCell className={`text-sm ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                                {w.expected_return_date ? (
                                  <span className="flex items-center gap-1">
                                    {overdue && <AlertTriangle className="h-3 w-3" />}
                                    {new Date(w.expected_return_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                  </span>
                                ) : "—"}
                              </TableCell>
                              <TableCell>
                                <Badge variant={STATUS_VARIANTS[w.status] || "secondary"} className="text-xs capitalize">
                                  {w.status.replace(/_/g, " ")}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {w.status !== "fully_returned" && (
                                  <Button size="sm" variant="outline" onClick={() => openReturnDialog(w)}>
                                    <RotateCcw className="mr-1 h-3.5 w-3.5" /> Return
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
                    totalItems={withdrawals.length}
                    pageSize={wdPageSize}
                    currentPage={wdPage}
                    onPageChange={setWdPage}
                    onPageSizeChange={setWdPageSize}
                  />
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
                          <TableHead>Note</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transfers.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(t => {
                          const from = accounts.find(a => a.id === t.from_account_id);
                          const to = accounts.find(a => a.id === t.to_account_id);
                          return (
                            <TableRow key={t.id}>
                              <TableCell className="font-mono text-sm">{new Date(t.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</TableCell>
                              <TableCell className="text-sm">{from?.name || "?"} → {to?.name || "?"}</TableCell>
                              <TableCell className="text-right font-mono font-semibold">৳{Number(t.amount_bdt).toLocaleString()}</TableCell>
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
