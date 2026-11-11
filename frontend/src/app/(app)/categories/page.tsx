"use client";

import { useMutation } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CategoryDialog } from "@/components/category-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
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
import { formatMoney } from "@/lib/format";
import { useCategories, useInvalidateCategoryData } from "@/lib/queries";
import type { Category } from "@/lib/types";

export default function CategoriesPage() {
  const categories = useCategories();
  const invalidate = useInvalidateCategoryData();

  const [editing, setEditing] = useState<Category | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const removeMutation = useMutation({
    mutationFn: (id: number) => api.deleteCategory(id),
    onSuccess: async () => {
      await invalidate();
      toast.success("Category deleted");
      setDeleting(null);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
          <p className="text-sm text-muted-foreground">
            Group your expenses and set an optional monthly budget for each.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <PlusIcon /> New category
        </Button>
      </div>

      {categories.error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {categories.error.message}
        </p>
      )}

      <Card>
        <CardContent className="px-0">
          {categories.isPending ? (
            <div className="grid gap-2 px-4">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : categories.data && categories.data.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No categories yet. Create one like “Food” or “Travel” to organise your spending.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Monthly budget</TableHead>
                  <TableHead className="w-20">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.data?.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.monthly_budget === null ? (
                        <span className="text-muted-foreground">No budget</span>
                      ) : (
                        formatMoney(c.monthly_budget)
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${c.name}`}
                          onClick={() => {
                            setEditing(c);
                            setDialogOpen(true);
                          }}
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${c.name}`}
                          onClick={() => setDeleting(c)}
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

      <CategoryDialog open={dialogOpen} onOpenChange={setDialogOpen} category={editing} />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete category?"
        description={
          deleting
            ? `“${deleting.name}” will be removed. Expenses in it are kept but become uncategorised.`
            : ""
        }
        pending={removeMutation.isPending}
        onConfirm={() => deleting && removeMutation.mutate(deleting.id)}
      />
    </div>
  );
}
