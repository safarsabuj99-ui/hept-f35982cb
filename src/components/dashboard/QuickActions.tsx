import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, CheckCircle, Minus, Loader2, DollarSign } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface QuickActionsProps {
  pendingCount: number;
  rateValue: number;
  onRateChange: (v: number) => void;
  onSaveRate: () => void;
  rateSaving: boolean;
}

export function QuickActions({ pendingCount, rateValue, onRateChange, onSaveRate, rateSaving }: QuickActionsProps) {
  const navigate = useNavigate();

  return (
    <div className="glass-card p-3 px-4 space-y-3 sm:space-y-0 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
      {/* Action buttons row */}
      <div className="flex items-center gap-2">
        <Button size="sm" className="gap-2 flex-1 sm:flex-none" onClick={() => navigate("/admin/add-funds")}>
          <Plus className="h-3.5 w-3.5" /> Add Funds
        </Button>
        <Button
          size="sm"
          variant={pendingCount > 0 ? "default" : "outline"}
          className="gap-2 flex-1 sm:flex-none"
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

      {/* Exchange rate control */}
      <div className="flex items-center gap-2 sm:ml-auto">
        <DollarSign className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground shrink-0">Rate:</span>
        <Button
          size="icon"
          variant="outline"
          className="h-7 w-7 shrink-0"
          onClick={() => onRateChange(Math.max(1, rateValue - 0.5))}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <Input
          type="number"
          value={rateValue}
          onChange={(e) => onRateChange(Number(e.target.value))}
          className="h-7 w-16 text-center font-mono text-sm"
          step="0.5"
          min="1"
        />
        <Button
          size="icon"
          variant="outline"
          className="h-7 w-7 shrink-0"
          onClick={() => onRateChange(rateValue + 0.5)}
        >
          <Plus className="h-3 w-3" />
        </Button>
        <Button size="sm" variant="secondary" onClick={onSaveRate} disabled={rateSaving} className="h-7 px-3 text-xs shrink-0">
          {rateSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
        </Button>
      </div>
    </div>
  );
}
