import { Button } from "@/components/ui/button";
import { Plus, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface QuickActionsProps {
  pendingCount: number;
}

export function QuickActions({ pendingCount }: QuickActionsProps) {
  const navigate = useNavigate();

  return (
    <div className="glass-card p-3 px-4 flex items-center gap-2">
      <Button size="sm" className="gap-2" onClick={() => navigate("/admin/add-funds")}>
        <Plus className="h-3.5 w-3.5" /> Add Funds
      </Button>
      <Button
        size="sm"
        variant={pendingCount > 0 ? "default" : "outline"}
        className="gap-2"
        onClick={() => navigate("/admin/pending")}
      >
        <CheckCircle className="h-3.5 w-3.5" />
        <span className="hidden xs:inline">Approve</span> Pending
        {pendingCount > 0 && (
          <span className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-foreground/20 text-xs font-bold">
            {pendingCount}
          </span>
        )}
      </Button>
    </div>
  );
}
