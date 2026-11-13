"use client";

import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api";
import { todayISO } from "@/lib/format";
import { useCategories, useInvalidateExpenseData, useInvalidateRecurring } from "@/lib/queries";
import {
  FREQUENCIES,
  FREQUENCY_LABELS,
  PAYMENT_METHODS,
  type Frequency,
  type PaymentMethod,
  type RecurringExpense,
} from "@/lib/types";

const NO_CATEGORY = "none";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass a rule to edit it; omit to create a new one. */
  rule?: RecurringExpense | null;
}

export function RecurringDialog({ open, onOpenChange, rule }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Mounted only while open, so the form resets (and "today" is fresh) each time. */}
        <RecurringForm rule={rule} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function RecurringForm({ rule, onDone }: { rule?: RecurringExpense | null; onDone: () => void }) {
  const editing = !!rule;
  const { data: categories = [] } = useCategories();
  const invalidateRecurring = useInvalidateRecurring();
  const invalidateExpenses = useInvalidateExpenseData();

  const [title, setTitle] = useState(rule?.title ?? "");
  const [amount, setAmount] = useState(rule?.amount ?? "");
  const [frequency, setFrequency] = useState<Frequency>(rule?.frequency ?? "monthly");
  const [startDate, setStartDate] = useState(() => rule?.start_date ?? todayISO());
  const [category, setCategory] = useState(rule?.category ? String(rule.category) : NO_CATEGORY);
  const [method, setMethod] = useState<PaymentMethod>(rule?.payment_method ?? "cash");
  const [notes, setNotes] = useState(rule?.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const categoryItems = useMemo(
    () => ({
      [NO_CATEGORY]: "No category",
      ...Object.fromEntries(categories.map((c) => [String(c.id), c.name])),
    }),
    [categories],
  );
  const methodItems = useMemo(
    () => Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label])),
    [],
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const input = {
        title: title.trim(),
        amount: amount.trim(),
        category: category === NO_CATEGORY ? null : Number(category),
        payment_method: method,
        notes: notes.trim(),
        frequency,
        start_date: startDate,
        is_active: rule?.is_active ?? true,
      };
      const saved = rule
        ? await api.updateRecurring(rule.id, input)
        : await api.createRecurring(input);
      // A rule that starts today (or in the past) is due right away: create those expenses now
      // instead of making the user wait for the next app load.
      const { created } = await api.processRecurring();
      return { saved, created };
    },
    onSuccess: async ({ created }) => {
      await Promise.all([invalidateRecurring(), created > 0 ? invalidateExpenses() : null]);
      toast.success(editing ? "Recurring expense updated" : "Recurring expense created");
      if (created > 0) {
        toast.info(`Added ${created} expense${created === 1 ? "" : "s"} that were already due`);
      }
      onDone();
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        if (Object.keys(err.fields).length === 0) toast.error(err.message);
      } else {
        toast.error("Something went wrong");
      }
    },
  });

  const canSubmit = title.trim() !== "" && amount.trim() !== "" && startDate !== "";

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        mutation.mutate();
      }}
      className="grid gap-4"
    >
      <DialogHeader>
        <DialogTitle>{editing ? "Edit recurring expense" : "New recurring expense"}</DialogTitle>
        <DialogDescription>
          Rent, subscriptions and other bills that repeat. An expense is added automatically each
          time one comes due.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-1.5">
        <Label htmlFor="rec-title">Title</Label>
        <Input
          id="rec-title"
          value={title}
          maxLength={100}
          autoFocus
          placeholder="e.g. Netflix"
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={!!errors.title}
        />
        {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="rec-amount">Amount (₹)</Label>
          <Input
            id="rec-amount"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={!!errors.amount}
          />
          {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
        </div>
        <div className="grid gap-1.5">
          <Label>Repeats</Label>
          <Select
            items={FREQUENCY_LABELS}
            value={frequency}
            onValueChange={(v) => v && setFrequency(v as Frequency)}
          >
            <SelectTrigger className="w-full" aria-label="Repeats">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FREQUENCIES.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.frequency && <p className="text-xs text-destructive">{errors.frequency}</p>}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="rec-start">{editing ? "Started on" : "Starts on"}</Label>
        <Input
          id="rec-start"
          type="date"
          value={startDate}
          disabled={editing}
          onChange={(e) => setStartDate(e.target.value)}
          aria-invalid={!!errors.start_date}
        />
        {errors.start_date ? (
          <p className="text-xs text-destructive">{errors.start_date}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {editing
              ? "The start date can't be changed. Delete and recreate the rule to move it."
              : "A date in the past adds the occurrences you've missed since then."}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label>Category</Label>
          <Select items={categoryItems} value={category} onValueChange={(v) => v && setCategory(v)}>
            <SelectTrigger className="w-full" aria-label="Category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CATEGORY}>No category</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.category && <p className="text-xs text-destructive">{errors.category}</p>}
        </div>
        <div className="grid gap-1.5">
          <Label>Payment method</Label>
          <Select
            items={methodItems}
            value={method}
            onValueChange={(v) => v && setMethod(v as PaymentMethod)}
          >
            <SelectTrigger className="w-full" aria-label="Payment method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.payment_method && (
            <p className="text-xs text-destructive">{errors.payment_method}</p>
          )}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="rec-notes">Notes (optional)</Label>
        <Textarea
          id="rec-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={mutation.isPending || !canSubmit}>
          {mutation.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
