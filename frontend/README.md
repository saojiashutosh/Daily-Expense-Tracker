# Expense Tracker: frontend

Next.js (App Router) + TypeScript + Tailwind + [shadcn/ui](https://ui.shadcn.com) (Base UI flavour). Talks to the Django API in [`../backend`](../backend).

```powershell
npm install
npm run dev      # http://localhost:3000  (start the backend on :8000 first)
npm run build    # production build
npm run lint
```

Requests to `/api/*` are proxied to Django by `rewrites` in `next.config.ts`. Set `BACKEND_URL` to use a backend other than `http://127.0.0.1:8000`.

## Layout

```
src/
  app/
    (auth)/login, register     public pages
    (app)/                     signed-in pages behind the AppShell guard
      page.tsx                 dashboard
      expenses/, categories/
  components/
    ui/                        shadcn components (generated; add more with `npx shadcn@latest add <name>`)
    *-dialog.tsx, app-shell.tsx, auth-form.tsx, ...
  lib/
    api.ts                     fetch client, token storage, DRF error parsing
    auth.tsx                   AuthProvider / useAuth
    queries.ts                 TanStack Query hooks + cache invalidation
    types.ts, format.ts
```

## Notes

- This project uses Next.js 16 with **Cache Components** enabled (see `next.config.ts`). Pages here are client components that fetch after mount, so don't read the clock (`new Date()`) during render; do it in effects or handlers (see `lib/format.ts`).
- Django routes end in `/` and reject POSTs without it, so `skipTrailingSlashRedirect` is on and the rewrite source/destination both end in `/`. Keep trailing slashes on every API path in `lib/api.ts`.
- `@/components/ui/*` are shadcn-managed; prefer wrapping them over editing them.
