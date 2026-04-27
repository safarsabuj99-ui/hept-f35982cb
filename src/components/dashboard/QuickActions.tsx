import { ClientSearchCommand } from "./ClientSearchCommand";
import { useIsMobile } from "@/hooks/use-mobile";

interface ClientItem {
  user_id: string;
  full_name: string;
  email?: string;
  business_name?: string | null;
  balance: number;
  pricing_config?: any;
  platform_balances?: Record<string, number>;
  phone?: string | null;
  mapping_keyword?: string | null;
  is_active?: boolean;
  is_paused?: boolean;
  pending_payments?: number;
}

interface QuickActionsProps {
  clients: ClientItem[];
}

export function QuickActions({ clients }: QuickActionsProps) {
  const isMobile = useIsMobile();

  // On mobile, the global search renders as a fixed bottom pill via portal —
  // we don't need a glass-card wrapper taking up space in the page flow.
  if (isMobile) {
    return <ClientSearchCommand clients={clients} mode="full" />;
  }

  return (
    <div
      className="glass-card p-3 px-4 opacity-0 animate-slide-up-fade"
      style={{ animationDelay: "300ms", animationFillMode: "forwards" }}
    >
      <ClientSearchCommand clients={clients} mode="full" />
    </div>
  );
}
