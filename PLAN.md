# TraceLog: Build Plan

- [ ] 1. Scaffold the project (stack in `CLAUDE.md`), strict `tsconfig`, lint, `netlify.toml`, `.env.example`; first working commit
- [ ] 2. Neon schema (sources, logs, alert_rules) with indexes and migration
- [ ] 3. `types/` interfaces and zod schemas
- [ ] 4. Ingestion endpoint with API key check and batch validation
- [ ] 5. Seed script and traffic simulator
- [ ] 6. Logs query API with cursor and filters
- [ ] 7. `useLogStream` hook (polling/SSE)
- [ ] 8. Live log table with severity filters and pause
- [ ] 9. Recharts time-series by severity
- [ ] 10. Search with match highlighting
- [ ] 11. Stack-trace drawer
- [ ] 12. Alert rules CRUD and evaluation on ingest
- [ ] 13. Discord/Slack webhook sender with test button
- [ ] 14. Responsive and dark-theme polish
- [ ] 15. Quality gate: `npm run build`, lint and `tsc --noEmit` all pass; no console errors; core flow tested at 375px and desktop
- [ ] 16. README: pitch, features, stack, architecture notes, screenshot placeholders, run steps, 3-bullet "what to demo to a recruiter", Phase 2 list
- [ ] 17. Deploy to Netlify, set env vars, verify the public URL end to end
- [ ] 18. Push to GitHub and update the live URL in `README.md` and the root `LINKS.md`
