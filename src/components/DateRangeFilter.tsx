import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, subDays, subWeeks } from "date-fns";
import type { DateRange as RDPDateRange } from "react-day-picker";

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
      return { from: startOfWeek(now, { weekStartsOn: 5 }), to: endOfDay(now) };
    case "last_week": {
      const lw = subWeeks(now, 1);
      return { from: startOfWeek(lw, { weekStartsOn: 5 }), to: endOfWeek(lw, { weekStartsOn: 5 }) };
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
  const [activePreset, setActivePreset] = useState<DatePreset>("today");
  const [customRange, setCustomRange] = useState<RDPDateRange | undefined>();

  // Parent initializes with today's range, no mount-time call needed

  const handlePreset = (preset: DatePreset) => {
    setActivePreset(preset);
    if (preset !== "custom") {
      setCustomRange(undefined);
      const range = getPresetRange(preset);
      onRangeChange(range, preset);
    }
  };

  const handleRangeSelect = (range: RDPDateRange | undefined) => {
    setCustomRange(range);
    if (range?.from && range?.to) {
      setActivePreset("custom");
      onRangeChange({ from: startOfDay(range.from), to: endOfDay(range.to) }, "custom");
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
            {activePreset === "custom" && customRange?.from && customRange?.to
              ? `${format(customRange.from, "MMM d")} – ${format(customRange.to, "MMM d")}`
              : "Custom"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="end">
          <Calendar
            mode="range"
            selected={customRange}
            onSelect={handleRangeSelect}
            numberOfMonths={1}
            className={cn("p-3 pointer-events-auto")}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function toISODate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}
