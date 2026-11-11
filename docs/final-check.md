# Final acceptance checklist

Phase 8 draft, 12 November 2026. This tracks technical evidence separately from the required owner rewrite of DESIGN.md. Earlier phase reports remain historical measurements, not promises that every model run will match them.

- [ ] Fresh-clone `npm install` and `npm run dev`: verification pending.
- [x] `.env.example` lists all seven app-read configuration variables; README documents defaults and requirements.
- [x] Exactly one model tool, `web_search`: src/agent.ts; offline provider tests.
- [x] ISO time, weekday, local date and timezone injected each turn: src/prompt.ts and fixed-clock tests.
- [x] Turns, timestamps, sources and search logs persist in SQLite; saved browser transcripts and source anchors restore from user-scoped history endpoints.
- [x] Explicit dates, past weekdays and adjacent-week topic matching have deterministic tests and recorded temporal model checks.
- [x] Parallel multi-entity searches are checked by SDK concurrency tests and model eval first-step assertions; model behavior remains variable.
- [x] Change checks pair publication-date filters with unfiltered official-page queries; fixtures cover updated pages without publication dates.
- [x] Citation membership validation flags unmapped references before display and persistence, including split chunks; code literals are preserved. Semantic attribution remains a human review task.
- [x] Prompt and temporal evals require fixed baselines, scoped verdicts, missing-history honesty, and acknowledgment of failed/empty evidence.
- [x] Search progress, streamed text, sources, interruption/error recovery, and sidebar continuation passed prior browser tests.
- [ ] Fresh-clone typecheck, tests and complete model eval: verification pending.
- [x] DESIGN.md is a concise 675-word draft with architecture, tradeoffs, measured results and next steps.
- [ ] Owner rewrites DESIGN.md in their own words, as explicitly required by IMPLEMENTATION.md Phase 8. This cannot be certified by an agent-generated draft.
- [ ] Repository and full Git-history secret scan: verification pending. Git confirms `.env` has never been tracked; only `.env.example` is versioned.

No `phase-8` completion tag is created while a required item remains pending. This is a local application with namespace-based identity, per-process quotas, external font fallbacks and known live-latency limitations, described in DESIGN.md and docs/usage.md.
