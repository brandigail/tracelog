"use client";

import { Check, Copy, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatFull } from "@/lib/client/format";
import type { LogEntry } from "@/types";
import { Highlight } from "./Highlight";
import { SeverityBadge } from "./SeverityBadge";

export function LogDrawer({ log, query, onClose }: { log: LogEntry; query: string; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(log, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be blocked; nothing else to do.
    }
  }

  const meta = Object.entries(log.meta);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-modal="true" aria-labelledby="log-title" className="flex h-full w-full max-w-2xl flex-col bg-surface shadow-xl">
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <SeverityBadge severity={log.severity} />
          <h2 id="log-title" className="min-w-0 flex-1 truncate text-sm font-semibold">
            Log #{log.id}
          </h2>
          <button type="button" onClick={() => void copy()} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-muted">
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? "Copied" : "Copy JSON"}
          </button>
          <button ref={closeButton} type="button" onClick={onClose} aria-label="Close" className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-surface-muted">
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <section aria-label="Message">
            <p className="break-words font-mono text-sm leading-relaxed">
              <Highlight text={log.message} query={query} />
            </p>
            <p className="mt-2 text-xs text-muted">
              {formatFull(log.ts)} · {log.sourceName}
            </p>
          </section>

          {meta.length > 0 && (
            <section aria-labelledby="meta">
              <h3 id="meta" className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                Metadata
              </h3>
              <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-4 gap-y-1 rounded-xl border border-border p-3 font-mono text-xs">
                {meta.map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="text-muted">{key}</dt>
                    <dd className="break-all">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section aria-labelledby="stack">
            <h3 id="stack" className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Stack trace
            </h3>
            {log.stack ? (
              <pre tabIndex={0} aria-label="Stack trace text" className="overflow-x-auto rounded-xl border border-border bg-surface-muted p-3 font-mono text-xs leading-relaxed">
                <Highlight text={log.stack} query={query} />
              </pre>
            ) : (
              <p className="text-sm text-muted">This log has no stack trace.</p>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
