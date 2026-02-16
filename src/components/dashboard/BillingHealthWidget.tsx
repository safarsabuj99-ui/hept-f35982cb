import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCheck, Bell } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { differenceInDays } from "date-fns";

interface BillingAccount {
  id: string;
  ad_account_id: string;
  platform_name: string;
  billing_type: string;
  threshold_limit: number;
  current_threshold_spend: number;
  next_billing_date: string | null;
  card_last_4: string | null;
  client_id: string;
}

interface BillingNotification {
  id: string;
  ad_account_id: string;
  is_read: boolean;
}

export function BillingHealthWidget() {
  const [accounts, setAccounts] = useState<BillingAccount[]>([]);
  const [notifications, setNotifications] = useState<BillingNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchData = async () => {
    const [{ data: accs }, { data: notifs }] = await Promise.all([
      supabase
        .from("ad_accounts" as any)
        .select("id, ad_account_id, platform_name, billing_type, threshold_limit, current_threshold_spend, next_billing_date, card_last_4, client_id")
        .eq("is_active", true)
        .eq("billing_type", "threshold_postpaid") as any,
      supabase
        .from("billing_notifications" as any)
        .select("id, ad_account_id, is_read")
        .eq("is_read", false) as any,
    ]);
    setAccounts(accs ?? []);
    setNotifications(notifs ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const markAllRead = async () => {
    const unreadIds = notifications.map((n) => n.id);
    if (unreadIds.length === 0) return;
    await (supabase.from("billing_notifications" as any) as any)
      .update({ is_read: true })
      .in("id", unreadIds);
    toast({ title: "Done", description: "All billing alerts marked as read" });
    fetchData();
  };

  if (loading) {
    return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground text-sm">
        <CheckCheck className="h-6 w-6" />
        <p>No threshold billing accounts</p>
      </div>
    );
  }

  const unreadCount = notifications.length;

  // Sort by urgency: highest usage % first, then closest billing date
  const sorted = [...accounts].sort((a, b) => {
    const usageA = a.threshold_limit > 0 ? (a.current_threshold_spend / a.threshold_limit) * 100 : 0;
    const usageB = b.threshold_limit > 0 ? (b.current_threshold_spend / b.threshold_limit) * 100 : 0;
    if (usageB !== usageA) return usageB - usageA;
    const daysA = a.next_billing_date ? differenceInDays(new Date(a.next_billing_date), new Date()) : 999;
    const daysB = b.next_billing_date ? differenceInDays(new Date(b.next_billing_date), new Date()) : 999;
    return daysA - daysB;
  });

  const getColor = (pct: number) => {
    if (pct >= 80) return "bg-destructive";
    if (pct >= 60) return "bg-yellow-500";
    return "bg-emerald-500";
  };

  return (
    <div className="space-y-3">
      {unreadCount > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Bell className="h-4 w-4 text-destructive" />
            <span className="font-medium">{unreadCount} unread alert{unreadCount > 1 ? "s" : ""}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={markAllRead} className="h-7 text-xs">
            <CheckCheck className="mr-1 h-3 w-3" /> Mark all read
          </Button>
        </div>
      )}

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {sorted.map((acc) => {
          const usagePct = acc.threshold_limit > 0
            ? Math.round((acc.current_threshold_spend / acc.threshold_limit) * 100)
            : 0;
          const daysUntilBill = acc.next_billing_date
            ? differenceInDays(new Date(acc.next_billing_date), new Date())
            : null;
          const accNotifs = notifications.filter((n) => n.ad_account_id === acc.id).length;

          return (
            <div key={acc.id} className="rounded-lg border border-border/50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="capitalize text-xs">{acc.platform_name}</Badge>
                  <span className="text-sm font-mono">{acc.ad_account_id}</span>
                  {accNotifs > 0 && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{accNotifs}</Badge>
                  )}
                </div>
                {daysUntilBill !== null && daysUntilBill <= 2 && (
                  <Badge variant={daysUntilBill === 0 ? "destructive" : "outline"} className="text-xs">
                    Due {daysUntilBill === 0 ? "today" : daysUntilBill === 1 ? "tomorrow" : `in ${daysUntilBill}d`}
                  </Badge>
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{usagePct}% Used</span>
                  <span className="font-mono">${acc.current_threshold_spend}/${acc.threshold_limit}</span>
                </div>
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full transition-all ${getColor(usagePct)}`}
                    style={{ width: `${Math.min(usagePct, 100)}%` }}
                  />
                </div>
              </div>
              {acc.card_last_4 && (
                <p className="text-[11px] text-muted-foreground">Card: •••• {acc.card_last_4}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
