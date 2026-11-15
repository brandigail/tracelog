"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { call } from "@/lib/client/http";
import type { LogEntry, LogsResponse, Severity, StatsResponse } from "@/types";
import { SEVERITIES } from "@/types";

const VISIBLE_MS = 1500;
const HIDDEN_MS = 10_000;
const MAX_ROWS = 500;
const FLASH_MS = 1800;

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/** True while the tab is on screen. Polling slows right down when it is not. */
export function usePageVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "visible",
    () => true,
  );
}

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

export interface Filters {
  /** Empty string means every source. */
  sourceId: string;
  severities: Severity[];
  q: string;
}

function toQuery(filters: Filters, extra: Record<string, string>): string {
  const params = new URLSearchParams(extra);
  if (filters.sourceId) params.set("sourceId", filters.sourceId);
  // Every severity selected is the same as no filter, so the parameter is left out.
  if (filters.severities.length > 0 && filters.severities.length < SEVERITIES.length) params.set("severity", filters.severities.join(","));
  if (filters.q) params.set("q", filters.q);
  return params.toString();
}

type Status = "loading" | "ready" | "error";

interface Loaded {
  key: string;
  logs: LogEntry[];
  olderCursor: number | null;
}

type Result = Loaded | { key: string; failed: true };

const isLoaded = (result: Result | null): result is Loaded => result !== null && "logs" in result;

/**
 * The one place that knows logs arrive by polling. It loads the newest page, then keeps asking for anything with an id
 * above the newest one it holds (the `since` cursor). Netlify Functions can't hold a socket open, so this is the
 * transport; swapping in server-sent events later would not touch any component.
 */
export function useLogStream(filters: Filters, paused: boolean) {
  const visible = usePageVisible();
  const filterKey = JSON.stringify(filters);
  // The result is stored with the filters it belongs to. When the filters change the old result simply stops matching,
  // so the list shows "loading" again without any state being reset from inside an effect.
  const [result, setResult] = useState<Result | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [fresh, setFresh] = useState<ReadonlySet<number>>(new Set());
  const [kick, setKick] = useState(0);
  const newest = useRef(0);

  const current = result && result.key === filterKey ? result : null;
  const status: Status = current === null ? "loading" : isLoaded(current) ? "ready" : "error";
  const logs = isLoaded(current) ? current.logs : [];
  const olderCursor = isLoaded(current) ? current.olderCursor : null;

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `filters` is rebuilt each render; the key above is its value.
  const query = useCallback((extra: Record<string, string>) => toQuery(filters, extra), [filterKey]);

  /** Applies a change to the loaded result, but only while it still belongs to the current filters. */
  const update = useCallback(
    (change: (loaded: Loaded) => Loaded) => {
      setResult((existing) => (isLoaded(existing) && existing.key === filterKey ? change(existing) : existing));
    },
    [filterKey],
  );

  useEffect(() => {
    let cancelled = false;
    call<LogsResponse>(`/api/logs?${query({ limit: "50" })}`)
      .then((res) => {
        if (cancelled) return;
        newest.current = res.logs[0]?.id ?? 0;
        setResult({ key: filterKey, logs: res.logs, olderCursor: res.olderCursor });
      })
      .catch(() => {
        if (!cancelled) setResult({ key: filterKey, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [query, filterKey]);

  useEffect(() => {
    if (status !== "ready" || paused) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let flash: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const res = await call<LogsResponse>(`/api/logs?${query({ since: String(newest.current) })}`);
        if (stopped) return;
        if (res.logs.length > 0) {
          newest.current = Math.max(newest.current, res.logs[0]?.id ?? 0);
          update((loaded) => ({ ...loaded, logs: [...res.logs, ...loaded.logs].slice(0, MAX_ROWS) }));
          setFresh(new Set(res.logs.map((l) => l.id)));
          clearTimeout(flash);
          flash = setTimeout(() => setFresh(new Set()), FLASH_MS);
        }
      } catch {
        // A failed poll is not worth interrupting anyone for; the next one catches up.
      } finally {
        if (!stopped) timer = setTimeout(tick, visible ? VISIBLE_MS : HIDDEN_MS);
      }
    };

    // On resume (or after sending test traffic) the first poll is immediate.
    timer = setTimeout(tick, 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(flash);
    };
  }, [status, paused, visible, query, update, kick]);

  const loadOlder = useCallback(async () => {
    if (olderCursor === null || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await call<LogsResponse>(`/api/logs?${query({ before: String(olderCursor), limit: "50" })}`);
      update((loaded) => ({ ...loaded, logs: [...loaded.logs, ...res.logs], olderCursor: res.olderCursor }));
    } finally {
      setLoadingOlder(false);
    }
  }, [olderCursor, loadingOlder, query, update]);

  /** Poll right now instead of waiting for the next tick. */
  const refresh = useCallback(() => setKick((k) => k + 1), []);

  return { logs, status, fresh, hasOlder: olderCursor !== null, loadingOlder, loadOlder, refresh };
}

/** Counts per time bucket for the chart, polled more gently than the log list. */
export function useStats(sourceId: string, minutes: number, paused: boolean, kick: number) {
  const visible = usePageVisible();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (paused) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const params = new URLSearchParams({ minutes: String(minutes) });
        if (sourceId) params.set("sourceId", sourceId);
        const res = await call<StatsResponse>(`/api/stats?${params}`);
        if (!stopped) {
          setStats(res);
          setError(false);
        }
      } catch {
        if (!stopped) setError(true);
      } finally {
        if (!stopped) timer = setTimeout(tick, visible ? 5000 : 20_000);
      }
    };
    timer = setTimeout(tick, 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [sourceId, minutes, paused, visible, kick]);

  return { stats, error };
}
