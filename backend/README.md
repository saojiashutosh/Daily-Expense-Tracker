# Daily Expense Tracker API

The Django REST API for tracking everyday spending: log expenses, group them into categories with monthly budgets, and see daily or monthly summaries. The web app that uses it lives in [`../frontend`](../frontend); see the [root README](../README.md) for running both.

## Setup (Windows / PowerShell)

Run these from this `backend/` folder.

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser   # optional, for /admin/
python manage.py runserver
```

On macOS/Linux, activate with `source venv/bin/activate`.

Run tests: `python manage.py test`

## Authentication

Token-based. Register or log in to get a token, then send it on every request:

```
Authorization: Token <your-token>
```

## Endpoints

All endpoints are under `/api/`. Everything except register and login requires a token. Users only ever see their own data.

| Method | URL | Description |
|---|---|---|
| POST | `/api/auth/register/` | `username`, `email`, `password` → user + token |
| POST | `/api/auth/login/` | `username`, `password` → token |
| POST | `/api/auth/logout/` | Delete current token |
| GET/POST | `/api/categories/` | List / create categories (`name`, `monthly_budget`) |
| GET/PUT/PATCH/DELETE | `/api/categories/<id>/` | Manage one category |
| GET/POST | `/api/expenses/` | List / create expenses |
| GET/PUT/PATCH/DELETE | `/api/expenses/<id>/` | Manage one expense |
| GET | `/api/expenses/today/` | Today's expenses + total |
| GET | `/api/expenses/summary/` | Totals by category (with budget status), payment method and day (`by_day`); defaults to the current month |
| GET | `/api/expenses/trend/` | Monthly totals for the last N months (`?months=1..24`, default 6), oldest first, zero-filled |
| GET | `/api/expenses/export/` | Download expenses as CSV; accepts the same filters as the list |

### Expense fields

`title`, `amount`, `date` (YYYY-MM-DD, defaults to today), `category` (id, optional), `payment_method` (`cash`, `card`, `upi`, `net_banking`, `other`), `notes`.

### Filters (on `/api/expenses/` and `/api/expenses/summary/`)

- `?month=2026-11`
- `?start_date=2026-11-01&end_date=2026-11-15`
- `?category=3`
- `?payment_method=upi`
- `?search=coffee` (title or notes)
- `?ordering=-amount` (list and export only; one of `date`, `-date`, `amount`, `-amount`; default newest first)

CSV cells that start with `=`, `+`, `-` or `@` are prefixed with `'` so spreadsheet apps don't run them as formulas.

## Example

```bash
curl -X POST http://127.0.0.1:8000/api/auth/register/ -d "username=alice&password=Str0ngPass!23"
curl -X POST http://127.0.0.1:8000/api/categories/ -H "Authorization: Token <token>" -d "name=Food&monthly_budget=5000"
curl -X POST http://127.0.0.1:8000/api/expenses/ -H "Authorization: Token <token>" -d "title=Lunch&amount=250&category=1&payment_method=upi"
curl http://127.0.0.1:8000/api/expenses/summary/ -H "Authorization: Token <token>"
```

You can also browse the API in a browser at `http://127.0.0.1:8000/api/` (log in via `/admin/` first).
