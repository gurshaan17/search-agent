# Project working agreement

Read `IMPLEMENTATION.md` before starting a phase. The owner keeps this ignored plan locally; request it if it is absent.

1. **One phase at a time.** Read this file, do only the current phase, then stop at its gate. Do not start the next phase until the human says "continue".
2. **Check the docs, not memory.** Before using any API from `ai`, `@ai-sdk/anthropic`, `exa-js`, `hono`, `better-sqlite3`, or `chrono-node`, read the installed package's README and type definitions in `node_modules`. Library APIs change between major versions; this file names concepts, not exact signatures.
3. **One tool only.** The agent exposes exactly one tool, `web_search`. No fetch tool, no history tool. Memory is built in code and injected as context before the model runs.
4. **Keep it small and explainable.** The human must be able to explain every line. Prefer plain code over clever abstractions. Add a dependency only if it clearly earns its place, and record why in the decisions log.
5. **Comment the why.** Short comments on non-obvious choices (why a cap is 12, why highlights not full text). No comments that restate the code.
6. **Log decisions as you go.** After each phase, append an entry to `docs/decisions.md` using the template in section 9. This log is the raw material for `DESIGN.md`.
7. **Measure, don't guess.** When choosing between options (search type, result count, model), run both on a handful of queries and record latency and quality in the log.
8. **Verify before declaring done.** Run `npm run typecheck` and `npm test` (and `npm run eval` from Phase 6 on) before saying a phase is complete.
9. **Commit discipline.** Small commits with clear messages. Finish each phase with a commit and a `phase-N` git tag.
10. **No scope creep.** Ideas outside the current phase go in the "Ideas parked" section of `docs/decisions.md`, not in the code.
11. **Ask, don't guess.** If a requirement is ambiguous, ask the human one concise question.
12. **Secrets.** Never commit `.env`. Keep `.env.example` in sync with every variable the code reads.

### Gate report format

At the end of every phase, post a report with:

- **What changed** (files and behavior)
- **How to run/verify it** (exact commands)
- **Why these choices** (2 to 4 bullets)
- **Explain-back**: 3 bullets the human should be able to say in their own words
- **Open questions / risks**

