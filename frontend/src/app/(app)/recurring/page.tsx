"use client";

import { useMutation } from "@tanstack/react-query";
import { PauseIcon, PencilIcon, PlayIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RecurringDialog } from "@/components/recurring-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { formatDate, formatDateShort, formatMoney } from "@/lib/format";
import { useInvalidateRecurring, useRecurring } from "@/lib/queries";
import { FREQUENCY_LABELS, type RecurringExpense } from "@/lib/types";

export default function RecurringPage() {
  const rules = useRecurring();
  const invalidate = useInvalidateRecurring();

  const [editing, setEditing] = useState<RecurringExpense | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<RecurringExpense | null>(null);

  const toggleMutation = useMutation({
    mutationFn: (rule: RecurringExpense) => api.setRecurringActive(rule.id, !rule.is_active),
    onSuccess: async (rule) => {
      await invalidate();
      toast.success(rule.is_active ? `Resumed “${rule.title}”` : `Paused “${rule.title}”`);
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => api.deleteRecurring(id),
    onSuccess: async () => {
      await invalidate();
      toast.success("Recurring expense deleted");
      setDeleting(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const active = rules.data?.filter((r) => r.is_active) ?? [];
  // Rough monthly cost of what's active, to make the commitment visible.
  const monthlyCost = active.reduce((sum, r) => {
    const amount = Number(r.amount);
    return (
      sum +
      (r.frequency === "weekly"
        ? (amount * 52) / 12
        : r.frequency === "yearly"
          ? amount / 12
          : amount)
    );
  }, 0);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Recurring</h1>
          <p className="text-sm text-muted-foreground">
            {rules.data
              ? active.length > 0
                ? `${active.length} active · about ${formatMoney(monthlyCost)} per month`
                : "Bills and subscriptions that add themselves when they're due."
              : " "}
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <PlusIcon /> New recurring expense
        </Button>
      </div>

      {rules.error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {rules.error.message}
        </p>
      )}

      <Card>
        <CardContent className="px-0">
          {rules.isPending ? (
            <div className="grid gap-2 px-4">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rules.data && rules.data.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Nothing recurring yet. Add rent, a subscription or any bill that repeats and
              it&apos;ll be logged for you.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead className="hidden sm:table-cell">Repeats</TableHead>
                  <TableHead className="hidden sm:table-cell">Next due</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-28">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.data?.map((r) => (
                  <TableRow key={r.id} className={r.is_active ? undefined : "opacity-60"}>
                    <TableCell className="max-w-[14rem]">
                      <p className="truncate font-medium">{r.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {/* On phones the Repeats/Next due columns are hidden, so fold them in here. */}
                        <span className="sm:hidden">
                          {FREQUENCY_LABELS[r.frequency]} ·{" "}
                          {r.is_active ? `due ${formatDateShort(r.next_due)}` : "Paused"}
                        </span>
                        <span className="hidden sm:inline">{r.category_name ?? "No category"}</span>
                      </p>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {FREQUENCY_LABELS[r.frequency]}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap sm:table-cell">
                      {r.is_active ? (
                        formatDate(r.next_due)
                      ) : (
                        <Badge variant="secondary">Paused</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(r.amount)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${r.is_active ? "Pause" : "Resume"} ${r.title}`}
                          disabled={toggleMutation.isPending}
                          onClick={() => toggleMutation.mutate(r)}
                        >
                          {r.is_active ? <PauseIcon /> : <PlayIcon />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${r.title}`}
                          onClick={() => {
                            setEditing(r);
                            setDialogOpen(true);
                          }}
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${r.title}`}
                          onClick={() => setDeleting(r)}
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

      <RecurringDialog open={dialogOpen} onOpenChange={setDialogOpen} rule={editing} />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete recurring expense?"
        description={
          deleting
            ? `“${deleting.title}” will stop being added. Expenses it already created are kept.`
            : ""
        }
        pending={removeMutation.isPending}
        onConfirm={() => deleting && removeMutation.mutate(deleting.id)}
      />
    </div>
  );
}
