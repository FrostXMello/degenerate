import { cn } from "@/lib/format";
import type { StockLevel } from "@/lib/stock-math";

const copy: Record<StockLevel, { label: string; className: string; dot: string }> = {
  HEALTHY: { label: "Healthy", className: "text-emerald-300", dot: "bg-emerald-400" },
  LOW: { label: "Low", className: "text-amber-300", dot: "bg-amber-400" },
  VERY_LOW: { label: "Very low", className: "text-orange-300", dot: "bg-orange-400" },
  OUT: { label: "Out", className: "text-red-300", dot: "bg-red-500" },
  EXCEEDED: { label: "Estimate exceeded", className: "text-red-200", dot: "bg-red-500" },
};

export function StockBadge({ level, compact = false }: { level: StockLevel; compact?: boolean }) {
  const item = copy[level];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", item.className)}>
      <span className={cn("h-2 w-2 rounded-full", item.dot)} />
      {compact ? null : item.label}
    </span>
  );
}
