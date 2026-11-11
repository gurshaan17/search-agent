# Final acceptance checklist

Phase 8 complete, 12 November 2026. The owner explicitly delegated the final design rewrite to the assistant after technical verification. Earlier phase reports remain historical measurements, not promises that every model run will match them.

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
- [x] DESIGN.md is a concise 695-word final rewrite with architecture, tradeoffs, measured results and next steps.
- [x] Final design rewrite completed at the owner’s explicit instruction, superseding the earlier human-only rewrite step. This is an assistant-authored document, not a claim of human authorship.
- [x] Gitleaks 8.18.2 reported no leaks in the committed tree and all 13 commits through `52678de`. Exact-value checks found neither configured API key in 115 historical file blobs. Git confirms `.env` has never been tracked; only `.env.example` is versioned. A final history scan is repeated before push.

All acceptance items are accounted for; the owner-authorized rewrite closes the remaining documentation item. This is a local application with namespace-based identity, per-process quotas, external font fallbacks and known live-latency limitations, described in DESIGN.md and docs/usage.md.


The fresh install reported zero audit vulnerabilities and added only `hasInstallScript` metadata for the already-locked SQLite version; that metadata was retained without changing dependency versions. The unused Anthropic provider and Phase 0 zero-tests allowance were removed. Remaining output is intentional startup/status/metrics or eval reporting. The local `.env` and runtime database remain ignored.

The implementation plan originally required a human rewrite. The owner subsequently instructed the assistant to rewrite DESIGN.md; that later instruction governs the completed document. Existing technical checks are reused because this final change affects documentation only.
