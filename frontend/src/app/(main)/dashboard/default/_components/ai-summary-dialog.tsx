"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { format } from "date-fns";
import { type DateRange } from "react-day-picker";
import { Sparkles, RefreshCw, Copy, Check, Lightbulb, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type {
  KpiData,
  RevenueTrendData,
  CategoryGenderData,
  CityRevenueData,
  AgeRevenueData,
} from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AiSummaryDialogProps {
  dateRange: DateRange;
  kpiData: KpiData | null;
  revenueTrend: RevenueTrendData | null;
  categoryGender: CategoryGenderData | null;
  cityRevenue: CityRevenueData | null;
  ageRevenue: AgeRevenueData | null;
}

interface SummaryResult {
  // Array of paragraphs/points — rendered as separate items, easier to read
  analysis: string[];
  recommendations: string[];
}

type Language = "en" | "id";
type Phase = "idle" | "streaming" | "done" | "error";

// ── Constants ─────────────────────────────────────────────────────────────────

const CURRENCY = "₺";
const LOCALE = "tr-TR";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `${CURRENCY} ${n.toLocaleString(LOCALE, { maximumFractionDigits: 0 })}`;
}

function buildPrompt(
  dateRange: DateRange,
  kpi: KpiData | null,
  trend: RevenueTrendData | null,
  category: CategoryGenderData | null,
  city: CityRevenueData | null,
  age: AgeRevenueData | null,
  lang: Language
): string {
  const from = dateRange.from ? format(dateRange.from, "dd MMMM yyyy") : "—";
  const to = dateRange.to ? format(dateRange.to, "dd MMMM yyyy") : "—";

  const kpiSection = kpi
    ? `
KPI Data for selected period (${from} – ${to}):
- Total Revenue: ${fmt(kpi.total_revenue)} (${kpi.total_revenue_change >= 0 ? "+" : ""}${kpi.total_revenue_change.toFixed(1)}% vs previous period)
- Average Order Value: ${fmt(kpi.avg_order_value)} (${kpi.avg_order_value_change >= 0 ? "+" : ""}${kpi.avg_order_value_change.toFixed(1)}% vs previous period)
- Total Orders: ${kpi.total_orders.toLocaleString()} (${kpi.total_orders_change >= 0 ? "+" : ""}${kpi.total_orders_change.toFixed(1)}% vs previous period)
- Active Customers: ${kpi.active_customers.toLocaleString()} (${kpi.active_customers_change >= 0 ? "+" : ""}${kpi.active_customers_change.toFixed(1)}% vs previous period)
- Previous period: ${kpi.prev_start_date} to ${kpi.prev_end_date}
`
    : `No KPI data available for the selected period (${from} – ${to}).`;

  const trendSection = trend?.trend?.length
    ? (() => {
      const points = trend.trend;
      const revenues = points.map((p) => p.revenue);
      const totalOrders = points.reduce((a, p) => a + p.orders, 0);
      const peak = points.reduce((a, b) => (a.revenue > b.revenue ? a : b));
      const trough = points.reduce((a, b) => (a.revenue < b.revenue ? a : b));
      const avg = revenues.reduce((a, b) => a + b, 0) / revenues.length;
      const first = points[0];
      const last = points[points.length - 1];
      const growthPct = (((last.revenue - first.revenue) / first.revenue) * 100).toFixed(1);
      return `
Revenue Trend (${trend.granularity} granularity, ${points.length} periods):
- Start: ${fmt(first.revenue)} (${first.month})
- End: ${fmt(last.revenue)} (${last.month})
- Overall growth: ${Number(growthPct) >= 0 ? "+" : ""}${growthPct}% over the period
- Peak: ${fmt(peak.revenue)} on ${peak.month}
- Trough: ${fmt(trough.revenue)} on ${trough.month}
- Average per ${trend.granularity}: ${fmt(Math.round(avg))}
- Total orders across period: ${totalOrders.toLocaleString()}
`;
    })()
    : "";

  const categorySection = category?.data?.length
    ? `
Revenue by Category & Gender:
${category.data
      .map((p) => `- ${p.category}: Male ${fmt(p.male)}, Female ${fmt(p.female)}, Other ${fmt(p.other)}`)
      .join("\n")}
`
    : "";

  const citySection = city?.data?.length
    ? `
Top Cities by Revenue:
${city.data.slice(0, 5).map((p) => `- ${p.city}: ${fmt(p.total_revenue)}`).join("\n")}
`
    : "";

  const ageSection = age?.data?.length
    ? `
Revenue by Age Group:
${age.data
      .map((p) => `- ${p.age_group}: Total ${fmt(p.total_revenue)}, Avg ${fmt(p.avg_revenue)}, ${p.order_count} orders`)
      .join("\n")}
`
    : "";

  const langInstruction =
    lang === "id"
      ? "Tulis seluruh respons dalam Bahasa Indonesia yang profesional dan lugas."
      : "Write the entire response in English.";

  return `You are a senior business intelligence analyst for an e-commerce platform called StayWise, operating in Turkey (currency: Turkish Lira ${CURRENCY}).

Analyze the dashboard data below and respond ONLY with a valid JSON object — no markdown, no explanation, no code fences. Use exactly this shape:
{
  "analysis": ["<string>", "<string>", "<string>", "<string>"],
  "recommendations": ["<string>", "<string>", "<string>"]
}

Field rules:
- "analysis": array of exactly 4 strings. Each string is one focused, concise paragraph (2–3 sentences max). Cover in order:
    1. Overall performance vs previous period (revenue, orders, customers, AOV)
    2. Revenue trend — momentum, peak, trough, growth rate
    3. Top categories and gender breakdown — which performs best and why it matters
    4. Top cities and age group insights — geographic and demographic concentration
  Be specific — reference actual numbers from the data.
- "recommendations": array of exactly 3 strings. Each must be a single actionable sentence directly grounded in the data — no generic advice.
- ${langInstruction}
- Output must be valid JSON parseable by JSON.parse(). No trailing commas, no comments.

Dashboard data:
${kpiSection}
${trendSection}
${categorySection}
${citySection}
${ageSection}`;
}

