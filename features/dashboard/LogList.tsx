"use client";

import { ChevronRight } from "lucide-react";
import { formatLogTime } from "@/lib/client/format";
import type { LogEntry } from "@/types";
import { Highlight } from "./Highlight";
import { SeverityBadge } from "./SeverityBadge";

interface Props {
  logs: LogEntry[];
  fresh: ReadonlySet<number>;
  query: string;
  showSource: boolean;
  onOpen: (log: LogEntry) => void;
}

export function LogList({ logs, fresh, query, showSource, onOpen }: Props) {
  return (
    <ol aria-label="Logs" className="divide-y divide-border">
      {logs.map((log) => (
        <li key={log.id} className={fresh.has(log.id) ? "log-arrive" : undefined}>
          <button type="button" onClick={() => onOpen(log)} aria-label={`${log.severity} at ${formatLogTime(log.ts)}: ${log.message}. Open details.`} className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-surface-muted">
            <span className="flex shrink-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3">
              <time dateTime={log.ts} className="font-mono text-xs tabular-nums text-muted">
                {formatLogTime(log.ts)}
              </time>
              <SeverityBadge severity={log.severity} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block break-words font-mono text-[13px] leading-snug">
                <Highlight text={log.message} query={query} />
              </span>
              {(showSource || log.stack) && (
                <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                  {showSource && <span>{log.sourceName}</span>}
                  {typeof log.meta.service === "string" && <span>{log.meta.service}</span>}
                  {log.stack && <span className="font-medium text-error">stack trace</span>}
                </span>
              )}
            </span>
            <ChevronRight className="mt-1 size-4 shrink-0 text-muted" aria-hidden />
          </button>
        </li>
      ))}
    </ol>
  );
}
