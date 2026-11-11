# Usage reference

## HTTP and saved chats

`npm start` runs the server without file watching. It binds to localhost. `GET /health` reports status. `GET /conversations?userId=…` lists chats newest first (30 per page); `GET /conversations/:id?userId=…` reads saved messages and sources (100 per page). Both history responses include `nextCursor`, accepted as `before` for the next older page, and disable caching. All reads are scoped to the existing browser user ID. `POST /chat` accepts `{ message, userId, conversationId, timezone }` and emits SSE `status`, `sources`, `text`, `done`, or `error` events. Stopping a reply or disconnecting aborts the model and searches. Browser identities are local namespaces, not authenticated accounts; this server is intended for local use.

History is scoped to the browser identity. The sidebar restores messages and per-answer sources; mobile exposes it through History. Pagination keeps older chats and long transcripts accessible. Clearing browser storage loses the identity association.

## Evaluation options

Temporal behavior can be checked with the fixed 11 November 2026 clock and synthetic saved baselines:

```sh
node --import tsx scripts/temporal-smoke.ts
node --import tsx scripts/temporal-smoke.ts --live
```

Both commands call Gemini. The first uses mock searches; `--live` runs two cases against Exa. JSON results include assertions, queries, source URLs, timings, and answer text; timestamped search events go to stderr. Use `--case=last-tuesday` (or another case ID from `evals/cases.ts`) to focus a run. These checks use an in-memory database and do not modify CLI history. Synthetic baseline prices are test data, not verified historical prices.

Run the full 14-case evaluation suite with real Gemini and deterministic mock search:

```sh
npm run eval
npm run eval -- --output=/tmp/eval-results.json
npm run eval -- --live --case=latest-node,hosting-comparison,follow-up --output=/tmp/live-results.json
```

The table reports assertions, model steps, search count, local first-status time, first-search time, first answer token, and total latency. Optional JSON also records query/date filters, per-search durations and failures, returned sources, token/cache usage, finish reason, raw and citation-validated answers, invalid-reference count, and latency targets. A failed assertion, model error, or truncated answer exits nonzero. `npm test` is offline; `npm run eval` needs `GEMINI_API_KEY` and makes model API calls even with mock searches. Live search additionally requires `EXA_API_KEY`; injection, failure, conflict, empty-result, and poor-result cases always retain controlled fixtures.

Use `--case=ID` (comma-separated IDs accepted), `--repeat=1` through `--repeat=10`, `--search-type=auto|fast` for live comparisons, or `--step-cap=2|4` for evaluation experiments. Production retains the four-step ceiling, with early synthesis after a single-query research round. The two-step global-cap candidate was rejected. The eval clock stays fixed to 11 November 2026 in Asia/Kolkata and uses an in-memory database. These are structural assertions; claim attribution and answer tone still require human review. Latency targets are reported rather than used as correctness gates.


## Hardening

The server allows 20 chat requests per minute per direct socket IP, with HTTP 429 and `Retry-After` when exceeded. Forwarded-IP headers are not trusted. Limits apply per server process, not across replicas. Chat bodies are capped at 64 KiB and questions at 20,000 characters (also enforced in the CLI). Model calls retain a four-step ceiling, twelve searches per turn, and 2048 output tokens per model step.

References are validated before streamed display and saving. Known `[s1]` references normalize to `[1]`; unknown numeric references become `[unverified source]`. Split references are buffered, and code literals are preserved. This checks source membership, not whether the cited source proves the claim.

Failed searches remain gaps in otherwise usable answers. Empty results or sources without usable excerpts carry an explicit insufficient-evidence instruction. Interrupted/truncated replies show an error, preserve available text with an interruption marker, and never report successful completion. Network loss leaves the composer usable for retrying.

The server emits one JSON metrics line per admitted turn: turn IDs, outcome, search counts/durations/failures, timings, numeric token usage, and invalid-citation count. Prompts, search query text, sources, IPs, headers, upstream exceptions, and raw provider metadata are omitted. Usage is null when unavailable after a failure. CLI status logs also omit query text; full search records remain in SQLite, and optional eval JSON deliberately includes synthetic case inputs/answers for review.
