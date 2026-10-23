# TraceLog

Developer log monitoring dashboard with live streaming, search, stack traces and alert webhooks.

## Planned features
- Ingestion endpoint `POST /api/ingest` (API-key protected, batch of logs) plus a "log generator" button/script to simulate traffic.
- Live dashboard: streaming list and Recharts time-series by severity (INFO, WARN, ERROR), severity filters and pause/resume.
- Search with highlighting and expandable stack-trace drawer per entry.

### Phase 2
- Alert rules (errors per minute threshold) firing Discord/Slack webhooks
- Saved searches
- Multiple sources/projects with their own keys
- Retention cleanup job

## Stack
Next.js (App Router), TypeScript strict, Tailwind CSS, Recharts, Drizzle with Neon Postgres (indexed `logs` table, optional time-bucket queries), Server-Sent Events or short polling for streaming, Netlify

## Live demo
Live demo: TBD

## Run locally
Run locally: TBD

## Status
Not started
