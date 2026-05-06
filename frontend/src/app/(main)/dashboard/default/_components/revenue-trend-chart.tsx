"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { type DateRange } from "react-day-picker";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { fetchRevenueTrend, type RevenueTrendData } from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtRevenue(v: number) {
  if (v >= 1_000) return `₺ ${(v / 1_000).toFixed(1)}K`;
  return `₺ ${v.toLocaleString()}`;
}

function isoDate(d: Date): string {
  return format(d, "yyyy-MM-dd");
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

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  dateRange: DateRange;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function RevenueTrendChart({ dateRange }: Props) {
  const [trendData, setTrendData] = useState<RevenueTrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dateRange?.from || !dateRange?.to) return;

    const controller = new AbortController();
    const start = isoDate(dateRange.from);
    const end = isoDate(dateRange.to);

    setLoading(true);
    setError(null);

    fetchRevenueTrend(start, end, controller.signal)
      .then(setTrendData)
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [dateRange]);

  const granularity = trendData?.granularity ?? "day";
  const peakDay = trendData?.trend.reduce((a, b) => (b.revenue > a.revenue ? b : a));

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
      </CardHeader>

      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
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
