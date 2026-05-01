/**
 * StayWise API client
 * Base URL dari env: NEXT_PUBLIC_API_URL (default: http://localhost:8000)
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function apiFetch<T>(path: string, params?: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const url = new URL(path, BASE_URL);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString(), { cache: "no-store", signal });
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
  granularity: "day" | "week";
  trend: RevenueTrendPoint[];
}

export interface CategoryGenderData {
  data: CategoryGenderPoint[];
}

export interface CityRevenuePoint {
  city: string;
  total_revenue: number;
}

export interface CityRevenueData {
  data: CityRevenuePoint[];
}

export interface AgeGroupPoint {
  age_group: string;
  total_revenue: number;
  avg_revenue: number;
  order_count: number;
}

export interface AgeRevenueData {
  data: AgeGroupPoint[];
}

// ─── Endpoints ────────────────────────────────────────────────

export function fetchDateRange(signal?: AbortSignal): Promise<DateRangeData> {
  return apiFetch<DateRangeData>("/dashboard/date-range", undefined, signal);
}

export function fetchKpi(startDate?: string, endDate?: string, signal?: AbortSignal): Promise<KpiData> {
  const params: Record<string, string> = {};
  if (startDate) params.start_date = startDate;
  if (endDate) params.end_date = endDate;
  return apiFetch<KpiData>("/dashboard/kpi", Object.keys(params).length ? params : undefined, signal);
}

export function fetchRevenueTrend(startDate?: string, endDate?: string, signal?: AbortSignal): Promise<RevenueTrendData> {
  const params: Record<string, string> = {};
  if (startDate) params.start_date = startDate;
  if (endDate) params.end_date = endDate;
  return apiFetch<RevenueTrendData>("/dashboard/revenue-trend", Object.keys(params).length ? params : undefined, signal);
}

export function fetchCategoryGender(signal?: AbortSignal): Promise<CategoryGenderData> {
  return apiFetch<CategoryGenderData>("/dashboard/category-gender", undefined, signal);
}

export function fetchCityRevenue(signal?: AbortSignal): Promise<CityRevenueData> {
  return apiFetch<CityRevenueData>("/dashboard/revenue-by-city", undefined, signal);
}

export function fetchAgeRevenue(signal?: AbortSignal): Promise<AgeRevenueData> {
  return apiFetch<AgeRevenueData>("/dashboard/revenue-by-age", undefined, signal);
}