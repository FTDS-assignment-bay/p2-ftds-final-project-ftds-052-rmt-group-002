"use client";

import * as React from "react";
import { format, subDays, startOfMonth } from "date-fns";
import type { DateRange, Matcher } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DateRangePickerProps {
  value?: DateRange;
  onChange?: (value: DateRange | undefined) => void;
  disabled?: Matcher | Matcher[];
  /** Min date in DB — used as anchor for presets */
  minDate?: Date;
  /** Max date in DB — used as anchor for presets */
  maxDate?: Date;
  /** Previous period label shown below presets */
  prevFrom?: Date;
  prevTo?: Date;
}

type Preset = "7d" | "30d" | "mtd" | "ytd";

export function DateRangePicker({
  value,
  onChange,
  disabled,
  minDate,
  maxDate,
  prevFrom,
  prevTo,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [internalDateRange, setInternalDateRange] = React.useState<DateRange | undefined>(() => {
    const to = new Date();
    const from = subDays(to, 29);
    return { from, to };
  });

  const dateRange = value ?? internalDateRange;
  const anchor = maxDate ?? new Date();

  const handleDateChange = (nextValue: DateRange | undefined) => {
    if (!value) setInternalDateRange(nextValue);
    onChange?.(nextValue);
  };

  function applyPreset(preset: Preset) {
    let next: DateRange;
    switch (preset) {
      case "7d":
        next = { from: subDays(anchor, 6), to: anchor };
        break;
      case "30d":
        next = { from: subDays(anchor, 29), to: anchor };
        break;
      case "mtd":
        next = { from: startOfMonth(anchor), to: anchor };
        break;
      case "ytd":
        next = { from: new Date(anchor.getFullYear(), 0, 1), to: anchor };
        break;
    }
    handleDateChange(next);
    setOpen(false);
  }

  const triggerLabel = dateRange?.from
    ? dateRange.to
      ? `${format(dateRange.from, "d MMM yyyy")} - ${format(dateRange.to, "d MMM yyyy")}`
      : format(dateRange.from, "d MMM yyyy")
    : "Select date";

  return (
    <div className="flex flex-col items-end gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" id="date" className="font-normal">
            {triggerLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="end">
          {/* Preset buttons */}
          <div className="flex gap-1 border-b px-3 py-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => applyPreset("7d")}>7d</Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => applyPreset("30d")}>30d</Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => applyPreset("mtd")}>MTD</Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => applyPreset("ytd")}>YTD</Button>
          </div>
          <Calendar
            mode="range"
            defaultMonth={dateRange?.from}
            selected={dateRange}
            onSelect={handleDateChange}
            numberOfMonths={2}
            disabled={disabled}
          />
        </PopoverContent>
      </Popover>

      {/* Previous period label */}
      {prevFrom && prevTo && (
        <span className="text-xs text-muted-foreground">
          vs {format(prevFrom, "d MMM yyyy")} – {format(prevTo, "d MMM yyyy")}
        </span>
      )}
    </div>
  );
}
