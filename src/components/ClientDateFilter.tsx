import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  format, startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, subDays, subWeeks, subMonths
} from "date-fns";
import type { DateRange as RDPDateRange } from "react-day-picker";

export type ClientDatePreset = "all_time" | "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "custom";

export interface ClientDateRange {
  from: Date;
  to: Date;
}

interface ClientDateFilterProps {
  onRangeChange: (range: ClientDateRange | null, preset: ClientDatePreset) => void;
  activePreset?: ClientDatePreset;
}

const presets: { label: string; value: ClientDatePreset }[] = [
  { label: "All Time", value: "all_time" },
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "This Week", value: "this_week" },
  { label: "Last Week", value: "last_week" },
  { label: "This Month", value: "this_month" },
  { label: "Last Month", value: "last_month" },
  { label: "Custom", value: "custom" },
];

/** Returns a Date parsed from today's UTC date string so local formatting matches DB dates */
function utcToday(): Date {
  return new Date(new Date().toISOString().split("T")[0] + "T00:00:00");
}

function getPresetRange(preset: ClientDatePreset): ClientDateRange | null {
  const now = utcToday();
  switch (preset) {
    case "today":
      return { from: now, to: now };
    case "yesterday": {
      const y = subDays(now, 1);
      return { from: y, to: y };
    }
    case "this_week":
      return { from: startOfWeek(now, { weekStartsOn: 5 }), to: now };
    case "last_week": {
      const lw = subWeeks(now, 1);
      return { from: startOfWeek(lw, { weekStartsOn: 5 }), to: endOfWeek(lw, { weekStartsOn: 5 }) };
    }
    case "this_month":
      return { from: startOfMonth(now), to: now };
    case "last_month": {
      const lm = subMonths(now, 1);
      return { from: startOfMonth(lm), to: endOfMonth(lm) };
    }
    case "all_time":
      return null;
    default:
      return null;
  }
}

export function ClientDateFilter({ onRangeChange, activePreset: controlledPreset }: ClientDateFilterProps) {
  const [internalPreset, setInternalPreset] = useState<ClientDatePreset>("today");
  const activePreset = controlledPreset ?? internalPreset;
  const [customRange, setCustomRange] = useState<RDPDateRange | undefined>();

  // Parent initializes with today's range, no mount-time call needed

  const handlePreset = (preset: ClientDatePreset) => {
    setInternalPreset(preset);
    if (preset !== "custom") {
      setCustomRange(undefined);
      onRangeChange(getPresetRange(preset), preset);
    }
  };

  const handleRangeSelect = (range: RDPDateRange | undefined) => {
    setCustomRange(range);
    if (range?.from && range?.to) {
      setInternalPreset("custom");
      onRangeChange({ from: startOfDay(range.from), to: endOfDay(range.to) }, "custom");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {presets.filter(p => p.value !== "custom").map(p => (
        <Button
          key={p.value}
          variant={activePreset === p.value ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs"
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
            className="h-8 text-xs"
            onClick={() => setInternalPreset("custom")}
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