// ── Parse helper ──────────────────────────────────────────────────────────────

function parseSummary(raw: string): SummaryResult {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const parsed = JSON.parse(cleaned) as SummaryResult;
  if (!Array.isArray(parsed.analysis) || !Array.isArray(parsed.recommendations)) {
    throw new Error("Unexpected response shape.");
  }
  return parsed;
}

// ── Streaming ─────────────────────────────────────────────────────────────────

async function streamSummary(
  prompt: string,
  onChunk: (text: string) => void,
  signal: AbortSignal
): Promise<string> {
  const response = await fetch("/api/ai-summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      max_tokens: 1024,
      stream: true,
      messages: [
        {
          role: "system",
          content:
            "You are a senior business intelligence analyst. Always respond with valid JSON only — no markdown, no extra text, no code fences.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 429) throw new Error("Too many requests. Please wait a moment and try again.");
    if (status === 401) throw new Error("Unauthorized. Please check your API credentials.");
    if (status >= 500) throw new Error("Server error. Please try again later.");
    throw new Error(`Unexpected error (${status}). Please try again.`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let accumulated = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
      for (const line of lines) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") return accumulated;
        try {
          const parsed = JSON.parse(data);
          const text = parsed?.choices?.[0]?.delta?.content;
          if (text) {
            accumulated += text;
            onChunk(text);
          }
        } catch {
          // skip malformed SSE chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return accumulated;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AiSummaryDialog({
  dateRange,
  kpiData,
  revenueTrend,
  categoryGender,
  cityRevenue,
  ageRevenue,
}: AiSummaryDialogProps) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [rawBuffer, setRawBuffer] = useState("");
  const [result, setResult] = useState<SummaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [lang, setLang] = useState<Language>("en");

  const abortRef = useRef<AbortController | null>(null);

  const from = dateRange.from ? format(dateRange.from, "dd MMM yyyy") : "—";
  const to = dateRange.to ? format(dateRange.to, "dd MMM yyyy") : "—";

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const generate = useCallback(
    async (selectedLang: Language = lang) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setRawBuffer("");
      setResult(null);
      setError(null);
      setPhase("streaming");

      try {
        const prompt = buildPrompt(
          dateRange, kpiData, revenueTrend, categoryGender, cityRevenue, ageRevenue, selectedLang
        );
        const fullRaw = await streamSummary(
          prompt,
          (chunk) => setRawBuffer((prev) => prev + chunk),
          controller.signal
        );
        const parsed = parseSummary(fullRaw);
        setResult(parsed);
        setPhase("done");
      } catch (e: unknown) {
        if (e instanceof Error && e.name !== "AbortError") {
          setError(
            e.message === "Unexpected response shape." || e instanceof SyntaxError
              ? "Failed to parse AI response. Please try regenerating."
              : e.message
          );
          setPhase("error");
        }
      }
    },
    [lang, dateRange, kpiData, revenueTrend, categoryGender, cityRevenue, ageRevenue]
  );

  function handleLangChange(value: string) {
    if (!value || value === lang) return;
    const newLang = value as Language;
    setLang(newLang);
    generate(newLang);
  }

  function handleOpen(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen && phase === "idle") generate();
    if (!isOpen) abortRef.current?.abort();
  }

  async function handleCopy() {
    if (!result) return;
    const label = lang === "id" ? "Rekomendasi" : "Recommendations";
    const text = [
      ...result.analysis,
      "",
      `${label}:`,
      ...result.recommendations.map((r, i) => `${i + 1}. ${r}`),
    ].join("\n\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const analysisLabel = lang === "id" ? "Analisis AI" : "AI Analysis Overview";
  const recommendLabel = lang === "id" ? "Rekomendasi" : "Recommendations";

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => handleOpen(true)} className="gap-2">
        <Sparkles className="size-4" />
        AI Summary
      </Button>

      <Dialog open={open} onOpenChange={handleOpen}>
        {/* FIX: flex column layout so footer never gets clipped */}
        <DialogContent className="sm:max-w-2xl flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                Executive Summary
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  {from} – {to}
                </span>
              </DialogTitle>

              <ToggleGroup
                type="single"
                value={lang}
                onValueChange={handleLangChange}
                variant="outline"
                size="sm"
                disabled={phase === "streaming"}
                className="shrink-0"
              >
                <ToggleGroupItem value="en" className="text-xs px-3">EN</ToggleGroupItem>
                <ToggleGroupItem value="id" className="text-xs px-3">ID</ToggleGroupItem>
              </ToggleGroup>
            </div>
          </DialogHeader>

          {/* ── Scrollable content area ── */}
          <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1 py-1">

            {/* ERROR */}
            {phase === "error" && (
              <div className="rounded-lg border bg-muted/30 p-4 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* STREAMING — raw JSON with cursor */}
            {phase === "streaming" && (
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart2 className="size-4 text-muted-foreground shrink-0 animate-pulse" />
                  <span className="text-sm font-medium text-muted-foreground">{analysisLabel}</span>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap font-mono break-all">
                  {rawBuffer}
                  <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-foreground align-text-bottom" />
                </p>
              </div>
            )}

            {/* DONE — structured view */}
            {phase === "done" && result && (
              <>
                {/* Analysis — per-paragraph */}
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart2 className="size-4 text-primary shrink-0" />
                    <span className="text-sm font-medium text-primary">{analysisLabel}</span>
                  </div>
                  <div className="flex flex-col gap-3">
                    {result.analysis.map((paragraph, i) => (
                      <p key={i} className="text-sm leading-relaxed text-foreground">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </div>

                {/* Recommendations */}
                <div className="rounded-lg border bg-primary/5 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Lightbulb className="size-4 text-primary shrink-0" />
                    <span className="text-sm font-medium text-primary">{recommendLabel}</span>
                  </div>
                  <ol className="flex flex-col gap-2.5">
                    {result.recommendations.map((rec, i) => (
                      <li key={i} className="flex gap-3 text-sm leading-relaxed">
                        <span className="shrink-0 flex items-center justify-center size-5 rounded-full bg-primary/10 text-primary text-xs font-semibold mt-0.5">
                          {i + 1}
                        </span>
                        <span className="text-foreground">{rec}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </>
            )}
          </div>

          {/* ── Footer — always visible, never clipped ── */}
          <DialogFooter className="shrink-0 gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              disabled={phase !== "done"}
              className="gap-2"
            >
              {copied
                ? <><Check className="size-4" /> Copied</>
                : <><Copy className="size-4" /> Copy</>
              }
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => generate()}
              disabled={phase === "streaming"}
              className="gap-2"
            >
              <RefreshCw className={`size-4 ${phase === "streaming" ? "animate-spin" : ""}`} />
              Regenerate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
