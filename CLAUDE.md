# TraceLog: Log Monitoring Dashboard

Read the portfolio-root `CLAUDE.md` first for global rules. This file is the brief for this project.

## What it is
A lightweight Datadog-style log viewer. Apps POST logs to an ingestion endpoint; the dashboard streams them live, filters by severity, searches with highlighting, and fires Discord/Slack webhooks on error spikes.

## Stack
Next.js (App Router), TypeScript strict, Tailwind CSS, Recharts, Drizzle with Neon Postgres (indexed `logs` table, optional time-bucket queries), Server-Sent Events or short polling for streaming. Hosted on Netlify. No ClickHouse/Timescale (not free-tier friendly here). No Supabase, no Vercel, no Gemini/OpenAI.

## MVP (build first)
1. Ingestion endpoint `POST /api/ingest` (API-key protected, batch of logs) plus a "log generator" button/script to simulate traffic.
2. Live dashboard: streaming list and Recharts time-series by severity (INFO, WARN, ERROR), severity filters and pause/resume.
3. Search with highlighting and expandable stack-trace drawer per entry.

## Phase 2
Alert rules (errors per minute threshold) firing Discord/Slack webhooks, Saved searches, Multiple sources/projects with their own keys, Retention cleanup job.

## Data model (put in `types/`)
```ts
export type Severity = 'INFO' | 'WARN' | 'ERROR';
export interface Source { id: string; name: string; apiKeyHash: string }
export interface LogEntry { id: string; sourceId: string; severity: Severity; message: string; stack: string | null; meta: Record<string, string | number | boolean>; ts: string }
export interface AlertRule { id: string; sourceId: string; severity: Severity; threshold: number; windowSec: number; webhookUrl: string; lastFiredAt: string | null }
```

## Rules specific to this project
- Netlify Functions have no persistent sockets: stream via a `since` cursor poll (1-2 s) or SSE behind one `useLogStream` hook.
- Hash ingestion API keys; compare in constant time; rate-limit and cap batch size.
- Index `(source_id, ts desc)` and `(severity, ts desc)`; paginate by cursor, never `OFFSET` on large tables.
- Webhook URLs are secrets: store server-side, never return them in full to the client.
- Seed ~2k realistic logs across the last 24 h, with a few error spikes.
- Seed realistic demo data so the app looks alive on first load without sign-up.

## Start here
1. Ask me for the Neon `DATABASE_URL`; generate an `INGEST_KEY` for the demo source.
2. Scaffold Next.js + Tailwind + Drizzle, commit.
3. Work through `PLAN.md` from step 2.
