"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
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
import { ApiError, api } from "@/lib/api";
import { useInvalidateCategoryData } from "@/lib/queries";
import type { Category } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass a category to edit it; omit to create a new one. */
  category?: Category | null;
}

export function CategoryDialog({ open, onOpenChange, category }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Mounted only while open, so the form's state resets every time. */}
        <CategoryForm category={category} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CategoryForm({ category, onDone }: { category?: Category | null; onDone: () => void }) {
  const editing = !!category;
  const [name, setName] = useState(category?.name ?? "");
  const [budget, setBudget] = useState(category?.monthly_budget ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const invalidate = useInvalidateCategoryData();

  const mutation = useMutation({
    mutationFn: () => {
      const input = { name: name.trim(), monthly_budget: budget.trim() === "" ? null : budget.trim() };
      return category ? api.updateCategory(category.id, input) : api.createCategory(input);
    },
    onSuccess: async () => {
      await invalidate();
      toast.success(editing ? "Category updated" : "Category created");
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
        <DialogTitle>{editing ? "Edit category" : "New category"}</DialogTitle>
        <DialogDescription>
          Categories group your expenses. Add a monthly budget to get warned when you overspend.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-1.5">
        <Label htmlFor="cat-name">Name</Label>
        <Input
          id="cat-name"
          value={name}
          maxLength={50}
          autoFocus
          placeholder="e.g. Food"
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!!errors.name}
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="cat-budget">Monthly budget (optional)</Label>
        <Input
          id="cat-budget"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          placeholder="e.g. 5000"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          aria-invalid={!!errors.monthly_budget}
        />
        {errors.monthly_budget && <p className="text-xs text-destructive">{errors.monthly_budget}</p>}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={mutation.isPending || !name.trim()}>
          {mutation.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
