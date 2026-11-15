# TraceLog: Build Plan

- [x] 1. Scaffold the project (stack in `CLAUDE.md`), strict `tsconfig`, lint, `netlify.toml`, `.env.example`; first working commit
- [x] 2. Neon schema (sources, logs, alert_rules) with indexes and migration
- [x] 3. `types/` interfaces and zod schemas
- [x] 4. Ingestion endpoint with API key check and batch validation
- [x] 5. Seed script and traffic simulator
- [x] 6. Logs query API with cursor and filters
- [x] 7. `useLogStream` hook (polling/SSE)
- [x] 8. Live log table with severity filters and pause
- [x] 9. Recharts time-series by severity
- [x] 10. Search with match highlighting
- [x] 11. Stack-trace drawer
- [x] 12. Alert rules CRUD and evaluation on ingest
- [x] 13. Discord/Slack webhook sender with test button
- [x] 14. Responsive and dark-theme polish
- [x] 15. Quality gate: `npm run build`, lint and `tsc --noEmit` all pass; no console errors; core flow tested at 375px and desktop (28 unit tests, 14 integration tests, automated browser run with 36 checks)
- [x] 16. README: pitch, features, stack, architecture notes, screenshot placeholders, run steps, 3-bullet "what to demo to a recruiter", Phase 2 list
- [ ] 17. Deploy to Netlify, set env vars, verify the public URL end to end (deferred: deploys happen together after every project is built)
- [x] 18. Push to GitHub (live URL in `README.md` and root `LINKS.md` stays TBD until step 17)
