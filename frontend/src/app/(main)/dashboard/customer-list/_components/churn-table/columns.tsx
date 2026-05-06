"use client";
"use no memo";

import type { Column, ColumnDef, SortingFn } from "@tanstack/react-table";
import { UserRound, ArrowUpDown, ArrowUp, ArrowDown, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { ChurnCustomerRow } from "./schema";

// --- Helpers ---

// DB pakai lowercase: "high" | "medium" | "low"
function riskVariant(risk: string | null): "default" | "destructive" | "outline" | "secondary" {
  if (risk === "high") return "destructive";
  if (risk === "medium") return "outline";
  return "secondary";
}

function riskLabel(risk: string | null): string {
  if (!risk) return "—";
  return risk.charAt(0).toUpperCase() + risk.slice(1);
}

function churnBarColor(prob: number): string {
  if (prob >= 0.7) return "*:data-[slot='progress-indicator']:bg-red-500";
  if (prob >= 0.4) return "*:data-[slot='progress-indicator']:bg-amber-500";
  return "*:data-[slot='progress-indicator']:bg-green-500";
}

// --- Reusable sortable header ---

function SortableHeader({
  label,
  column,
}: {
  label: string;
  column: Column<ChurnCustomerRow, unknown>;
}) {
  const sorted = column.getIsSorted();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 h-8 gap-1 font-medium text-foreground text-sm"
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {label}
      {sorted === "asc" ? (
        <ArrowUp className="size-3.5" />
      ) : sorted === "desc" ? (
        <ArrowDown className="size-3.5" />
      ) : (
        <ArrowUpDown className="size-3.5 text-muted-foreground" />
      )}
    </Button>
  );
}

// --- ML badge decorator with tooltip ---

const ML_TOOLTIPS: Record<string, string> = {
  churn_probability: "Probability of churn predicted by the Logistic Regression model.",
  segment_name: "Customer behavior segment assigned by K-Means clustering.",
  predicted_clv_90d: "Estimated CLV for the next 90 days predicted by Projection model.",
};

function MlHeader({ label, field }: { label: string; field: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 cursor-default">
            <Sparkles className="size-3 text-violet-500" />
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-56 text-xs">
          <p className="font-medium text-violet-400 mb-0.5">ML-generated</p>
          <p>{ML_TOOLTIPS[field]}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function SortableMlHeader({
  label,
  field,
  column,
}: {
  label: string;
  field: string;
  column: Column<ChurnCustomerRow, unknown>;
}) {
  const sorted = column.getIsSorted();
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-8 gap-1 font-medium text-foreground text-sm"
            onClick={() => column.toggleSorting(sorted === "asc")}
          >
            <Sparkles className="size-3 text-violet-500" />
            {label}
            {sorted === "asc" ? (
              <ArrowUp className="size-3.5" />
            ) : sorted === "desc" ? (
              <ArrowDown className="size-3.5" />
            ) : (
              <ArrowUpDown className="size-3.5 text-muted-foreground" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-56 text-xs">
          <p className="font-medium text-violet-400 mb-0.5">ML-generated</p>
          <p>{ML_TOOLTIPS[field]}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// --- Column definitions ---

export const churnColumns: ColumnDef<ChurnCustomerRow>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={`Select ${row.original.full_name ?? row.original.customer_id}`}
        />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "full_name",
    header: ({ column }) => <SortableHeader label="Customer" column={column} />,
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-md border bg-muted">
          <UserRound className="size-4 text-muted-foreground" />
        </span>
        <div className="grid min-w-0 gap-0.5">
          <span className="truncate font-medium text-sm leading-none">
            {row.original.full_name ?? row.original.customer_id}
          </span>
          <span className="truncate text-muted-foreground text-xs leading-none">
            {row.original.customer_id}
          </span>
        </div>
      </div>
    ),
    enableHiding: false,
  },
  {
    id: "search",
    accessorFn: (row) => `${row.customer_id} ${row.full_name ?? ""}`,
    filterFn: "includesString",
    enableSorting: false,
    enableHiding: true,
  },
  {
    accessorKey: "risk_segment",
    header: ({ column }) => <SortableHeader label="Risk Level" column={column} />,
    filterFn: "equalsString",
    sortingFn: ((rowA, rowB) => {
      const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return (order[rowA.original.risk_segment ?? ""] ?? 9) - (order[rowB.original.risk_segment ?? ""] ?? 9);
    }) as SortingFn<ChurnCustomerRow>,
    cell: ({ row }) => (
      <Badge variant={riskVariant(row.original.risk_segment)}>
        {riskLabel(row.original.risk_segment)}
      </Badge>
    ),
  },
  {
    accessorKey: "churn_probability",
    header: ({ column }) => <SortableMlHeader label="Churn Prob." field="churn_probability" column={column} />,
    cell: ({ row }) => {
      const prob = row.original.churn_probability;
      if (prob == null) return <span className="text-muted-foreground text-sm">—</span>;
      return (
        <div className="flex w-32 flex-col gap-1">
          <span className="text-xs tabular-nums font-medium">{(prob * 100).toFixed(1)}%</span>
          <Progress
            value={prob * 100}
            className={`h-1.5 bg-muted ${churnBarColor(prob)}`}
          />
        </div>
      );
    },
  },
  {
    accessorKey: "segment_name",
    header: ({ column }) => <SortableMlHeader label="Segment" field="segment_name" column={column} />,
    filterFn: "equalsString",
    enableSorting: true,
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{row.original.segment_name ?? "—"}</span>
    ),
  },
  {
    accessorKey: "recency_days",
    header: ({ column }) => <SortableHeader label="Recency (days)" column={column} />,
    cell: ({ row }) => (
      <span className="text-sm tabular-nums">{row.original.recency_days ?? "—"}</span>
    ),
  },
  {
    accessorKey: "frequency",
    header: ({ column }) => <SortableHeader label="Frequency" column={column} />,
    cell: ({ row }) => (
      <span className="text-sm tabular-nums">{row.original.frequency ?? "—"}</span>
    ),
  },
  {
    accessorKey: "monetary_total",
    header: ({ column }) => <SortableHeader label="Monetary (₺)" column={column} />,
    cell: ({ row }) => (
      <span className="text-sm tabular-nums">
        {row.original.monetary_total != null
          ? `₺${row.original.monetary_total.toLocaleString("tr-TR")}`
          : "—"}
      </span>
    ),
  },
  {
    accessorKey: "predicted_clv_90d",
    header: ({ column }) => <SortableMlHeader label="CLV 90d (₺)" field="predicted_clv_90d" column={column} />,
    cell: ({ row }) => (
      <span className="text-sm tabular-nums">
        {row.original.predicted_clv_90d != null
          ? `₺${row.original.predicted_clv_90d.toLocaleString("tr-TR")}`
          : "—"}
      </span>
    ),
  },
];
