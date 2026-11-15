"use client";

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatClock } from "@/lib/client/format";
import type { StatsResponse } from "@/types";

export function TrafficChart({ stats }: { stats: StatsResponse }) {
  const data = stats.buckets.map((b) => ({ t: b.t, INFO: b.INFO, WARN: b.WARN, ERROR: b.ERROR }));
  const peak = stats.buckets.reduce((best, b) => (b.ERROR > best.ERROR ? b : best), stats.buckets[0] ?? { t: 0, INFO: 0, WARN: 0, ERROR: 0 });
  const description = `Stacked area chart of logs per bucket by severity. ${stats.totals.total} logs in total, ${stats.totals.ERROR} errors${peak.ERROR > 0 ? `, peaking at ${peak.ERROR} errors around ${formatClock(peak.t)}` : ""}.`;

  return (
    <div role="img" aria-label={description} className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="t" tickFormatter={formatClock} tick={{ fill: "var(--muted)", fontSize: 11 }} stroke="var(--border)" minTickGap={36} />
          <YAxis allowDecimals={false} tick={{ fill: "var(--muted)", fontSize: 11 }} stroke="var(--border)" />
          <Tooltip labelFormatter={(t) => formatClock(Number(t))} contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)" }} />
          <Legend wrapperStyle={{ color: "var(--muted)", fontSize: 12 }} />
          <Area type="monotone" dataKey="INFO" stackId="1" stroke="var(--info)" fill="var(--info)" fillOpacity={0.35} isAnimationActive={false} />
          <Area type="monotone" dataKey="WARN" stackId="1" stroke="var(--warn)" fill="var(--warn)" fillOpacity={0.55} isAnimationActive={false} />
          <Area type="monotone" dataKey="ERROR" stackId="1" stroke="var(--error)" fill="var(--error)" fillOpacity={0.8} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
