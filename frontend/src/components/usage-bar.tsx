import { cn } from "@/lib/utils";

interface UsageBarProps {
  /** 0–100+ (values over 100 are clamped visually) */
  percent: number;
  tone?: "default" | "warning" | "danger" | "muted";
  label: string;
  className?: string;
}

const TONES = {
  default: "bg-primary",
  warning: "bg-amber-500",
  danger: "bg-destructive",
  muted: "bg-muted-foreground/40",
} as const;

export function UsageBar({ percent, tone = "default", label, className }: UsageBarProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className={cn("h-full rounded-full transition-all", TONES[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
