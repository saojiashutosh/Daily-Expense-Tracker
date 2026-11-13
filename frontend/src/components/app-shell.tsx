"use client";

import {
  LayoutDashboardIcon,
  LogOutIcon,
  ReceiptIcon,
  RepeatIcon,
  TagsIcon,
  WalletIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useInvalidateExpenseData, useInvalidateRecurring } from "@/lib/queries";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/expenses", label: "Expenses", icon: ReceiptIcon },
  { href: "/recurring", label: "Recurring", icon: RepeatIcon },
  { href: "/categories", label: "Categories", icon: TagsIcon },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, isAuthenticated, username, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && !isAuthenticated) router.replace("/login");
  }, [ready, isAuthenticated, router]);

  // Recurring expenses that have come due are created when the app opens (no cron job needed).
  // Once per signed-in user; the endpoint is idempotent, so a repeat call would be harmless anyway.
  const invalidateExpenses = useInvalidateExpenseData();
  const invalidateRecurring = useInvalidateRecurring();
  const processedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !isAuthenticated || processedFor.current === username) return;
    processedFor.current = username;
    api
      .processRecurring()
      .then(({ created }) => {
        if (created > 0) {
          toast.info(`Added ${created} recurring expense${created === 1 ? "" : "s"} that came due`);
          invalidateExpenses();
        }
        invalidateRecurring();
      })
      .catch(() => {
        // Not critical: it'll be retried the next time the app opens.
      });
  }, [ready, isAuthenticated, username, invalidateExpenses, invalidateRecurring]);

  if (!ready || !isAuthenticated) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <WalletIcon className="size-5 text-primary" />
            <span className="hidden sm:inline">Expense Tracker</span>
          </Link>

          <nav className="flex items-center gap-1" aria-label="Main">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    buttonVariants({ variant: active ? "secondary" : "ghost", size: "sm" }),
                  )}
                >
                  <Icon />
                  <span className="hidden sm:inline">{label}</span>
                  <span className="sr-only sm:hidden">{label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger className={buttonVariants({ variant: "outline", size: "sm" })}>
                {username || "Account"}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Signed in as {username}</DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOutIcon />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
