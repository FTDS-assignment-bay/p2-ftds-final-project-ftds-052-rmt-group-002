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

export interface CustomerListRow {
  customer_id: string;
  full_name: string | null;
  churn_probability: number | null;
  risk_segment: string | null;
  predicted_clv_90d: number | null;
  segment_name: string | null;
  recency_days: number | null;
  frequency: number | null;
  monetary_total: number | null;
}

export interface CustomerDetail {
  customer_id: string;
  full_name: string | null;
  age: number | null;
  gender: string | null;
  city: string | null;
  first_seen_date: string | null;
  churn_probability: number | null;
  risk_segment: string | null;
  predicted_clv_90d: number | null;
  segment_name: string | null;
  model_version: string | null;
  predicted_at: string | null;
  recency_days: number | null;
  frequency: number | null;
  monetary_total: number | null;
  monetary_avg: number | null;
  preferred_category: string | null;
  preferred_device: string | null;
  preferred_payment: string | null;
}

export interface CustomerCountData {
  total: number;
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

export function fetchCustomerList(
  riskSegment?: string,
  limit = 1000,
  offset = 0,
  signal?: AbortSignal
): Promise<CustomerListRow[]> {
  const params: Record<string, string> = { limit: String(limit), offset: String(offset) };
  if (riskSegment) params.risk_segment = riskSegment;
  return apiFetch<CustomerListRow[]>("/customers/list", params, signal);
}

export function fetchCustomerCount(riskSegment?: string, signal?: AbortSignal): Promise<CustomerCountData> {
  const params: Record<string, string> = {};
  if (riskSegment) params.risk_segment = riskSegment;
  return apiFetch<CustomerCountData>("/customers/count", Object.keys(params).length ? params : undefined, signal);
}

export function fetchCustomerDetail(customerId: string, signal?: AbortSignal): Promise<CustomerDetail> {
  return apiFetch<CustomerDetail>(`/customers/${customerId}`, undefined, signal);
}