import type {
  AuthResponse,
  Category,
  CategoryInput,
  Expense,
  ExpenseInput,
  Paginated,
  RegisterResponse,
  Summary,
  TodayResponse,
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

  // The backend paginates categories at 20 per page; the UI wants them all.
  async listCategories(): Promise<Category[]> {
    const all: Category[] = [];
    let page = 1;
    for (;;) {
      const data = await request<Paginated<Category>>(`/categories/${qs({ page })}`);
      all.push(...data.results);
      if (!data.next) return all;
      page += 1;
    }
  },
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
  summary: (filters: ExpenseFilters) =>
    request<Summary>(`/expenses/summary/${qs({ ...filters })}`),
  today: () => request<TodayResponse>("/expenses/today/"),
};
