import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface BarDatum {
  key: string;
  /** Short text under the bar (may be empty to keep the axis uncluttered) */
  label: string;
  value: number;
  /** Full description, used for the hover title and screen readers */
  description: string;
}

interface BarChartProps {
  data: BarDatum[];
  ariaLabel: string;
  /** Highlight one bar and fade the rest */
  selectedKey?: string;
  /** Makes the bars clickable */
  onSelect?: (key: string) => void;
  className?: string;
}

export function BarChart({ data, ariaLabel, selectedKey, onSelect, className }: BarChartProps) {
  const max = Math.max(0, ...data.map((d) => d.value));
  const hasSelection = selectedKey !== undefined && data.some((d) => d.key === selectedKey);

  return (
    <div className={cn("grid gap-1", className)} role="group" aria-label={ariaLabel}>
      <p className="text-xs text-muted-foreground tabular-nums">
        {max > 0 ? `Peak ${formatMoney(max)}` : "No spending in this period"}
      </p>
      <div className="flex h-36 items-end gap-px sm:gap-1">
        {data.map((d) => {
          const pct = max > 0 ? (d.value / max) * 100 : 0;
          const selected = d.key === selectedKey;
          const bar = (
            <span
              className={cn(
                "block w-full rounded-t-sm transition-all",
                d.value === 0
                  ? "bg-muted"
                  : selected || !hasSelection
                    ? "bg-primary"
                    : "bg-primary/40",
              )}
              style={{ height: d.value === 0 ? "2px" : `max(${pct}%, 3px)` }}
            />
          );
          const shared = "flex h-full min-w-0 flex-1 items-end";
          return onSelect ? (
            <button
              key={d.key}
              type="button"
              title={d.description}
              aria-label={d.description}
              aria-pressed={selected}
              onClick={() => onSelect(d.key)}
              className={cn(
                shared,
                "cursor-pointer rounded-sm outline-none hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50",
              )}
            >
              {bar}
            </button>
          ) : (
            <div
              key={d.key}
              title={d.description}
              aria-label={d.description}
              role="img"
              className={shared}
            >
              {bar}
            </div>
          );
        })}
      </div>
      <div className="flex gap-px text-[11px] text-muted-foreground sm:gap-1" aria-hidden>
        {data.map((d) => (
          <span key={d.key} className="min-w-0 flex-1 text-center tabular-nums">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
