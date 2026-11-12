"use client";

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ExpenseDialog } from "@/components/expense-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, api } from "@/lib/api";
import { formatDate, formatMonth, formatMoney } from "@/lib/format";
import { useCategories, useInvalidateExpenseData } from "@/lib/queries";
import { useDebounce } from "@/lib/use-debounce";
import {
  ORDERING_OPTIONS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type Expense,
  type Ordering,
} from "@/lib/types";

const ALL = "all";
const DEFAULT_ORDERING: Ordering = "-date";
const orderingItems = Object.fromEntries(ORDERING_OPTIONS.map((o) => [o.value, o.label]));
const PAGE_SIZE = 20; // matches PAGE_SIZE in the backend's REST_FRAMEWORK settings

export default function ExpensesPage() {
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [category, setCategory] = useState(ALL);
  const [method, setMethod] = useState(ALL);
  const [ordering, setOrdering] = useState<Ordering>(DEFAULT_ORDERING);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const [editing, setEditing] = useState<Expense | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<Expense | null>(null);

  const debouncedSearch = useDebounce(search.trim());
  const categories = useCategories();
  const invalidate = useInvalidateExpenseData();

  // What to show (used by the summary total); ordering only changes the list/export order.
  const filters = {
    search: debouncedSearch || undefined,
    month: month || undefined,
    start_date: startDate || undefined,
    end_date: endDate || undefined,
    category: category === ALL ? undefined : category,
    payment_method: method === ALL ? undefined : method,
  };
  const listFilters = {
    ...filters,
    ordering: ordering === DEFAULT_ORDERING ? undefined : ordering,
  };
  const hasFilters = Object.values(filters).some(Boolean) || search !== "";
  const hasPeriod = !!(month || startDate || endDate);

  const list = useQuery({
    queryKey: ["expenses", listFilters, page],
    queryFn: () => api.listExpenses({ ...listFilters, page }),
    placeholderData: keepPreviousData,
  });

  // The summary defaults to the current month when no period is sent, so only ask when one is chosen.
  const summary = useQuery({
    queryKey: ["summary", filters],
    queryFn: () => api.summary(filters),
    enabled: hasPeriod,
  });

  async function exportCsv() {
    setExporting(true);
    try {
      const { blob, filename } = await api.exportExpenses(listFilters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Exported expenses to CSV");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const removeMutation = useMutation({
    mutationFn: (id: number) => api.deleteExpense(id),
    onSuccess: async () => {
      await invalidate();
      toast.success("Expense deleted");
      setDeleting(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const categoryItems = useMemo(
    () => ({
      [ALL]: "All categories",
      ...Object.fromEntries((categories.data ?? []).map((c) => [String(c.id), c.name])),
    }),
    [categories.data],
  );
  const methodItems = useMemo(() => ({ [ALL]: "All methods", ...PAYMENT_METHOD_LABELS }), []);

  const count = list.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  // Deleting the last item on the last page makes that page number invalid (the API returns 404),
  // so step back one page.
  const pageGone = list.error instanceof ApiError && list.error.status === 404 && page > 1;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (pageGone) setPage((p) => Math.max(1, p - 1));
  }, [pageGone]);

  function changeFilter<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  // A month and a custom range would just intersect, which is confusing, so picking one clears the other.
  function pickMonth(v: string) {
    setMonth(v);
    if (v) {
      setStartDate("");
      setEndDate("");
    }
    setPage(1);
  }
  function pickStart(v: string) {
    setStartDate(v);
    if (v) setMonth("");
    setPage(1);
  }
  function pickEnd(v: string) {
    setEndDate(v);
    if (v) setMonth("");
    setPage(1);
  }

  function clearFilters() {
    setSearch("");
    setMonth("");
    setStartDate("");
    setEndDate("");
    setCategory(ALL);
    setMethod(ALL);
    setPage(1);
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
          <p className="text-sm text-muted-foreground">
            {list.data
              ? `${count} expense${count === 1 ? "" : "s"}${
                  month
                    ? ` in ${formatMonth(month)}`
                    : startDate || endDate
                      ? ` ${startDate ? `from ${formatDate(startDate)}` : ""}${startDate && endDate ? " " : ""}${endDate ? `to ${formatDate(endDate)}` : ""}`
                      : ""
                }${summary.data ? ` · ${formatMoney(summary.data.total)} total` : ""}`
              : " "}
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <PlusIcon /> Add expense
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto]">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search title or notes"
                aria-label="Search"
                className="pl-8"
                value={search}
                onChange={(e) => changeFilter(setSearch)(e.target.value)}
              />
            </div>
            <Input
              type="month"
              aria-label="Month"
              className="lg:w-44"
              value={month}
              onChange={(e) => pickMonth(e.target.value)}
            />
            <Select
              items={categoryItems}
              value={category}
              onValueChange={(v) => v && changeFilter(setCategory)(v)}
            >
              <SelectTrigger className="w-full lg:w-44" aria-label="Category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All categories</SelectItem>
                {(categories.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              items={methodItems}
              value={method}
              onValueChange={(v) => v && changeFilter(setMethod)(v)}
            >
              <SelectTrigger className="w-full lg:w-40" aria-label="Payment method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All methods</SelectItem>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1">
              <label htmlFor="start-date" className="text-xs text-muted-foreground">
                From
              </label>
              <Input
                id="start-date"
                type="date"
                className="w-40"
                value={startDate}
                max={endDate || undefined}
                onChange={(e) => pickStart(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <label htmlFor="end-date" className="text-xs text-muted-foreground">
                To
              </label>
              <Input
                id="end-date"
                type="date"
                className="w-40"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => pickEnd(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <span id="sort-label" className="text-xs text-muted-foreground">
                Sort by
              </span>
              <Select
                items={orderingItems}
                value={ordering}
                onValueChange={(v) => v && changeFilter(setOrdering)(v as Ordering)}
              >
                <SelectTrigger className="w-44" aria-labelledby="sort-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDERING_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" onClick={clearFilters} disabled={!hasFilters}>
                Clear
              </Button>
              <Button
                variant="outline"
                onClick={exportCsv}
                disabled={exporting || (list.data?.count ?? 0) === 0}
              >
                <DownloadIcon /> {exporting ? "Exporting…" : "Export CSV"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {list.error && !pageGone && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {list.error.message}
        </p>
      )}

      <Card>
        <CardContent className="px-0">
          {list.isPending ? (
            <div className="grid gap-2 px-4">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : list.data && list.data.results.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {hasFilters
                ? "No expenses match these filters."
                : "No expenses yet. Add your first one!"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="hidden md:table-cell">Category</TableHead>
                  <TableHead className="hidden md:table-cell">Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-20">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data?.results.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(e.date)}
                    </TableCell>
                    <TableCell className="max-w-[16rem]">
                      <p className="truncate font-medium">{e.title}</p>
                      {e.notes && (
                        <p className="truncate text-xs text-muted-foreground">{e.notes}</p>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {e.category_name ? (
                        <Badge variant="secondary">{e.category_name}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {PAYMENT_METHOD_LABELS[e.payment_method]}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(e.amount)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${e.title}`}
                          onClick={() => {
                            setEditing(e);
                            setDialogOpen(true);
                          }}
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${e.title}`}
                          onClick={() => setDeleting(e)}
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {count > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeftIcon /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next <ChevronRightIcon />
            </Button>
          </div>
        </div>
      )}

      <ExpenseDialog open={dialogOpen} onOpenChange={setDialogOpen} expense={editing} />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete expense?"
        description={
          deleting
            ? `“${deleting.title}” (${formatMoney(deleting.amount)}) will be permanently removed.`
            : ""
        }
        pending={removeMutation.isPending}
        onConfirm={() => deleting && removeMutation.mutate(deleting.id)}
      />
    </div>
  );
}
