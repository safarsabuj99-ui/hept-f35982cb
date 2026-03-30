import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Info, Megaphone, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Notice {
  id: string;
  title: string;
  message: string;
  type: string;
  target_type: string;
  target_ids: string[];
}

interface Props {
  clientId: string;
  balance: number;
}

const TYPE_STYLES: Record<string, { bg: string; border: string; text: string; icon: any }> = {
  info: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-700 dark:text-blue-300", icon: Info },
  warning: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-700 dark:text-amber-300", icon: AlertTriangle },
  urgent: { bg: "bg-destructive/10", border: "border-destructive/30", text: "text-destructive", icon: Megaphone },
};

export function ClientNoticeBanner({ clientId, balance }: Props) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [clientAccountIds, setClientAccountIds] = useState<string[]>([]);

  useEffect(() => {
    if (!clientId) return;

    const fetchNotices = async () => {
      // Fetch active notices (RLS filters by is_active + time window)
      const { data } = await supabase
        .from("client_notices")
        .select("id, title, message, type, target_type, target_ids");
      setNotices((data as any[]) ?? []);
    };

    const fetchAccounts = async () => {
      const { data } = await supabase
        .from("ad_account_clients")
        .select("ad_account_id")
        .eq("client_id", clientId);
      setClientAccountIds((data ?? []).map((a: any) => a.ad_account_id));
    };

    fetchNotices();
    fetchAccounts();
  }, [clientId]);

  const visibleNotices = notices.filter((n) => {
    if (dismissed.has(n.id)) return false;
    if (n.target_type === "all") return true;
    if (n.target_type === "negative_balance") return balance < 0;
    if (n.target_type === "specific_clients") return (n.target_ids ?? []).includes(clientId);
    if (n.target_type === "ad_account") return (n.target_ids ?? []).some(id => clientAccountIds.includes(id));
    return false;
  });

  if (visibleNotices.length === 0) return null;

  return (
    <div className="space-y-2">
      {visibleNotices.map((n) => {
        const style = TYPE_STYLES[n.type] || TYPE_STYLES.info;
        const Icon = style.icon;
        return (
          <div
            key={n.id}
            className={cn(
              "relative flex items-start gap-3 rounded-xl border p-3 md:p-4",
              style.bg, style.border,
              n.type === "urgent" && "animate-pulse-subtle"
            )}
          >
            <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", style.text)} />
            <div className="flex-1 min-w-0">
              <p className={cn("text-sm font-semibold", style.text)}>{n.title}</p>
              <p className={cn("text-xs mt-0.5 opacity-80", style.text)}>{n.message}</p>
            </div>
            <button
              onClick={() => setDismissed(prev => new Set(prev).add(n.id))}
              className={cn("shrink-0 p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors", style.text)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
