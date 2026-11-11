# Daily Expense Tracker

Log everyday spending, group it into categories with monthly budgets, and see daily and monthly summaries.

| Folder | What | Stack |
|---|---|---|
| [`backend/`](backend/) | REST API | Django + Django REST Framework (SQLite) |
| [`frontend/`](frontend/) | Web app | Next.js (App Router), TypeScript, Tailwind, [shadcn/ui](https://ui.shadcn.com) |

## Run it locally

You need both running. Use two terminals.

**1. Backend** (http://127.0.0.1:8000)

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1        # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

**2. Frontend** (http://localhost:3000)

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:3000, create an account, and you're in.

## How the two talk

The browser only ever calls the frontend's own `/api/*`. Next.js proxies those requests to Django (see `rewrites` in [`frontend/next.config.ts`](frontend/next.config.ts)), so the backend needs no CORS configuration.

The proxy target defaults to `http://127.0.0.1:8000`. To point at a different backend, set `BACKEND_URL` before starting the frontend:

```powershell
$env:BACKEND_URL = "http://127.0.0.1:9000"; npm run dev
```

The auth token is kept in `localStorage` and sent as `Authorization: Token <token>`.

## Frontend pages

| Route | What |
|---|---|
| `/login`, `/register` | Sign in / create an account |
| `/` | Dashboard: totals, category budgets (with over-budget warnings), payment-method split, today's expenses, month picker |
| `/expenses` | Search and filter by month, category and payment method; add, edit, delete; pagination |
| `/categories` | Create, edit and delete categories and their monthly budgets |

## Tests and checks

```powershell
cd backend;  python manage.py test
cd frontend; npm run lint; npm run build
```

API reference: [`backend/README.md`](backend/README.md).
