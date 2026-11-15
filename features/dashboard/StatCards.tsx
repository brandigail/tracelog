import { formatPercent } from "@/lib/client/format";
import type { StatsResponse } from "@/types";

export function StatCards({ stats, rangeLabel }: { stats: StatsResponse | null; rangeLabel: string }) {
  const t = stats?.totals;
  const cards = [
    { label: "Logs", value: t ? t.total.toLocaleString("en-GB") : "–", tone: "" },
    { label: "Errors", value: t ? t.ERROR.toLocaleString("en-GB") : "–", tone: "text-error" },
    { label: "Warnings", value: t ? t.WARN.toLocaleString("en-GB") : "–", tone: "text-warn" },
    { label: "Error rate", value: t ? formatPercent(t.ERROR, t.total) : "–", tone: t && t.total > 0 && t.ERROR / t.total > 0.1 ? "text-error" : "" },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label={`Totals for ${rangeLabel}`}>
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-border bg-surface p-3">
          <dt className="text-xs font-medium text-muted">
            {c.label} <span className="font-normal">({rangeLabel})</span>
          </dt>
          <dd className={`mt-1 text-2xl font-bold tabular-nums ${c.tone}`}>{c.value}</dd>
        </div>
      ))}
    </dl>
  );
}
