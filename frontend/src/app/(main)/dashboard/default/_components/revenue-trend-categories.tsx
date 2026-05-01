"use client";

import { useEffect, useState } from "react";
import { format, parseISO, subDays } from "date-fns";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { fetchDateRange, fetchRevenueTrend, type RevenueTrendData } from "@/lib/api";

// ─── Helpers ──────────────────────────────────────────────────

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
    ? format(d, "'W'w MMM")   // e.g. "W13 Mar"
    : format(d, "dd MMM");    // e.g. "01 Mar"
}

function fmtLabel(dateStr: string, granularity: "day" | "week"): string {
  const d = parseISO(dateStr);
  return granularity === "week"
    ? format(d, "'Week of' dd MMMM yyyy")  // e.g. "Week of 25 March 2024"
    : format(d, "dd MMMM yyyy");           // e.g. "01 March 2024"
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-64 w-full items-center justify-center rounded-lg border border-dashed">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// ─── Chart Configs ────────────────────────────────────────────

const trendConfig = {
  revenue: { label: "Revenue", color: "var(--chart-1)" },
  orders: { label: "Orders", color: "var(--chart-2)" },
} satisfies ChartConfig;

const categoryConfig = {
  male: { label: "Male", color: "var(--chart-1)" },
  female: { label: "Female", color: "var(--chart-2)" },
  other: { label: "Other", color: "var(--chart-3)" },
} satisfies ChartConfig;

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

// ─── Main Component ───────────────────────────────────────────

export function RevenueTrendCategories() {
  const [maxDate, setMaxDate] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("90d");
  const [data, setData] = useState<RevenueTrendData | null>(null);
  const [trendLoading, setTrendLoading] = useState(true); // ← renamed dari loading
  const [dateError, setDateError] = useState<string | null>(null);
  const [trendError, setTrendError] = useState<string | null>(null);

  // Step 1: fetch max date from DB once on mount
  useEffect(() => {
    fetchDateRange()
      .then((r) => setMaxDate(r.max_date))
      .catch(() => {
        setMaxDate(isoDate(new Date()));
        setDateError("Gagal memuat rentang tanggal, menampilkan data hari ini sebagai fallback.");
      });
  }, []);

  // Step 2: fetch trend whenever maxDate or timeRange changes
  useEffect(() => {
    if (!maxDate) return;

    const end = maxDate;
    const days = TIME_RANGE_DAYS[timeRange];
    const start = isoDate(subDays(parseISO(maxDate), days - 1));

    setTrendLoading(true); // ← renamed
    setTrendError(null);
    fetchRevenueTrend(start, end)
      .then(setData)
      .catch((e: Error) => setTrendError(e.message))
      .finally(() => setTrendLoading(false)); // ← renamed
  }, [maxDate, timeRange]);

  const granularity = data?.granularity ?? "day";
  const peakDay = data?.trend.reduce((a, b) => (b.revenue > a.revenue ? b : a));
  const topCategory = data?.category_gender.reduce((a, b) => {
    const totalA = a.male + a.female + a.other;
    const totalB = b.male + b.female + b.other;
    return totalB > totalA ? b : a;
  });

  return (
    <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:shadow-xs sm:grid-cols-2 xl:grid-cols-5">

      {/* ── Revenue Trend ── */}
      <Card className="col-span-1 xl:col-span-3">
        <CardHeader>
          <CardTitle>Revenue Trend</CardTitle>
          <CardDescription>
            {trendLoading || !peakDay
              ? "Loading..."
              : <>
                Peak:{" "}
                <span className="font-medium text-foreground">{fmtLabel(peakDay.month, granularity)}</span>{" "}
                with revenue at{" "}
                <span className="font-medium text-foreground">
                  {fmtRevenue(peakDay.revenue)}
                </span>
              </>}
          </CardDescription>

          {/* Responsive toggle — ToggleGroup on wide, Select on narrow */}
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

        {/* Revenue Trend Chart */}
        <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
          {dateError && <p className="text-sm text-destructive mb-2">{dateError}</p>}
          {trendError && <p className="text-sm text-destructive mb-2">{trendError}</p>}
          {trendLoading ? (
            <div className="h-62 w-full animate-pulse rounded-lg bg-muted" />
          ) : !data?.trend.length ? (
            <EmptyState message="Tidak ada data revenue untuk periode ini." />
          ) : (
            <ChartContainer config={trendConfig} className="aspect-auto h-62 w-full">
              <AreaChart data={data.trend} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
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

      {/* ── Category vs Gender (full DB range, fixed) ── */}
      <Card className="col-span-1 xl:col-span-2">
        <CardHeader>
          <CardTitle>Revenue by Category & Gender</CardTitle>
          <CardDescription>All-time period</CardDescription>
        </CardHeader>
        <CardContent>
          {trendLoading && !data ? ( // ← skeleton hanya muncul saat initial load
            <div className="h-62 w-full animate-pulse rounded-lg bg-muted" />
          ) : !data?.category_gender.length ? (
            <EmptyState message="Tidak ada data kategori tersedia." />
          ) : (
            <ChartContainer config={categoryConfig} className="h-62 w-full">
              <BarChart
                data={data.category_gender}
                layout="vertical"
                margin={{ left: 0, right: 16, top: 0, bottom: 0 }}
              >
                <CartesianGrid horizontal={false} strokeDasharray="0" />
                <YAxis
                  type="category"
                  dataKey="category"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  className="text-xs"
                  width={80}
                />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                  tickFormatter={fmtRevenue}
                />
                {/* <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} /> */}
                <ChartTooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;

                    const p = payload[0].payload;
                    const total = p.male + p.female + p.other;

                    return (
                      <div className="rounded-lg border bg-background p-2 shadow-sm text-xs space-y-1">
                        <p className="font-medium">{p.category} • Total : {fmtRevenue(total)}</p>
                        {payload.map((item) => {
                          const pct = ((item.value as number) / total * 100).toFixed(1);
                          return (
                            <div key={item.dataKey} className="flex items-center gap-2">
                              <span
                                className="inline-block h-2 w-2 rounded-full"
                                style={{ backgroundColor: item.fill ?? item.color }}
                              />
                              <span className="text-muted-foreground capitalize">{item.dataKey as string}</span>
                              <span className="ml-auto font-medium">
                                {fmtRevenue(item.value as number)} ({pct}%)
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }}
                />
                <Bar dataKey="male" stackId="a" fill="var(--color-male)" />
                <Bar dataKey="female" stackId="a" fill="var(--color-female)" />
                <Bar dataKey="other" stackId="a" fill="var(--color-other)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
        {topCategory && ( // ← cukup topCategory, ga perlu !trendLoading
          <CardFooter>
            <p className="text-muted-foreground text-xs">
              Top category:{" "}
              <span className="font-medium text-foreground">{topCategory.category}</span>{" "}
              with revenue at{" "}
              <span className="font-medium text-foreground">
                {fmtRevenue(topCategory.male + topCategory.female + topCategory.other)}
              </span>
            </p>
          </CardFooter>
        )}
      </Card>

    </div>
  );
}
