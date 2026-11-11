# Final acceptance checklist

Technical verification complete, 12 November 2026. Owner rewrite pending. This tracks technical evidence separately from the required owner rewrite of DESIGN.md. Earlier phase reports remain historical measurements, not promises that every model run will match them.

- [x] Fresh local clone of commit `52678de` with no shared node_modules: `npm install` succeeded on macOS / Node 26.7.0, then `npm run dev` served the app on port 3003. Only `.env.example` was copied; keys were supplied through process environment, never written to a second credentials file. No saved database was copied.
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
- [x] Fresh-clone typecheck, all 42 tests, and all 14 model eval cases passed. Raw output: docs/evals/phase8-gate.json. Live browser verification passed search progress, citations, sidebar saving, transcript/source restore after reload, follow-up recall and both web fonts, with no page errors.
- [x] DESIGN.md is a concise 675-word draft with architecture, tradeoffs, measured results and next steps.
- [ ] Owner rewrites DESIGN.md in their own words, as explicitly required by IMPLEMENTATION.md Phase 8. This cannot be certified by an agent-generated draft.
- [x] Gitleaks 8.18.2 reported no leaks in the committed tree and all 13 commits through `52678de`. Exact-value checks found neither configured API key in 115 historical file blobs. Git confirms `.env` has never been tracked; only `.env.example` is versioned. A final history scan is repeated before push.

No `phase-8` completion tag is created while a required item remains pending. This is a local application with namespace-based identity, per-process quotas, external font fallbacks and known live-latency limitations, described in DESIGN.md and docs/usage.md.


The fresh install reported zero audit vulnerabilities and added only `hasInstallScript` metadata for the already-locked SQLite version; that metadata was retained without changing dependency versions. The unused Anthropic provider and Phase 0 zero-tests allowance were removed. Remaining output is intentional startup/status/metrics or eval reporting. The local `.env` and runtime database remain ignored.

The one unchecked item comes directly from IMPLEMENTATION.md Phase 8: “The human then rewrites it in their own words.” The 675-word design draft is ready for that owner step; technical checks do not substitute for it. No completion tag is created until the requirement is fulfilled or explicitly waived by the owner.
