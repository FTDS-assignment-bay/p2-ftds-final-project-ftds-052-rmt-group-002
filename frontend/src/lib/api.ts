/**
 * StayWise API client
 * Base URL dari env: NEXT_PUBLIC_API_URL (default: http://localhost:8000)
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function apiFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, BASE_URL);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────

export interface DateRangeData {
  min_date: string;
  max_date: string;
}

export interface KpiData {
  start_date: string;
  end_date: string;
  prev_start_date: string;
  prev_end_date: string;
  total_revenue: number;
  total_revenue_change: number;
  avg_order_value: number;
  avg_order_value_change: number;
  total_orders: number;
  total_orders_change: number;
  active_customers: number;
  active_customers_change: number;
}

export interface RevenueTrendPoint {
  month: string;
  revenue: number;
  orders: number;
}

export interface CategoryGenderPoint {
  category: string;
  male: number;
  female: number;
  other: number;
}

export interface RevenueTrendData {
  start_date: string;
  end_date: string;
  trend: RevenueTrendPoint[];
  category_gender: CategoryGenderPoint[];
}

// ─── Endpoints ────────────────────────────────────────────────

export function fetchDateRange(): Promise<DateRangeData> {
  return apiFetch<DateRangeData>("/dashboard/date-range");
}

export function fetchKpi(startDate?: string, endDate?: string): Promise<KpiData> {
  const params: Record<string, string> = {};
  if (startDate) params.start_date = startDate;
  if (endDate)   params.end_date   = endDate;
  return apiFetch<KpiData>("/dashboard/kpi", Object.keys(params).length ? params : undefined);
}

export function fetchRevenueTrend(startDate?: string, endDate?: string): Promise<RevenueTrendData> {
  const params: Record<string, string> = {};
  if (startDate) params.start_date = startDate;
  if (endDate)   params.end_date   = endDate;
  return apiFetch<RevenueTrendData>("/dashboard/revenue-trend", Object.keys(params).length ? params : undefined);
}
