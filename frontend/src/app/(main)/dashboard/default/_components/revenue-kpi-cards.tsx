"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { type DateRange } from "react-day-picker";
import { BarChart3, DollarSign, ShoppingCart, TrendingDown, TrendingUp, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchKpi, type KpiData } from "@/lib/api";

// ─── Helpers ──────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function toIsoString(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function parseDate(s: string): Date {
  return new Date(s + "T00:00:00");
}

// ─── TrendBadge ───────────────────────────────────────────────

function TrendBadge({ change }: { change: number }) {
  const isPositive = change >= 0;
  const Icon = isPositive ? TrendingUp : TrendingDown;
  return (
    <Badge
      variant="outline"
      className={
        isPositive
          ? "border-green-200 bg-green-500/10 text-green-700 dark:border-green-900/40 dark:bg-green-500/15 dark:text-green-300"
          : "border-destructive/20 bg-destructive/10 text-destructive"
      }
    >
      <Icon className="size-3" />
      {isPositive ? "+" : ""}{Math.abs(change).toFixed(1)}%
    </Badge>
  );
}

// ─── Props ────────────────────────────────────────────────────

interface Props {
  dateRange: DateRange;
}

// ─── Main Component ───────────────────────────────────────────

export function RevenueKpiCards({ dateRange }: Props) {
  const [data, setData] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dateRange?.from || !dateRange?.to) return;
    setLoading(true);
    setError(null);
    fetchKpi(toIsoString(dateRange.from), toIsoString(dateRange.to))
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [dateRange]);

  const prevFrom = data?.prev_start_date ? parseDate(data.prev_start_date) : undefined;
  const prevTo = data?.prev_end_date ? parseDate(data.prev_end_date) : undefined;

  return (
    <div className="flex flex-col gap-4">
      {/* Comparison period label */}
      {/* {prevFrom && prevTo && (
        <p className="text-xs text-muted-foreground text-right">
          vs. {format(prevFrom, "dd MMM yyyy")} – {format(prevTo, "dd MMM yyyy")}
        </p>
      )} */}

      {/* Error state */}
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          Failed to load KPI data: {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs xl:grid-cols-4 dark:*:data-[slot=card]:bg-card">

        {/* Total Revenue */}
        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                <DollarSign className="size-4" />
              </div>
            </CardTitle>
            <CardDescription>Total Revenue</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-medium text-3xl tabular-nums leading-none tracking-tight">
                {loading || !data ? "—" : `₺ ${fmt(Math.round(data.total_revenue))}`}
              </div>
              {!loading && data && <TrendBadge change={data.total_revenue_change} />}
            </div>
            <p className="text-muted-foreground text-sm">vs. previous period</p>
          </CardContent>
        </Card>

        {/* Avg Order Value */}
        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                <BarChart3 className="size-4" />
              </div>
            </CardTitle>
            <CardDescription>Avg. Order Value</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-medium text-3xl tabular-nums leading-none tracking-tight">
                {loading || !data ? "—" : `₺ ${fmt(Math.round(data.avg_order_value))}`}
              </div>
              {!loading && data && <TrendBadge change={data.avg_order_value_change} />}
            </div>
            <p className="text-muted-foreground text-sm">per transaction</p>
          </CardContent>
        </Card>

        {/* Total Orders */}
        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                <ShoppingCart className="size-4" />
              </div>
            </CardTitle>
            <CardDescription>Total Orders</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-medium text-3xl tabular-nums leading-none tracking-tight">
                {loading || !data ? "—" : fmt(data.total_orders)}
              </div>
              {!loading && data && <TrendBadge change={data.total_orders_change} />}
            </div>
            <p className="text-muted-foreground text-sm">across all categories</p>
          </CardContent>
        </Card>

        {/* Active Customers */}
        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                <Users className="size-4" />
              </div>
            </CardTitle>
            <CardDescription>Active Customers</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-medium text-3xl tabular-nums leading-none tracking-tight">
                {loading || !data ? "—" : fmt(data.active_customers)}
              </div>
              {!loading && data && <TrendBadge change={data.active_customers_change} />}
            </div>
            <p className="text-muted-foreground text-sm">unique buyers this period</p>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
