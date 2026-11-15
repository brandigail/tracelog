"use client";

import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { call } from "@/lib/client/http";
import type { LogEntry, Severity, Source } from "@/types";
import { SEVERITIES } from "@/types";
import { useDebounced, useLogStream, useStats } from "./hooks";
import { LogDrawer } from "./LogDrawer";
import { LogList } from "./LogList";
import { StatCards } from "./StatCards";
import { RANGES, Toolbar } from "./Toolbar";

// The chart library is the biggest dependency, so it loads after the numbers and the list have rendered.
const TrafficChart = lazy(() => import("./TrafficChart").then((m) => ({ default: m.TrafficChart })));

export function Dashboard() {
  const [sources, setSources] = useState<Source[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [severities, setSeverities] = useState<Severity[]>([...SEVERITIES]);
  const [query, setQuery] = useState("");
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<LogEntry | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [kick, setKick] = useState(0);

  const debouncedQuery = useDebounced(query.trim(), 300);
  const stream = useLogStream({ sourceId, severities, q: debouncedQuery }, paused);
  const { stats, error: statsError } = useStats(sourceId, minutes, paused, kick);

  useEffect(() => {
    call<{ sources: Source[] }>("/api/sources")
      .then((res) => setSources(res.sources))
      .catch(() => setSources([]));
  }, []);

  function toggleSeverity(severity: Severity) {
    setSeverities((current) => (current.includes(severity) ? current.filter((s) => s !== severity) : [...current, severity]));
  }

  const simulate = useCallback(
    async (mode: "normal" | "errors") => {
      setSending(true);
      setNotice(null);
      try {
        const res = await call<{ accepted: number; alertsFired: number }>("/api/simulate", "POST", { mode });
        setNotice({ kind: "ok", text: `Sent ${res.accepted} logs${res.alertsFired ? ` and fired ${res.alertsFired} alert${res.alertsFired === 1 ? "" : "s"}` : ""}.` });
        setPaused(false);
        stream.refresh();
        setKick((k) => k + 1);
      } catch (error) {
        setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not send traffic." });
      } finally {
        setSending(false);
      }
    },
    [stream],
  );

  const rangeLabel = RANGES.find((r) => r.minutes === minutes)?.label ?? `${minutes} min`;
  const filtering = Boolean(debouncedQuery) || severities.length < SEVERITIES.length;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-4 px-4 py-4">
      <h1 className="sr-only">Logs</h1>
      <Toolbar
        sources={sources}
        sourceId={sourceId}
        onSource={setSourceId}
        minutes={minutes}
        onMinutes={setMinutes}
        severities={severities}
        onToggleSeverity={toggleSeverity}
        query={query}
        onQuery={setQuery}
        paused={paused}
        onTogglePause={() => setPaused((p) => !p)}
        sending={sending}
        onSimulate={(mode) => void simulate(mode)}
      />

      {notice && (
        <p role={notice.kind === "error" ? "alert" : "status"} className={`text-sm font-medium ${notice.kind === "error" ? "text-error" : "text-accent"}`}>
          {notice.text}
        </p>
      )}

      <StatCards stats={stats} rangeLabel={rangeLabel} />

      <section aria-labelledby="traffic" className="rounded-2xl border border-border bg-surface p-4">
        <h2 id="traffic" className="mb-2 text-sm font-semibold">
          Logs over time
        </h2>
        {stats ? (
          <Suspense fallback={<div className="h-64" />}>
            <TrafficChart stats={stats} />
          </Suspense>
        ) : (
          <p className="flex h-64 items-center justify-center text-sm text-muted">{statsError ? "Could not load the chart." : "Loading…"}</p>
        )}
      </section>

      <section aria-labelledby="stream" className="overflow-hidden rounded-2xl border border-border bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <h2 id="stream" className="text-sm font-semibold">
            Log stream
          </h2>
          <p className="text-xs text-muted" aria-live="polite">
            {stream.status === "ready" ? `${stream.logs.length} shown${stream.hasOlder ? " (more below)" : ""}${filtering ? ", filtered" : ""}` : ""}
          </p>
        </header>
        {stream.status === "loading" && <p className="p-6 text-sm text-muted">Loading logs…</p>}
        {stream.status === "error" && (
          <p role="alert" className="p-6 text-sm font-medium text-error">
            Could not load logs. Check your connection and refresh.
          </p>
        )}
        {stream.status === "ready" && stream.logs.length === 0 && <p className="p-6 text-sm text-muted">{filtering ? "No logs match these filters." : "No logs yet. Press “Send traffic” to create some."}</p>}
        {stream.logs.length > 0 && <LogList logs={stream.logs} fresh={stream.fresh} query={debouncedQuery} showSource={sourceId === ""} onOpen={setSelected} />}
        {stream.hasOlder && (
          <div className="border-t border-border p-3 text-center">
            <button type="button" disabled={stream.loadingOlder} onClick={() => void stream.loadOlder()} className="min-h-10 rounded-lg border border-border px-4 text-sm font-medium hover:bg-surface-muted disabled:opacity-60">
              {stream.loadingOlder ? "Loading…" : "Load older logs"}
            </button>
          </div>
        )}
      </section>

      {selected && <LogDrawer log={selected} query={debouncedQuery} onClose={() => setSelected(null)} />}
    </main>
  );
}
