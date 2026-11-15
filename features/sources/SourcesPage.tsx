"use client";

import { Check, Copy, KeyRound } from "lucide-react";
import { useCallback, useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { call } from "@/lib/client/http";
import { timeAgo } from "@/lib/client/format";
import type { Source } from "@/types";

const noSubscription = () => () => undefined;

/** The page's own address, for the example request. A placeholder on the server, the real origin in the browser. */
function useOrigin(): string {
  return useSyncExternalStore(
    noSubscription,
    () => window.location.origin,
    () => "https://your-tracelog.example",
  );
}

export function SourcesPage() {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<{ name: string; apiKey: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const origin = useOrigin();

  const load = useCallback(async () => {
    try {
      setSources((await call<{ sources: Source[] }>("/api/sources")).sources);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load sources");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    call<{ sources: Source[] }>("/api/sources")
      .then((res) => {
        if (!cancelled) setSources(res.sources);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load sources");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await call<{ source: Source; apiKey: string }>("/api/sources", "POST", { name });
      setCreated({ name: res.source.name, apiKey: res.apiKey });
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the source");
    }
  }

  async function copyKey() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be blocked; the key is still on screen to select by hand.
    }
  }

  const curl = `curl -X POST ${origin}/api/ingest \\
  -H "x-api-key: <your key>" \\
  -H "Content-Type: application/json" \\
  -d '{"logs":[{"severity":"ERROR","message":"Payment failed","stack":"Error: card declined\\n    at charge (pay.ts:42:9)","meta":{"orderId":"o_123","amount":49.5},"ts":"2026-03-10T09:30:00Z"}]}'`;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold">Sources</h1>
        <p className="mt-1 text-sm text-muted">Each app that sends logs is a source with its own API key. Keys are stored as a hash, so a key can only be shown once, when it is created.</p>
      </header>

      {error && (
        <p role="alert" className="rounded-xl border border-error bg-surface p-3 text-sm font-medium text-error">
          {error}
        </p>
      )}

      <section aria-labelledby="list" className="rounded-2xl border border-border bg-surface">
        <h2 id="list" className="border-b border-border px-4 py-3 font-semibold">
          Your sources
        </h2>
        {sources === null ? (
          <p className="p-4 text-sm text-muted">Loading…</p>
        ) : (
          <ul className="divide-y divide-border">
            {sources.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <KeyRound className="size-4 text-muted" aria-hidden />
                <span className="min-w-0 flex-1 font-medium">{s.name}</span>
                <span className="font-mono text-xs text-muted">{s.keyPrefix}…</span>
                <span className="text-xs text-muted">created {timeAgo(s.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={create} className="flex flex-wrap items-end gap-2 border-t border-border p-4">
          <label className="min-w-48 flex-1 text-sm font-medium">
            New source name
            <input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={40} placeholder="checkout-service" required className="mt-1 h-11 w-full rounded-lg border border-border bg-background px-3 text-base" />
          </label>
          <button type="submit" className="min-h-11 rounded-lg bg-accent px-5 font-semibold text-white hover:bg-accent-strong dark:text-[#0b1118]">
            Create source
          </button>
        </form>
      </section>

      {created && (
        <section role="status" aria-labelledby="key" className="rounded-2xl border border-accent bg-accent-soft p-4">
          <h2 id="key" className="font-semibold">
            API key for {created.name}
          </h2>
          <p className="mt-1 text-sm">Copy it now. It will not be shown again.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg bg-background px-3 py-2 font-mono text-sm">{created.apiKey}</code>
            <button type="button" onClick={() => void copyKey()} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-surface-muted">
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </section>
      )}

      <section aria-labelledby="docs" className="rounded-2xl border border-border bg-surface p-4">
        <h2 id="docs" className="font-semibold">
          Send logs
        </h2>
        <p className="mt-1 text-sm text-muted">POST up to 500 logs at a time, from your server. Send the key in the <code className="font-mono text-foreground">x-api-key</code> header (or as a Bearer token). Each source may send up to 3,000 logs a minute.</p>
        <pre tabIndex={0} aria-label="Example request" className="mt-3 overflow-x-auto rounded-xl border border-border bg-surface-muted p-3 font-mono text-xs leading-relaxed">
          {curl}
        </pre>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>
            <code className="font-mono text-foreground">severity</code> is INFO, WARN or ERROR; <code className="font-mono text-foreground">message</code> is up to 2,000 characters; <code className="font-mono text-foreground">stack</code> up to 8,000.
          </li>
          <li>
            <code className="font-mono text-foreground">meta</code> is a flat object of strings, numbers and booleans (up to 20 keys). <code className="font-mono text-foreground">ts</code> is optional and defaults to now.
          </li>
          <li>The response is 202 with how many logs were accepted. A bad key is 401, a bad body 400, too much traffic 429.</li>
        </ul>
      </section>
    </main>
  );
}
