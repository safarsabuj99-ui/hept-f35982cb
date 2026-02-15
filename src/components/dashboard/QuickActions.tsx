import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, CheckCircle, Minus, Loader2, DollarSign } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

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
    <div className="glass-card flex flex-wrap items-center gap-3 p-3 px-4">
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
        Approve Pending
        {pendingCount > 0 && (
          <span className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-foreground/20 text-xs font-bold">
            {pendingCount}
          </span>
        )}
      </Button>

      <div className="ml-auto flex items-center gap-2">
        <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Rate:</span>
        <Button
          size="icon"
          variant="outline"
          className="h-7 w-7"
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
          className="h-7 w-7"
          onClick={() => onRateChange(rateValue + 0.5)}
        >
          <Plus className="h-3 w-3" />
        </Button>
        <Button size="sm" variant="secondary" onClick={onSaveRate} disabled={rateSaving} className="h-7 px-3 text-xs">
          {rateSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
        </Button>
      </div>
    </div>
  );
}
