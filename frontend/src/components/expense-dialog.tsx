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
import { useCategories, useInvalidateExpenseData } from "@/lib/queries";
import { PAYMENT_METHODS, type Expense, type PaymentMethod } from "@/lib/types";

const NO_CATEGORY = "none";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass an expense to edit it; omit to create a new one. */
  expense?: Expense | null;
  /** Prefill a new expense from an existing one (the date resets to today). Ignored when editing. */
  template?: Expense | null;
}

export function ExpenseDialog({ open, onOpenChange, expense, template }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Mounted only while open, so the form resets (and "today" is fresh) each time. */}
        <ExpenseForm expense={expense} template={template} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ExpenseForm({
  expense,
  template,
  onDone,
}: {
  expense?: Expense | null;
  template?: Expense | null;
  onDone: () => void;
}) {
  const editing = !!expense;
  // Fields start from the expense being edited, or from the one being duplicated.
  const source = expense ?? template;
  const { data: categories = [] } = useCategories();
  const invalidate = useInvalidateExpenseData();

  const [title, setTitle] = useState(source?.title ?? "");
  const [amount, setAmount] = useState(source?.amount ?? "");
  const [date, setDate] = useState(() => expense?.date ?? todayISO());
  const [category, setCategory] = useState(
    source?.category ? String(source.category) : NO_CATEGORY,
  );
  const [method, setMethod] = useState<PaymentMethod>(source?.payment_method ?? "cash");
  const [notes, setNotes] = useState(source?.notes ?? "");
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
    mutationFn: () => {
      const input = {
        title: title.trim(),
        amount: amount.trim(),
        date,
        category: category === NO_CATEGORY ? null : Number(category),
        payment_method: method,
        notes: notes.trim(),
      };
      return expense ? api.updateExpense(expense.id, input) : api.createExpense(input);
    },
    onSuccess: async () => {
      await invalidate();
      toast.success(editing ? "Expense updated" : "Expense added");
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

  const canSubmit = title.trim() !== "" && amount.trim() !== "" && date !== "";

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
        <DialogTitle>{editing ? "Edit expense" : "Add expense"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "Update the details of this expense."
            : template
              ? `Copied from “${template.title}”. Change anything, then save.`
              : "Log something you spent money on."}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-1.5">
        <Label htmlFor="exp-title">Title</Label>
        <Input
          id="exp-title"
          value={title}
          maxLength={100}
          autoFocus
          placeholder="e.g. Lunch"
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={!!errors.title}
        />
        {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="exp-amount">Amount (₹)</Label>
          <Input
            id="exp-amount"
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
          <Label htmlFor="exp-date">Date</Label>
          <Input
            id="exp-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-invalid={!!errors.date}
          />
          {errors.date && <p className="text-xs text-destructive">{errors.date}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label>Category</Label>
          <Select items={categoryItems} value={category} onValueChange={(v) => v && setCategory(v)}>
            <SelectTrigger className="w-full">
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
            <SelectTrigger className="w-full">
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
        <Label htmlFor="exp-notes">Notes (optional)</Label>
        <Textarea
          id="exp-notes"
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
