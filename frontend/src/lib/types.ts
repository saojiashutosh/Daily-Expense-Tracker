export type PaymentMethod = "cash" | "card" | "upi" | "net_banking" | "other";

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "upi", label: "UPI" },
  { value: "net_banking", label: "Net Banking" },
  { value: "other", label: "Other" },
];

export const PAYMENT_METHOD_LABELS: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map((m) => [m.value, m.label]),
);

// DRF serializes DecimalFields as strings ("250.00").
export interface Category {
  id: number;
  name: string;
  monthly_budget: string | null;
}

export interface Expense {
  id: number;
  title: string;
  amount: string;
  date: string; // YYYY-MM-DD
  category: number | null;
  category_name: string | null;
  payment_method: PaymentMethod;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface CategorySummary {
  category_id: number | null;
  category: string;
  total: string;
  count: number;
  monthly_budget: string | null;
  remaining_budget: string | null;
  over_budget: boolean;
}

export interface PaymentMethodSummary {
  payment_method: PaymentMethod;
  total: string;
  count: number;
}

export interface DaySummary {
  date: string; // YYYY-MM-DD
  total: string;
}

export interface Summary {
  total: string | number;
  count: number;
  by_category: CategorySummary[];
  by_payment_method: PaymentMethodSummary[];
  by_day: DaySummary[];
}

export interface MonthTrend {
  month: string; // YYYY-MM
  total: string | number;
  count: number;
}

export interface TrendResponse {
  months: MonthTrend[];
}

export type Ordering = "-date" | "date" | "-amount" | "amount";

export const ORDERING_OPTIONS: { value: Ordering; label: string }[] = [
  { value: "-date", label: "Newest first" },
  { value: "date", label: "Oldest first" },
  { value: "-amount", label: "Highest amount" },
  { value: "amount", label: "Lowest amount" },
];

export interface TodayResponse {
  date: string;
  total: string | number;
  expenses: Expense[];
}

export interface AuthResponse {
  token: string;
}

export interface RegisterResponse {
  user: { id: number; username: string; email: string };
  token: string;
}

export interface ExpenseInput {
  title: string;
  amount: string;
  date: string;
  category: number | null;
  payment_method: PaymentMethod;
  notes: string;
}

export interface CategoryInput {
  name: string;
  monthly_budget: string | null;
}
