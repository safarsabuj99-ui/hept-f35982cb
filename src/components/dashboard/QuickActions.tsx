import { ClientSearchCommand } from "./ClientSearchCommand";

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
  return (
    <div
      className="glass-card p-3 px-4 opacity-0 animate-slide-up-fade"
      style={{ animationDelay: "300ms", animationFillMode: "forwards" }}
    >
      <ClientSearchCommand clients={clients} />
    </div>
  );
}
