"use client";
"use no memo";

import * as React from "react";

import {
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { ChevronDownIcon, Download, ListFilter } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { churnColumns } from "./churn-table/columns";
import { churnCustomersSchema, type ChurnCustomerRow } from "./churn-table/schema";
import { fetchCustomerList } from "@/lib/api";

const riskOptions = ["all", "high", "medium", "low"] as const;
const segmentOptions = ["all", "Premium Buyer", "Casual Buyer", "Loyal Frequent Buyer"] as const;
const pageSizeOptions = [10, 25, 50, 100] as const;

// Fetch semua data dengan batching supaya tidak timeout
const BATCH_SIZE = 1000;

function preventNav(event: React.MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
}

export function ChurnCustomersSection() {
  const [customers, setCustomers] = React.useState<ChurnCustomerRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [rowSelection, setRowSelection] = React.useState({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility] = React.useState<VisibilityState>({ search: false });
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "churn_probability", desc: true },
  ]);
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  // Fetch semua data dengan batching
  React.useEffect(() => {
    const controller = new AbortController();

    async function fetchAllCustomers() {
      setIsLoading(true);
      setError(null);
      try {
        const allData: ChurnCustomerRow[] = [];
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          const batch = await fetchCustomerList(
            undefined,
            BATCH_SIZE,
            offset,
            controller.signal
          );
          const parsed = churnCustomersSchema.parse(batch);
          allData.push(...parsed);

          // Kalau hasil batch < BATCH_SIZE, berarti sudah habis
          if (parsed.length < BATCH_SIZE) {
            hasMore = false;
          } else {
            offset += BATCH_SIZE;
          }
        }

        setCustomers(allData);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load customers");
      } finally {
        setIsLoading(false);
      }
    }

    fetchAllCustomers();
    return () => controller.abort();
  }, []);

  const table = useReactTable({
    data: customers,
    columns: churnColumns,
    state: { rowSelection, columnFilters, columnVisibility, globalFilter, sorting, pagination },
    getRowId: (row) => row.customer_id,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: "includesString",
  });

  const searchQuery = table.getState().globalFilter ?? "";
  const riskFilter = (table.getColumn("risk_segment")?.getFilterValue() as string) ?? "all";
  const segmentFilter = (table.getColumn("segment_name")?.getFilterValue() as string) ?? "all";
  const currentPage = table.getState().pagination.pageIndex + 1;
  const pageCount = table.getPageCount();
  const filteredCount = table.getFilteredRowModel().rows.length;
  const visibleCount = table.getRowModel().rows.length;

  const pageNumbers = React.useMemo(() => {
    if (pageCount <= 3) return Array.from({ length: pageCount }, (_, i) => i + 1);
    if (currentPage <= 2) return [1, 2, 3];
    if (currentPage >= pageCount - 1) return [pageCount - 2, pageCount - 1, pageCount];
    return [currentPage - 1, currentPage, currentPage + 1];
  }, [currentPage, pageCount]);

  const highRiskSelected = table
    .getSelectedRowModel()
    .rows.filter((r) => r.original.risk_segment === "high").length;

  return (
    <section>
      <Card>
        <CardHeader>
          <CardTitle className="leading-none">Detail Customer List</CardTitle>
          <CardDescription>
            Full customer breakdown by churn risk, segments, and RFM scores.
          </CardDescription>
          <CardAction>
            <div className="flex items-center gap-2">
              <Input
                className="h-7 w-44 md:w-52"
                placeholder="Search customers..."
                value={searchQuery}
                onChange={(e) => {
                  table.setGlobalFilter(e.target.value || undefined);
                  table.setPageIndex(0);
                }}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <ListFilter data-icon="inline-start" />
                    {riskFilter === "all" ? "Risk" : riskFilter.charAt(0).toUpperCase() + riskFilter.slice(1)}
                    <ChevronDownIcon data-icon="inline-end" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuRadioGroup
                    value={riskFilter}
                    onValueChange={(value) => {
                      table.getColumn("risk_segment")?.setFilterValue(value === "all" ? undefined : value);
                      table.setPageIndex(0);
                    }}
                  >
                    {riskOptions.map((opt) => (
                      <DropdownMenuRadioItem key={opt} value={opt}>
                        {opt === "all" ? "All risk levels" : opt.charAt(0).toUpperCase() + opt.slice(1)}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <ListFilter data-icon="inline-start" />
                    {segmentFilter === "all" ? "Segment" : segmentFilter}
                    <ChevronDownIcon data-icon="inline-end" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuRadioGroup
                    value={segmentFilter}
                    onValueChange={(value) => {
                      table.getColumn("segment_name")?.setFilterValue(value === "all" ? undefined : value);
                      table.setPageIndex(0);
                    }}
                  >
                    {segmentOptions.map((opt) => (
                      <DropdownMenuRadioItem key={opt} value={opt}>
                        {opt === "all" ? "All segments" : opt}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="outline" size="sm">
                <Download />
                Export
              </Button>
            </div>
          </CardAction>
        </CardHeader>

        {highRiskSelected > 0 && (
          <div className="mx-6 mb-2 flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2">
            <span className="text-sm text-destructive font-medium">
              {highRiskSelected} high-risk customer{highRiskSelected > 1 ? "s" : ""} selected
            </span>
            <Button size="sm" variant="destructive">
              Trigger Retention Action
            </Button>
          </div>
        )}

        <CardContent className="flex flex-col gap-4 px-0">
          {/* Loading state */}
          {isLoading && (
            <div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
              Loading customers...
            </div>
          )}

          {/* Error state */}
          {error && !isLoading && (
            <div className="mx-6 flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
              <span className="text-sm text-destructive">{error}</span>
              <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
                Retry
              </Button>
            </div>
          )}

          {/* Table */}
          {!isLoading && !error && (
            <div className="overflow-hidden">
              <Table className="**:data-[slot='table-cell']:px-4 **:data-[slot='table-head']:px-4 **:data-[slot='table-cell']:py-4">
                <TableHeader className="border-t **:data-[slot='table-head']:h-11 **:data-[slot='table-head']:font-medium **:data-[slot='table-head']:text-foreground **:data-[slot='table-head']:text-sm">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead key={header.id} colSpan={header.colSpan}>
                          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody className="**:data-[slot='table-row']:border-border/50 **:data-[slot='table-row']:hover:bg-transparent">
                  {table.getRowModel().rows.length ? (
                    table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={churnColumns.length} className="h-24 text-center">
                        No results.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Footer: rows per page + pagination */}
          <div className="flex items-center justify-between gap-4 px-4 pb-1">
            <div className="flex items-center gap-3">
              <p className="text-muted-foreground text-sm">
                Viewing {visibleCount} out of {filteredCount.toLocaleString()} customers
              </p>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground text-sm whitespace-nowrap">Rows per page</span>
                <Select
                  value={String(pagination.pageSize)}
                  onValueChange={(value) => {
                    table.setPageSize(Number(value));
                    table.setPageIndex(0);
                  }}
                >
                  <SelectTrigger className="h-7 w-20 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pageSizeOptions.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent className="gap-1.5">
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    className={!table.getCanPreviousPage() ? "pointer-events-none opacity-50" : undefined}
                    onClick={(e) => { preventNav(e); table.previousPage(); }}
                  />
                </PaginationItem>
                {pageNumbers[0] > 1 && <PaginationItem><PaginationEllipsis /></PaginationItem>}
                {pageNumbers.map((n) => (
                  <PaginationItem key={n}>
                    <PaginationLink
                      href="#"
                      isActive={table.getState().pagination.pageIndex === n - 1}
                      onClick={(e) => { preventNav(e); table.setPageIndex(n - 1); }}
                    >
                      {n}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                {pageNumbers[pageNumbers.length - 1] < pageCount && <PaginationItem><PaginationEllipsis /></PaginationItem>}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    className={!table.getCanNextPage() ? "pointer-events-none opacity-50" : undefined}
                    onClick={(e) => { preventNav(e); table.nextPage(); }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
