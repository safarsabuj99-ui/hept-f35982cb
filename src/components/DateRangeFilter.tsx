import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, subDays, subWeeks } from "date-fns";

export type DatePreset = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "all_time" | "custom";

export interface DateRange {
  from: Date;
  to: Date;
}

interface DateRangeFilterProps {
  onRangeChange: (range: DateRange | null, preset: DatePreset) => void;
}

const presets: { label: string; value: DatePreset }[] = [
  { label: "All Time", value: "all_time" },
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "This Week", value: "this_week" },
  { label: "Last Week", value: "last_week" },
  { label: "This Month", value: "this_month" },
  { label: "Last Month", value: "last_month" },
  { label: "Custom", value: "custom" },
];

function getPresetRange(preset: DatePreset): DateRange | null {
  const now = new Date();
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const y = subDays(now, 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "this_week":
      return { from: startOfWeek(now, { weekStartsOn: 0 }), to: endOfDay(now) };
    case "last_week": {
      const lw = subWeeks(now, 1);
      return { from: startOfWeek(lw, { weekStartsOn: 0 }), to: endOfWeek(lw, { weekStartsOn: 0 }) };
    }
    case "this_month":
      return { from: startOfMonth(now), to: endOfDay(now) };
    case "last_month": {
      const last = subMonths(now, 1);
      return { from: startOfMonth(last), to: endOfMonth(last) };
    }
    case "all_time":
      return null;
    default:
      return null;
  }
}

export function DateRangeFilter({ onRangeChange }: DateRangeFilterProps) {
  const [activePreset, setActivePreset] = useState<DatePreset>("all_time");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();

  const handlePreset = (preset: DatePreset) => {
    setActivePreset(preset);
    if (preset !== "custom") {
      const range = getPresetRange(preset);
      onRangeChange(range, preset);
    }
  };

  const handleCustomApply = () => {
    if (customFrom && customTo) {
      onRangeChange({ from: startOfDay(customFrom), to: endOfDay(customTo) }, "custom");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.filter(p => p.value !== "custom").map(p => (
        <Button
          key={p.value}
          variant={activePreset === p.value ? "default" : "outline"}
          size="sm"
          onClick={() => handlePreset(p.value)}
        >
          {p.label}
        </Button>
      ))}

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={activePreset === "custom" ? "default" : "outline"}
            size="sm"
            onClick={() => setActivePreset("custom")}
          >
            <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
            {activePreset === "custom" && customFrom && customTo
              ? `${format(customFrom, "MMM d")} – ${format(customTo, "MMM d")}`
              : "Custom"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="end">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">From</p>
                <Calendar
                  mode="single"
                  selected={customFrom}
                  onSelect={setCustomFrom}
                  className={cn("p-2 pointer-events-auto")}
                  initialFocus
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">To</p>
                <Calendar
                  mode="single"
                  selected={customTo}
                  onSelect={setCustomTo}
                  className={cn("p-2 pointer-events-auto")}
                />
              </div>
            </div>
            <Button size="sm" className="w-full" onClick={handleCustomApply} disabled={!customFrom || !customTo}>
              Apply Range
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function toISODate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}
