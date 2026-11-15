"use client";

import { Flame, Pause, Play, Radio, Search, Zap } from "lucide-react";
import type { Severity, Source } from "@/types";
import { SEVERITIES } from "@/types";

export const RANGES = [
  { minutes: 15, label: "15 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 360, label: "6 hours" },
  { minutes: 1440, label: "24 hours" },
];

const CHIP: Record<Severity, string> = {
  INFO: "border-info text-info",
  WARN: "border-warn text-warn",
  ERROR: "border-error text-error",
};

interface Props {
  sources: Source[];
  sourceId: string;
  onSource: (id: string) => void;
  minutes: number;
  onMinutes: (minutes: number) => void;
  severities: Severity[];
  onToggleSeverity: (severity: Severity) => void;
  query: string;
  onQuery: (query: string) => void;
  paused: boolean;
  onTogglePause: () => void;
  sending: boolean;
  onSimulate: (mode: "normal" | "errors") => void;
}

const control = "h-10 rounded-lg border border-border bg-surface px-3 text-sm";

export function Toolbar(p: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <span className="sr-only sm:not-sr-only">Source</span>
          <select value={p.sourceId} onChange={(e) => p.onSource(e.target.value)} className={control}>
            <option value="">All sources</option>
            {p.sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <span className="sr-only sm:not-sr-only">Range</span>
          <select value={p.minutes} onChange={(e) => p.onMinutes(Number(e.target.value))} className={control}>
            {RANGES.map((r) => (
              <option key={r.minutes} value={r.minutes}>
                Last {r.label}
              </option>
            ))}
          </select>
        </label>

        <div role="group" aria-label="Severity filter" className="flex gap-1">
          {SEVERITIES.map((s) => {
            const on = p.severities.includes(s);
            return (
              <button key={s} type="button" aria-pressed={on} onClick={() => p.onToggleSeverity(s)} className={`min-h-10 rounded-lg border px-3 font-mono text-xs font-bold transition-colors ${on ? `${CHIP[s]} bg-surface-muted` : "border-border text-muted opacity-60 hover:opacity-100"}`}>
                {s}
              </button>
            );
          })}
        </div>

        <button type="button" onClick={p.onTogglePause} aria-pressed={p.paused} className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors ${p.paused ? "border-warn bg-warn/10 text-warn" : "border-border hover:bg-surface-muted"}`}>
          {p.paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
          {p.paused ? "Resume" : "Pause"}
        </button>
        <span role="status" className={`inline-flex items-center gap-1.5 text-xs font-medium ${p.paused ? "text-warn" : "text-accent"}`}>
          <Radio className={`size-3.5 ${p.paused ? "" : "animate-pulse"}`} aria-hidden />
          {p.paused ? "Paused" : "Live"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-56 flex-1">
          <span className="sr-only">Search logs</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" value={p.query} onChange={(e) => p.onQuery(e.target.value)} maxLength={100} placeholder="Search messages and stack traces" className={`${control} w-full pl-9`} />
        </label>
        <button type="button" disabled={p.sending} onClick={() => p.onSimulate("normal")} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-muted disabled:opacity-60">
          <Zap className="size-4" aria-hidden /> Send traffic
        </button>
        <button type="button" disabled={p.sending} onClick={() => p.onSimulate("errors")} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-error px-3 text-sm font-medium text-error hover:bg-error/10 disabled:opacity-60">
          <Flame className="size-4" aria-hidden /> Simulate incident
        </button>
      </div>
    </div>
  );
}
