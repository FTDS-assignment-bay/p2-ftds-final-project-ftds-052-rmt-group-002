"use client";

import { useEffect, useState } from "react";
import { subDays, format } from "date-fns";
import { type DateRange } from "react-day-picker";
import { DateRangePicker } from "@/components/date-range-picker";
import {
  fetchDateRange,
  fetchKpi,
  fetchRevenueTrend,
  fetchCategoryGender,
  fetchCityRevenue,
  fetchAgeRevenue,
  type KpiData,
  type RevenueTrendData,
  type CategoryGenderData,
  type CityRevenueData,
  type AgeRevenueData,
} from "@/lib/api";

import { RevenueKpiCards } from "./_components/revenue-kpi-cards";
import { RevenueTrendChart } from "./_components/revenue-trend-chart";
import { RevenueCategoriesGender } from "./_components/revenue-categories-gender";
import { CustomerDistributionMap } from "./_components/revenue-distribution-map";
import { AgeRevenueCard } from "./_components/revenue-by-age";
import { AiSummaryDialog } from "./_components/ai-summary-dialog";

function parseDate(s: string): Date {
  return new Date(s + "T00:00:00");
}

function toIsoString(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export default function Page() {
  const [minDate, setMinDate] = useState<Date | null>(null);
  const [maxDate, setMaxDate] = useState<Date | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | null>(null);

  // ── Lifted state for AI Summary context ───────────────────────────────────
  const [kpiData, setKpiData] = useState<KpiData | null>(null);
  const [revenueTrend, setRevenueTrend] = useState<RevenueTrendData | null>(null);
  const [categoryGender, setCategoryGender] = useState<CategoryGenderData | null>(null);
  const [cityRevenue, setCityRevenue] = useState<CityRevenueData | null>(null);
  const [ageRevenue, setAgeRevenue] = useState<AgeRevenueData | null>(null);

  // Fetch date range on mount
  useEffect(() => {
    fetchDateRange()
      .then((r) => {
        const min = parseDate(r.min_date);
        const max = parseDate(r.max_date);
        setMinDate(min);
        setMaxDate(max);
        setDateRange({ from: subDays(max, 29), to: max });
      })
      .catch(() => {
        const fallback = new Date();
        fallback.setHours(0, 0, 0, 0);
        setMinDate(null);
        setMaxDate(fallback);
        setDateRange({ from: subDays(fallback, 29), to: fallback });
      });
  }, []);

  // Fetch all dashboard data at page level so AiSummaryDialog has full context
  useEffect(() => {
    if (!dateRange?.from || !dateRange?.to) return;

    const from = toIsoString(dateRange.from);
    const to = toIsoString(dateRange.to);

    fetchKpi(from, to)
      .then(setKpiData)
      .catch(() => setKpiData(null));

    fetchRevenueTrend(from, to)
      .then(setRevenueTrend)
      .catch(() => setRevenueTrend(null));

    fetchCategoryGender(undefined, from, to)
      .then(setCategoryGender)
      .catch(() => setCategoryGender(null));

    fetchCityRevenue(undefined, from, to)
      .then(setCityRevenue)
      .catch(() => setCityRevenue(null));

    fetchAgeRevenue(undefined, from, to)
      .then(setAgeRevenue)
      .catch(() => setAgeRevenue(null));
  }, [dateRange]);

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      {/* ── Header + Date Picker + AI Summary ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl tracking-tight">Executive Summary</h1>
          <p className="text-muted-foreground text-sm">
            {maxDate ? format(maxDate, "EEEE, dd MMMM yyyy") : "—"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dateRange && maxDate && (
            <DateRangePicker
              value={dateRange}
              onChange={(value) => setDateRange(value ?? null)}
              minDate={minDate ?? undefined}
              maxDate={maxDate ?? undefined}
            />
          )}
          {dateRange && (
            <AiSummaryDialog
              dateRange={dateRange}
              kpiData={kpiData}
              revenueTrend={revenueTrend}
              categoryGender={categoryGender}
              cityRevenue={cityRevenue}
              ageRevenue={ageRevenue}
            />
          )}
        </div>
      </div>

      {/* ── KPI Cards ── */}
      {dateRange && <RevenueKpiCards dateRange={dateRange} />}

      {/* ── Trend + Category ── */}
      <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:shadow-xs sm:grid-cols-2 xl:grid-cols-5">
        {dateRange && <RevenueTrendChart dateRange={dateRange} />}
        {dateRange && <RevenueCategoriesGender dateRange={dateRange} />}
      </div>

      {/* ── Map + Age ── */}
      <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:shadow-xs sm:grid-cols-2 xl:grid-cols-5">
        {dateRange && <CustomerDistributionMap dateRange={dateRange} />}
        {dateRange && <AgeRevenueCard dateRange={dateRange} />}
      </div>
    </div>
  );
}
