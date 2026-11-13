import type {
  AuthResponse,
  Category,
  CategoryInput,
  Expense,
  ExpenseInput,
  Paginated,
  RecurringExpense,
  RecurringInput,
  RegisterResponse,
  Summary,
  TodayResponse,
  TrendResponse,
} from "./types";

const TOKEN_KEY = "expense-tracker.token";
const USERNAME_KEY = "expense-tracker.username";

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string, username: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USERNAME_KEY, username);
    } catch {}
  },
  username(): string | null {
    try {
      return localStorage.getItem(USERNAME_KEY);
    } catch {
      return null;
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USERNAME_KEY);
    } catch {}
  },
};

/** Error from the API. `fields` holds per-field messages from DRF validation. */
export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;

  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

/** Fired when the server rejects our token, so the auth provider can sign out. */
export const UNAUTHORIZED_EVENT = "expense-tracker:unauthorized";

function flatten(value: unknown): string {
  if (Array.isArray(value)) return value.map(flatten).join(" ");
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function parseError(status: number, body: unknown): ApiError {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const obj = body as Record<string, unknown>;
    if (typeof obj.detail === "string") return new ApiError(status, obj.detail);

    const fields: Record<string, string> = {};
    for (const [key, val] of Object.entries(obj)) fields[key] = flatten(val);
    const message =
      fields.non_field_errors ?? Object.values(fields)[0] ?? `Request failed (${status})`;
    return new ApiError(status, message, fields);
  }
  return new ApiError(status, `Request failed (${status})`);
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const { method = "GET", body, auth = true } = options;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = tokenStore.get();
    if (token) headers.Authorization = `Token ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Is the backend running?");
  }

  if (res.status === 204) return undefined as T;

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON body (e.g. a proxy error page)
  }

  if (!res.ok) {
    if (res.status === 401 && auth && typeof window !== "undefined") {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw parseError(res.status, data);
  }
  return data as T;
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export interface ExpenseFilters {
  month?: string;
  start_date?: string;
  end_date?: string;
  category?: string;
  payment_method?: string;
  search?: string;
  ordering?: string;
}

/** Downloads the filtered expenses as CSV. Returns the file contents and a suggested name. */
async function exportExpenses(filters: ExpenseFilters): Promise<{ blob: Blob; filename: string }> {
  const token = tokenStore.get();
  let res: Response;
  try {
    // "*/*" rather than "application/json": this endpoint answers with text/csv.
    res = await fetch(`/api/expenses/export/${qs({ ...filters })}`, {
      headers: { Accept: "*/*", ...(token ? { Authorization: `Token ${token}` } : {}) },
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Is the backend running?");
  }
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {}
    throw parseError(res.status, body);
  }
  return { blob: await res.blob(), filename: "expenses.csv" };
}

/** The backend paginates lists at 20 per page; some screens want every row. */
async function fetchAllPages<T>(path: string): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; ; page += 1) {
    const data = await request<Paginated<T>>(`${path}${qs({ page })}`);
    all.push(...data.results);
    if (!data.next) return all;
  }
}

export const api = {
  login: (username: string, password: string) =>
    request<AuthResponse>("/auth/login/", {
      method: "POST",
      body: { username, password },
      auth: false,
    }),
  register: (username: string, email: string, password: string) =>
    request<RegisterResponse>("/auth/register/", {
      method: "POST",
      body: { username, email, password },
      auth: false,
    }),
  logout: () => request<void>("/auth/logout/", { method: "POST" }),

  listCategories: () => fetchAllPages<Category>("/categories/"),
  createCategory: (input: CategoryInput) =>
    request<Category>("/categories/", { method: "POST", body: input }),
  updateCategory: (id: number, input: CategoryInput) =>
    request<Category>(`/categories/${id}/`, { method: "PUT", body: input }),
  deleteCategory: (id: number) => request<void>(`/categories/${id}/`, { method: "DELETE" }),

  listExpenses: (filters: ExpenseFilters & { page?: number }) =>
    request<Paginated<Expense>>(`/expenses/${qs({ ...filters })}`),
  createExpense: (input: ExpenseInput) =>
    request<Expense>("/expenses/", { method: "POST", body: input }),
  updateExpense: (id: number, input: ExpenseInput) =>
    request<Expense>(`/expenses/${id}/`, { method: "PUT", body: input }),
  deleteExpense: (id: number) => request<void>(`/expenses/${id}/`, { method: "DELETE" }),
  summary: (filters: ExpenseFilters) => request<Summary>(`/expenses/summary/${qs({ ...filters })}`),
  today: () => request<TodayResponse>("/expenses/today/"),
  trend: (months: number) => request<TrendResponse>(`/expenses/trend/${qs({ months })}`),
  exportExpenses,

  listRecurring: () => fetchAllPages<RecurringExpense>("/recurring/"),
  createRecurring: (input: RecurringInput) =>
    request<RecurringExpense>("/recurring/", { method: "POST", body: input }),
  updateRecurring: (id: number, input: RecurringInput) =>
    request<RecurringExpense>(`/recurring/${id}/`, { method: "PUT", body: input }),
  /** Partial update; used for pausing/resuming without resending the whole rule. */
  setRecurringActive: (id: number, is_active: boolean) =>
    request<RecurringExpense>(`/recurring/${id}/`, { method: "PATCH", body: { is_active } }),
  deleteRecurring: (id: number) => request<void>(`/recurring/${id}/`, { method: "DELETE" }),
  /** Creates expenses for every due occurrence. Safe to call repeatedly. */
  processRecurring: () => request<{ created: number }>("/recurring/process/", { method: "POST" }),
};
