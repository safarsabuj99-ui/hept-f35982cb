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

const TYPE_STYLES: Record<string, {
  bg: string;
  border: string;
  text: string;
  icon: any;
  accent: string;
  iconBg: string;
  shadow: string;
}> = {
  info: {
    bg: "bg-blue-500/20",
    border: "border-blue-500/50",
    text: "text-blue-700 dark:text-blue-300",
    icon: Info,
    accent: "bg-blue-500",
    iconBg: "bg-blue-500/20 ring-1 ring-blue-500/30",
    shadow: "shadow-lg shadow-blue-500/10",
  },
  warning: {
    bg: "bg-amber-500/20",
    border: "border-amber-500/50",
    text: "text-amber-700 dark:text-amber-300",
    icon: AlertTriangle,
    accent: "bg-amber-500",
    iconBg: "bg-amber-500/20 ring-1 ring-amber-500/30",
    shadow: "shadow-lg shadow-amber-500/10",
  },
  urgent: {
    bg: "bg-destructive/15",
    border: "border-destructive/50",
    text: "text-destructive dark:text-red-300",
    icon: Megaphone,
    accent: "bg-destructive",
    iconBg: "bg-destructive/20 ring-1 ring-destructive/30",
    shadow: "shadow-lg shadow-destructive/15",
  },
};

export function ClientNoticeBanner({ clientId, balance }: Props) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [clientAccountIds, setClientAccountIds] = useState<string[]>([]);

  useEffect(() => {
    if (!clientId) return;

    const fetchNotices = async () => {
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
    <div className="space-y-3 scroll-mt-4">
      {visibleNotices.map((n, idx) => {
        const style = TYPE_STYLES[n.type] || TYPE_STYLES.info;
        const Icon = style.icon;
        const isUrgent = n.type === "urgent";
        return (
          <div
            key={n.id}
            className={cn(
              "relative flex items-start gap-3 rounded-xl border p-4 md:p-5 overflow-hidden animate-slide-up-fade",
              style.bg, style.border, style.shadow,
              isUrgent && "ring-2 ring-destructive/40 animate-attention-glow"
            )}
            style={{ animationDelay: `${idx * 100}ms` }}
          >
            {/* Left accent stripe */}
            <div className={cn("absolute left-0 top-0 bottom-0 w-1 rounded-l-xl", style.accent)} />

            {/* Icon bubble */}
            <div className={cn("shrink-0 flex items-center justify-center h-9 w-9 rounded-full ml-1", style.iconBg)}>
              <Icon className={cn("h-5 w-5", style.text)} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className={cn("text-base font-bold leading-tight", style.text)}>{n.title}</p>
              <p className={cn("text-sm mt-1 opacity-85 leading-snug", style.text)}>{n.message}</p>
            </div>

            {/* Dismiss */}
            <button
              onClick={() => setDismissed(prev => new Set(prev).add(n.id))}
              className={cn("shrink-0 p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors", style.text)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
