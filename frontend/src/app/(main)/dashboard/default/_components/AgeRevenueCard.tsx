"use client";

import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Separator } from "@/components/ui/separator";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// ── Types ─────────────────────────────────────────────────────────────────────
type AgeGroupPoint = {
  age_group: string;
  total_revenue: number;
  avg_revenue: number;
  order_count: number;
};

// ── Constants ─────────────────────────────────────────────────────────────────
const API_URL = "http://localhost:8000/dashboard/revenue-by-age";

// ── Chart config ──────────────────────────────────────────────────────────────
const chartConfig = {
  value: { label: "Value" },
} satisfies ChartConfig;

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  `₺${n.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`;

const fmtShort = (n: number) => {
  if (n >= 1_000_000) return `₺${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₺${(n / 1_000).toFixed(0)}K`;
  return fmt(n);
};

const fmtCount = (n: number) => n.toLocaleString("tr-TR");

// ── Component ─────────────────────────────────────────────────────────────────
export function AgeRevenueCard() {
  const [data, setData] = useState<AgeGroupPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<"total_revenue" | "avg_revenue" | "order_count">("total_revenue");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    setLoading(true);
    setError(null);

    fetch(API_URL, { signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => setData(json.data))
      .catch((err: Error) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => setLoading(false));

    return () => abortRef.current?.abort();
  }, []);

  const metricLabel: Record<typeof metric, string> = {
    total_revenue: "Total Revenue",
    avg_revenue: "Avg Order Value",
    order_count: "Order Count",
  };

  const topGroup = data.reduce<AgeGroupPoint | null>(
    (best, d) =>
      best === null || (d[metric] as number) > (best[metric] as number) ? d : best,
    null
  );

  const chartData = data.map((d) => ({
    age_group: d.age_group,
    value: d[metric] as number,
  }));

  const tickFormatter = (val: number) =>
    metric === "order_count" ? fmtCount(val) : fmtShort(val);

  const formatFull = (val: number) =>
    metric === "order_count" ? fmtCount(val) : fmt(val);

  return (
    <Card className="col-span-1 xl:col-span-1">
      <CardHeader>
        <CardTitle className="leading-none">Revenue by Age Group</CardTitle>
        <CardDescription>
          {loading ? (
            "Loading data..."
          ) : error ? (
            <span className="text-destructive">Failed to load: {error}</span>
          ) : (
            <>
              Highest spend in category{" "}
              <span className="font-medium text-foreground">{topGroup?.age_group}</span> y.o.
            </>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <Separator />

        <div className="flex items-center justify-center gap-2 py-5 md:items-stretch md:gap-0">
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <p className="text-xs uppercase text-muted-foreground">Top Group</p>
              <p className="font-medium tabular-nums">{topGroup?.age_group ?? "—"}</p>
            </div>
          </div>
          <Separator orientation="vertical" className="h-auto! self-stretch" />
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <p className="text-xs uppercase text-muted-foreground">{metricLabel[metric]}</p>
              <p className="font-medium tabular-nums">
                {formatFull((topGroup?.[metric] ?? 0) as number)}
              </p>
            </div>
          </div>
        </div>

        <Separator />

        <ChartContainer className="h-52 w-full" config={chartConfig}>
          <BarChart
            data={chartData}
            margin={{ left: 0, right: 0, top: 10, bottom: 0 }}
            accessibilityLayer
          >
            <CartesianGrid vertical={false} />
            <XAxis dataKey="age_group" tickLine={false} tickMargin={10} axisLine={false} />
            <YAxis
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              tickFormatter={tickFormatter}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(val) => formatFull(val as number)}
                  labelFormatter={(label) => `Age: ${label}`}
                />
              }
            />
            <Bar dataKey="value" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>

        <div className="flex gap-1 rounded-lg border bg-muted p-1 text-xs">
          {(["total_revenue", "avg_revenue", "order_count"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`flex-1 rounded-md px-2 py-1.5 font-medium transition-colors ${metric === m
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
                }`}
            >
              {metricLabel[m]}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}