"use client";

import { useQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ExpenseDialog } from "@/components/expense-dialog";
import { UsageBar } from "@/components/usage-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { currentMonth, formatMonth, formatMoney } from "@/lib/format";
import { useCategories } from "@/lib/queries";
import { PAYMENT_METHOD_LABELS } from "@/lib/types";

export default function DashboardPage() {
  // The clock is read after mount (not during render) so prerendering can't freeze "this month".
  const [month, setMonth] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMonth(currentMonth());
  }, []);

  const [addOpen, setAddOpen] = useState(false);

  const summary = useQuery({
    queryKey: ["summary", { month }],
    queryFn: () => api.summary({ month }),
    enabled: month !== "",
  });
  const today = useQuery({ queryKey: ["today"], queryFn: api.today });
  const categories = useCategories();

  const total = Number(summary.data?.total ?? 0);

  // The summary only lists categories that have spending; add budgeted ones with nothing spent yet.
  const categoryRows = useMemo(() => {
    const rows = (summary.data?.by_category ?? []).map((r) => ({
      key: String(r.category_id ?? "uncategorized"),
      name: r.category,
      spent: Number(r.total),
      budget: r.monthly_budget === null ? null : Number(r.monthly_budget),
      count: r.count,
    }));
    const seen = new Set(summary.data?.by_category.map((r) => r.category_id));
    for (const c of categories.data ?? []) {
      if (c.monthly_budget !== null && !seen.has(c.id)) {
        rows.push({
          key: String(c.id),
          name: c.name,
          spent: 0,
          budget: Number(c.monthly_budget),
          count: 0,
        });
      }
    }
    return rows;
  }, [summary.data, categories.data]);

  const error = summary.error ?? today.error;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {month ? `Your spending in ${formatMonth(month)}` : "Your spending this month"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="month"
            aria-label="Month"
            className="w-44"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
          />
          <Button onClick={() => setAddOpen(true)}>
            <PlusIcon /> Add expense
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total spent" loading={summary.isPending} value={formatMoney(total)} />
        <StatCard
          label="Expenses logged"
          loading={summary.isPending}
          value={String(summary.data?.count ?? 0)}
        />
        <StatCard
          label="Spent today"
          loading={today.isPending}
          value={formatMoney(today.data?.total ?? 0)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>By category</CardTitle>
            <CardDescription>Budgets show how much of each limit you&apos;ve used.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {summary.isPending ? (
              <Skeleton className="h-24 w-full" />
            ) : categoryRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No spending yet this month. Add an expense to get started.
              </p>
            ) : (
              categoryRows.map((row) => {
                const used = row.budget ? (row.spent / row.budget) * 100 : null;
                const over = row.budget !== null && row.spent > row.budget;
                return (
                  <div key={row.key} className="grid gap-1.5">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2 font-medium">
                        {row.name}
                        {over && <Badge variant="destructive">Over budget</Badge>}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatMoney(row.spent)}
                        {row.budget !== null && ` / ${formatMoney(row.budget)}`}
                      </span>
                    </div>
                    <UsageBar
                      label={`${row.name} spending`}
                      percent={used ?? (total > 0 ? (row.spent / total) * 100 : 0)}
                      tone={over ? "danger" : used !== null && used >= 80 ? "warning" : used === null ? "muted" : "default"}
                    />
                    <p className="text-xs text-muted-foreground">
                      {row.budget === null
                        ? `${total > 0 ? Math.round((row.spent / total) * 100) : 0}% of this month's spending · no budget set`
                        : over
                          ? `${formatMoney(row.spent - row.budget)} over budget`
                          : `${formatMoney(row.budget - row.spent)} left`}
                    </p>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By payment method</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {summary.isPending ? (
              <Skeleton className="h-24 w-full" />
            ) : (summary.data?.by_payment_method.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing to show yet.</p>
            ) : (
              summary.data?.by_payment_method.map((m) => (
                <div key={m.payment_method} className="grid gap-1.5">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium">
                      {PAYMENT_METHOD_LABELS[m.payment_method] ?? m.payment_method}
                    </span>
                    <span className="tabular-nums text-muted-foreground">{formatMoney(m.total)}</span>
                  </div>
                  <UsageBar
                    label={`${PAYMENT_METHOD_LABELS[m.payment_method] ?? m.payment_method} share`}
                    percent={total > 0 ? (Number(m.total) / total) * 100 : 0}
                  />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Today</CardTitle>
          <CardDescription>
            {today.data ? `${today.data.expenses.length} expense(s) · ${formatMoney(today.data.total)}` : " "}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {today.isPending ? (
            <Skeleton className="h-16 w-full" />
          ) : today.data && today.data.expenses.length > 0 ? (
            <ul className="divide-y">
              {today.data.expenses.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{e.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.category_name ?? "No category"} · {PAYMENT_METHOD_LABELS[e.payment_method]}
                    </p>
                  </div>
                  <span className="tabular-nums font-medium">{formatMoney(e.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing spent today.{" "}
              <Link href="/expenses" className="underline underline-offset-4">
                View all expenses
              </Link>
            </p>
          )}
        </CardContent>
      </Card>

      <ExpenseDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function StatCard({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        {loading ? (
          <Skeleton className="mt-1 h-8 w-28" />
        ) : (
          <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
        )}
      </CardHeader>
    </Card>
  );
}
