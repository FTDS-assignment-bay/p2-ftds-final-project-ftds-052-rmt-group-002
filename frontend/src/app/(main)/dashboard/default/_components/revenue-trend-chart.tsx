"use client";

import { useEffect, useState } from "react";
import { format, parseISO, subDays } from "date-fns";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { fetchDateRange, fetchRevenueTrend, type RevenueTrendData } from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtRevenue(v: number) {
  if (v >= 1_000) return `₺ ${(v / 1_000).toFixed(1)}K`;
  return `₺ ${v.toLocaleString()}`;
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function fmtTick(dateStr: string, granularity: "day" | "week"): string {
  const d = parseISO(dateStr);
  return granularity === "week"
    ? format(d, "'W'w MMM")
    : format(d, "dd MMM");
}

function fmtLabel(dateStr: string, granularity: "day" | "week"): string {
  const d = parseISO(dateStr);
  return granularity === "week"
    ? format(d, "'Week of' dd MMMM yyyy")
    : format(d, "dd MMMM yyyy");
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-64 w-full items-center justify-center rounded-lg border border-dashed">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// ── Chart Config ──────────────────────────────────────────────────────────────
const trendConfig = {
  revenue: { label: "Revenue", color: "var(--chart-1)" },
  orders: { label: "Orders", color: "var(--chart-2)" },
} satisfies ChartConfig;

// ── Types ─────────────────────────────────────────────────────────────────────
type TimeRange = "7d" | "30d" | "90d";

const TIME_RANGE_DAYS: Record<TimeRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 3 months",
};

// ── Component ─────────────────────────────────────────────────────────────────
export function RevenueTrendChart() {
  // --- state ---
  const [maxDate, setMaxDate] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("90d");
  const [trendData, setTrendData] = useState<RevenueTrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateError, setDateError] = useState<string | null>(null);
  const [trendError, setTrendError] = useState<string | null>(null);

  // --- effects ---
  // Effect 1: fetch max date once on mount
  useEffect(() => {
    const controller = new AbortController();

    fetchDateRange(controller.signal)
      .then((r) => setMaxDate(r.max_date))
      .catch(() => {
        setMaxDate(isoDate(new Date()));
        setDateError("Gagal memuat rentang tanggal, menampilkan data hari ini sebagai fallback.");
      });

    return () => controller.abort();
  }, []);

  // Effect 2: fetch trend whenever maxDate or timeRange changes
  useEffect(() => {
    if (!maxDate) return;

    const controller = new AbortController();
    const end = maxDate;
    const days = TIME_RANGE_DAYS[timeRange];
    const start = isoDate(subDays(parseISO(maxDate), days - 1));

    setLoading(true);
    setTrendError(null);

    fetchRevenueTrend(start, end, controller.signal)
      .then(setTrendData)
      .catch((e: Error) => {
        if (e.name !== "AbortError") setTrendError(e.message);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [maxDate, timeRange]);

  // --- derived values ---
  const granularity = trendData?.granularity ?? "day";
  const peakDay = trendData?.trend.reduce((a, b) => (b.revenue > a.revenue ? b : a));

  // --- render ---
  return (
    <Card className="col-span-1 xl:col-span-3">
      <CardHeader>
        <CardTitle>Revenue Trend</CardTitle>
        <CardDescription>
          {loading || !peakDay ? (
            "Loading..."
          ) : (
            <>
              Peak:{" "}
              <span className="font-medium text-foreground">{fmtLabel(peakDay.month, granularity)}</span>{" "}
              with revenue at{" "}
              <span className="font-medium text-foreground">{fmtRevenue(peakDay.revenue)}</span>
            </>
          )}
        </CardDescription>

        <CardAction>
          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={(v) => v && setTimeRange(v as TimeRange)}
            variant="outline"
            className="@[767px]/card:flex hidden *:data-[slot=toggle-group-item]:px-4!"
          >
            {Object.entries(TIME_RANGE_LABELS).map(([value, label]) => (
              <ToggleGroupItem key={value} value={value}>{label}</ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <SelectTrigger
              className="@[767px]/card:hidden flex w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate"
              size="sm"
              aria-label="Select time range"
            >
              <SelectValue placeholder="Last 3 months" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectGroup>
                {Object.entries(TIME_RANGE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value} className="rounded-lg">{label}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>

      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {dateError && <p className="mb-2 text-sm text-destructive">{dateError}</p>}
        {trendError && <p className="mb-2 text-sm text-destructive">{trendError}</p>}
        {loading ? (
          <div className="h-62 w-full animate-pulse rounded-lg bg-muted" />
        ) : !trendData?.trend.length ? (
          <EmptyState message="Tidak ada data revenue untuk periode ini." />
        ) : (
          <ChartContainer config={trendConfig} className="aspect-auto h-62 w-full">
            <AreaChart data={trendData.trend} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                className="text-xs"
                tickFormatter={(v) => fmtTick(v, granularity)}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                className="text-xs"
                tickFormatter={fmtRevenue}
                width={72}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(v) => fmtLabel(v, granularity)}
                    formatter={(value, name) => [
                      name === "revenue"
                        ? fmtRevenue(Number(value))
                        : `${Number(value).toLocaleString()} orders`,
                      name === "revenue" ? " Revenue" : "Orders",
                    ]}
                    indicator="dot"
                  />
                }
              />
              <Area
                dataKey="revenue"
                type="natural"
                stroke="var(--color-revenue)"
                strokeWidth={2}
                fill="url(#gradRev)"
                dot={{ fill: "var(--color-revenue)", r: 3 }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
