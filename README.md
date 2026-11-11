# Web-search chat agent

Streaming browser and terminal research chat powered by Gemini, with one web-search tool and dated SQLite memory.

## Setup

Requires Node.js 22.12+, 24.x, or 26+. With nvm, run `nvm install` and `nvm use` to select Node 26 from `.nvmrc`.

```sh
npm install
cp .env.example .env
# Set GEMINI_API_KEY and EXA_API_KEY in .env.
npm run dev
```

Open http://localhost:3000. Ask a question, follow the live search progress, and use numbered citations to jump to sources. Reloading keeps the conversation identity so follow-up questions can use saved turns. New chat starts another conversation while dated and topic recall can still find prior research. The browser stores only user and conversation IDs in localStorage; messages and evidence stay in `data/chat.sqlite`. Clearing browser storage creates a new identity.

For terminal chat, run `npm run chat`. Use `/exit` or EOF to leave. Current conversation messages last for the CLI session. Questions, answers, sources, and search logs persist in `data/chat.sqlite`; dated and keyword recall works across sessions for the same `CLI_USER_ID` (default `local`). Each invocation starts a new conversation. Search start/end events include timestamps and step numbers on stderr; answers stream to stdout with a source list. `SEARCH_PROVIDER=mock` returns empty results in the CLI.

`npm start` runs the server without file watching. It binds to localhost. `GET /health` reports status; `POST /chat` accepts `{ message, userId, conversationId, timezone }` and emits SSE `status`, `sources`, `text`, `done`, or `error` events. Stopping a reply or disconnecting aborts the model and searches. Browser identities are local namespaces, not authenticated accounts; this server is intended for local use.

```sh
npm run typecheck
npm test
```

Temporal behavior can be checked with the fixed 11 November 2026 clock and synthetic saved baselines:

```sh
node --import tsx scripts/temporal-smoke.ts
node --import tsx scripts/temporal-smoke.ts --live
```

Both commands call Gemini. The first uses mock searches; `--live` runs two cases against Exa. JSON results include assertions, queries, source URLs, timings, and answer text; timestamped search events go to stderr. Use `--case=last-tuesday` (or another case ID from `evals/cases.ts`) to focus a run. These checks use an in-memory database and do not modify CLI history. Synthetic baseline prices are test data, not verified historical prices.

Run the full 12-case evaluation suite with real Gemini and deterministic mock search:

```sh
npm run eval
npm run eval -- --output=/tmp/eval-results.json
npm run eval -- --live --case=latest-node,hosting-comparison,follow-up --output=/tmp/live-results.json
```

The table reports assertions, model steps, search count, local first-status time, first-search time, first answer token, and total latency. Optional JSON also records query/date filters, per-search durations and failures, returned sources, token/cache usage, finish reason, full answers, and latency targets. A failed assertion, model error, or truncated answer exits nonzero. `npm test` is offline; `npm run eval` needs `GEMINI_API_KEY` and makes model API calls even with mock searches. Live search additionally requires `EXA_API_KEY`; injection, failure, and conflict cases always retain controlled fixtures.

Use `--case=ID` (comma-separated IDs accepted), `--repeat=1` through `--repeat=10`, `--search-type=auto|fast` for live comparisons, or `--step-cap=2|4` for evaluation experiments. Production retains the four-step ceiling, with early synthesis after a single-query research round. The two-step global-cap candidate was rejected. The eval clock stays fixed to 11 November 2026 in Asia/Kolkata and uses an in-memory database. These are structural assertions; claim attribution and answer tone still require human review. Latency targets are reported rather than used as correctness gates.

Source modules live in `src/`, browser assets in `public/`, manual tools in `scripts/`, evaluation cases in `evals/`, and architecture decisions in `docs/decisions.md`. Runtime SQLite files live in ignored `data/`.

See `.env.example` for configuration. `SEARCH_PROVIDER=mock` skips the Exa key requirement; the Gemini key remains required. `MODEL` defaults to `gemini-3.5-flash`; `AGENT_NOW` optionally fixes the clock for reproducible dates. Recall resolves dates in the browser timezone (system timezone for CLI) and injects matching saved turns before generation.
