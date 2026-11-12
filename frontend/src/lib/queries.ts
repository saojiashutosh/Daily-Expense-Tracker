import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export function useCategories() {
  return useQuery({ queryKey: ["categories"], queryFn: api.listCategories });
}

/** Everything derived from expenses (lists, summaries, today) goes stale when one changes. */
export function useInvalidateExpenseData() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["expenses"] }),
      qc.invalidateQueries({ queryKey: ["summary"] }),
      qc.invalidateQueries({ queryKey: ["today"] }),
      qc.invalidateQueries({ queryKey: ["trend"] }),
    ]);
}

/** Categories carry budgets used in summaries, and deleting one un-categorizes its expenses. */
export function useInvalidateCategoryData() {
  const qc = useQueryClient();
  const invalidateExpenses = useInvalidateExpenseData();
  return () => Promise.all([qc.invalidateQueries({ queryKey: ["categories"] }), invalidateExpenses()]);
}
