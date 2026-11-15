import type { Severity } from "@/types";

export type WebhookKind = "discord" | "slack";

export type WebhookCheck = { ok: true; kind: WebhookKind } | { ok: false; error: string };

/**
 * Only real Discord and Slack incoming-webhook addresses are accepted. That is what stops an alert rule from being
 * used to make the server call an arbitrary or internal address (SSRF), and a rule can only ever reach those two services.
 */
export function validateWebhookUrl(raw: string): WebhookCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "That is not a valid URL." };
  }
  if (url.protocol !== "https:") return { ok: false, error: "Webhook URLs must use https." };
  if (url.username || url.password || url.port) return { ok: false, error: "Webhook URLs cannot contain credentials or a port." };
  const host = url.hostname.toLowerCase();
  if ((host === "discord.com" || host === "discordapp.com") && /^\/api\/webhooks\/\d+\/[\w-]+$/.test(url.pathname)) return { ok: true, kind: "discord" };
  if (host === "hooks.slack.com" && /^\/services\/[\w-]+\/[\w-]+\/[\w-]+$/.test(url.pathname)) return { ok: true, kind: "slack" };
  return { ok: false, error: "Use a Discord (discord.com/api/webhooks/...) or Slack (hooks.slack.com/services/...) incoming webhook." };
}

/** What the client may see of a webhook: where it points, never the secret part. */
export function maskWebhook(raw: string): string {
  try {
    const url = new URL(raw);
    const tail = url.pathname.slice(-4);
    return `${url.origin}/…${tail}`;
  } catch {
    return "(invalid webhook)";
  }
}

export interface AlertContext {
  sourceName: string;
  severity: Severity;
  count: number;
  threshold: number;
  windowSec: number;
  sample?: string;
}

const COLOR: Record<Severity, number> = { INFO: 0x3b82f6, WARN: 0xf59e0b, ERROR: 0xef4444 };

const windowText = (sec: number): string => (sec % 60 === 0 ? `${sec / 60} minute${sec === 60 ? "" : "s"}` : `${sec} seconds`);

export function buildPayload(kind: WebhookKind, ctx: AlertContext, test = false): Record<string, unknown> {
  const title = test ? "TraceLog test alert" : `${ctx.severity} spike on ${ctx.sourceName}`;
  const body = test
    ? `This is a test message from the rule for ${ctx.sourceName}: ${ctx.threshold}+ ${ctx.severity} logs in ${windowText(ctx.windowSec)}.`
    : `${ctx.count} ${ctx.severity} logs in the last ${windowText(ctx.windowSec)} (threshold ${ctx.threshold}).${ctx.sample ? `\nLatest: ${ctx.sample.slice(0, 200)}` : ""}`;
  if (kind === "slack") return { text: `*${title}*\n${body}` };
  return { content: null, embeds: [{ title, description: body, color: COLOR[ctx.severity] }] };
}

export interface SendResult {
  ok: boolean;
  status: number;
}

/** Posts a payload with a short timeout and no redirects (a redirect could point somewhere we never validated). */
export async function sendWebhook(url: string, payload: Record<string, unknown>): Promise<SendResult> {
  const check = validateWebhookUrl(url);
  if (!check.ok) return { ok: false, status: 0 };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}
