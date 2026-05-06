"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { type DateRange } from "react-day-picker";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { fetchCategoryGender, type CategoryGenderData } from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtRevenue(v: number) {
  return `₺ ${v.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`;
}

function fmtRevenueShort(v: number) {
  if (v >= 1_000) return `₺ ${(v / 1_000).toFixed(1)}K`;
  return `₺ ${v.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`;
}

function isoDate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-64 w-full items-center justify-center rounded-lg border border-dashed">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// ── Chart Config ──────────────────────────────────────────────────────────────
const categoryConfig = {
  male: { label: "Male", color: "var(--chart-1)" },
  female: { label: "Female", color: "var(--chart-2)" },
  other: { label: "Other", color: "var(--chart-3)" },
} satisfies ChartConfig;

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  dateRange: DateRange;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function RevenueCategoriesGender({ dateRange }: Props) {
  const [categoryData, setCategoryData] = useState<CategoryGenderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dateRange?.from || !dateRange?.to) return;

    const controller = new AbortController();
    const start = isoDate(dateRange.from);
    const end = isoDate(dateRange.to);

    setLoading(true);
    setError(null);

    fetchCategoryGender(controller.signal, start, end)
      .then(setCategoryData)
      .catch((err: Error) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [dateRange]);

  const topCategory = categoryData?.data.reduce<CategoryGenderData["data"][number] | null>(
    (best, d) => {
      const totalBest = (best?.male ?? 0) + (best?.female ?? 0) + (best?.other ?? 0);
      const totalD = d.male + d.female + d.other;
      return totalD > totalBest ? d : best;
    },
    null
  );

  return (
    <Card className="col-span-1 xl:col-span-2">
      <CardHeader>
        <CardTitle>Revenue by Category & Gender</CardTitle>
        <CardDescription>
          {dateRange.from && dateRange.to
            ? `${format(dateRange.from, "dd MMM yyyy")} – ${format(dateRange.to, "dd MMM yyyy")}`
            : "Selected period"}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
        {loading ? (
          <div className="h-62 w-full animate-pulse rounded-lg bg-muted" />
        ) : !categoryData?.data.length ? (
          <EmptyState message="Tidak ada data kategori tersedia." />
        ) : (
          <ChartContainer config={categoryConfig} className="h-62 w-full">
            <BarChart
              data={categoryData.data}
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
                tickFormatter={fmtRevenueShort}
              />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload;
                  const total = p.male + p.female + p.other;
                  return (
                    <div className="rounded-lg border bg-background p-2 shadow-sm text-xs space-y-1">
                      <p className="font-medium">{p.category} • Total: {fmtRevenue(total)}</p>
                      {payload.map((item) => {
                        const pct = ((item.value as number) / total * 100).toFixed(1);
                        return (
                          <div key={String(item.dataKey)} className="flex items-center gap-2">
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

      {topCategory && (
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
  );
}
