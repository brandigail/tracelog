"use client";

import { Bell, BellOff, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { SeverityBadge } from "@/features/dashboard/SeverityBadge";
import { call } from "@/lib/client/http";
import { formatWindow, timeAgo } from "@/lib/client/format";
import type { AlertRule, Severity, Source } from "@/types";

const WINDOWS = [30, 60, 120, 300, 900, 3600];
const field = "mt-1 h-11 w-full rounded-lg border border-border bg-background px-3 text-base";

export function AlertsPage() {
  const [rules, setRules] = useState<AlertRule[] | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; text: string }>>({});

  const [sourceId, setSourceId] = useState("");
  const [severity, setSeverity] = useState<Severity>("ERROR");
  const [threshold, setThreshold] = useState("10");
  const [windowSec, setWindowSec] = useState(120);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([call<{ rules: AlertRule[] }>("/api/alerts"), call<{ sources: Source[] }>("/api/sources")]);
      setRules(r.rules);
      setSources(s.sources);
      setSourceId((current) => current || s.sources[0]?.id || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load alert rules");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const count = Number(threshold);
    if (!Number.isInteger(count) || count < 1) return setError("The threshold must be a whole number of 1 or more.");
    setBusy(true);
    try {
      await call("/api/alerts", "POST", { sourceId, severity, threshold: count, windowSec, webhookUrl });
      setWebhookUrl("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the rule");
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work");
    }
  }

  async function test(id: string) {
    setError(null);
    try {
      const res = await call<{ ok: boolean; status: number }>(`/api/alerts/${id}/test`, "POST", {});
      setResults((r) => ({ ...r, [id]: { ok: res.ok, text: res.ok ? `Sent (HTTP ${res.status}).` : `The service did not accept it (HTTP ${res.status || "no response"}).` } }));
    } catch (err) {
      setResults((r) => ({ ...r, [id]: { ok: false, text: err instanceof Error ? err.message : "Test failed" } }));
    }
    await load();
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold">Alert rules</h1>
        <p className="mt-1 text-sm text-muted">Post to Discord or Slack when a source logs too many entries of one severity in a time window. Each rule fires at most once per window.</p>
      </header>

      {error && (
        <p role="alert" className="rounded-xl border border-error bg-surface p-3 text-sm font-medium text-error">
          {error}
        </p>
      )}

      <section aria-labelledby="new-rule" className="rounded-2xl border border-border bg-surface p-4">
        <h2 id="new-rule" className="font-semibold">
          New rule
        </h2>
        <form onSubmit={create} className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Source
              <select className={field} value={sourceId} onChange={(e) => setSourceId(e.target.value)} required>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Severity
              <select className={field} value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
                <option value="ERROR">ERROR</option>
                <option value="WARN">WARN</option>
                <option value="INFO">INFO</option>
              </select>
            </label>
            <label className="block text-sm font-medium">
              Fire when there are at least
              <input className={field} inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value)} required />
            </label>
            <label className="block text-sm font-medium">
              within
              <select className={field} value={windowSec} onChange={(e) => setWindowSec(Number(e.target.value))}>
                {WINDOWS.map((w) => (
                  <option key={w} value={w}>
                    {formatWindow(w)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm font-medium">
            Webhook URL (Discord or Slack)
            <input className={field} type="url" autoComplete="off" spellCheck={false} placeholder="https://discord.com/api/webhooks/… or https://hooks.slack.com/services/…" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} required />
            <span className="mt-1 block text-xs font-normal text-muted">Stored on the server only. It is never shown again in full.</span>
          </label>
          <button type="submit" disabled={busy || !sourceId} className="min-h-11 rounded-lg bg-accent px-5 font-semibold text-white hover:bg-accent-strong disabled:opacity-60 dark:text-[#0b1118]">
            Create rule
          </button>
        </form>
      </section>

      <section aria-labelledby="rules">
        <h2 id="rules" className="mb-3 font-semibold">
          Your rules
        </h2>
        {rules === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : rules.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted">No rules yet. Add one above, then use “Send test” to check the webhook works.</p>
        ) : (
          <ul className="space-y-3">
            {rules.map((rule) => (
              <li key={rule.id} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={rule.severity} />
                  <p className="min-w-0 flex-1 text-sm font-medium">
                    {rule.sourceName}: {rule.threshold} or more in {formatWindow(rule.windowSec)}
                  </p>
                  <button type="button" onClick={() => void act(rule.id, () => call(`/api/alerts/${rule.id}`, "PATCH", { enabled: !rule.enabled }))} aria-pressed={rule.enabled} aria-label={`${rule.enabled ? "Turn off" : "Turn on"} the rule for ${rule.sourceName}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-muted">
                    {rule.enabled ? <Bell className="size-4 text-accent" aria-hidden /> : <BellOff className="size-4 text-muted" aria-hidden />}
                    {rule.enabled ? "On" : "Off"}
                  </button>
                  <button type="button" onClick={() => void test(rule.id)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-muted">
                    <Send className="size-4" aria-hidden /> Send test
                  </button>
                  <button type="button" onClick={() => { if (window.confirm("Delete this rule?")) void act(rule.id, () => call(`/api/alerts/${rule.id}`, "DELETE")); }} aria-label={`Delete the rule for ${rule.sourceName}`} className="inline-flex size-10 items-center justify-center rounded-lg text-error hover:bg-surface-muted">
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
                <p className="mt-2 break-all font-mono text-xs text-muted">
                  {rule.webhookKind === "slack" ? "Slack" : "Discord"} · {rule.webhookMasked} · {rule.lastFiredAt ? `last fired ${timeAgo(rule.lastFiredAt)}` : "never fired"}
                </p>
                {results[rule.id] && (
                  <p role="status" className={`mt-1 text-sm font-medium ${results[rule.id]?.ok ? "text-accent" : "text-error"}`}>
                    {results[rule.id]?.text}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
