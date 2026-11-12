# Fieldnote

Research chat powered by Gemini, Exa web search, and dated SQLite memory. Compare current facts, revisit earlier answers, and reopen saved conversations from the sidebar.

## Run locally

Use Node 26 from `.nvmrc` (`nvm install && nvm use`). The declared engine range also supports Node 22.12+ and 24.x; final verification uses Node 26 on macOS.

```sh
npm install
cp .env.example .env
# Set GEMINI_API_KEY and EXA_API_KEY in .env.
npm run dev
```

Open [localhost:3000](http://localhost:3000). Questions and replies save automatically. Select Recent chats (History on mobile) to reopen one; reload restores the selected chat. New chat preserves previous conversations.

`npm start` runs without file watching. `npm run chat` opens terminal chat; `/exit` or EOF exits. Browser and CLI data live in ignored `data/chat.sqlite`. Browser identities are local namespaces, not authenticated accounts. The server binds to localhost; it is not configured as a public multi-user service.

## Configuration

Copy `.env.example`; never commit `.env`.

| Variable | Purpose / default |
| --- | --- |
| `GEMINI_API_KEY` | Required for chat and model evals, including mocked searches |
| `EXA_API_KEY` | Required for default chat and live-search evals |
| `SEARCH_PROVIDER` | `exa` (default) or `mock`; browser/CLI mock returns empty results |
| `MODEL` | Optional Gemini model ID; default `gemini-3.5-flash` |
| `PORT` | HTTP port, default `3000` |
| `AGENT_NOW` | Optional fixed ISO timestamp; blank uses current time |
| `CLI_USER_ID` | CLI memory owner, default `local`; reuse to recall earlier sessions |

The browser supplies its timezone; CLI uses the system timezone. Browser storage holds only identity and conversation IDs. Fonts load from Google Fonts with local fallbacks.

## Verify

```sh
npm run typecheck
npm test
npm run eval -- --output=/tmp/fieldnote-eval.json
```

Tests are offline. The fourteen-case eval uses real Gemini with controlled search fixtures and requires network access plus the Gemini key. It prints assertions and timing measurements, and exits nonzero on failures. To spot-check real Exa search:

```sh
npm run eval -- --live --case=latest-node,hosting-comparison,follow-up
```

Synthetic fixture prices are not historical price claims. Structural passes do not establish factual accuracy; review the cited sources. Live latency targets are not consistently met.

See [usage and API details](docs/usage.md), [design](DESIGN.md), [measured evals](docs/phase6-results.md), [decisions](docs/decisions.md), and the [final acceptance checklist](docs/final-check.md).

Saved-history recall combines dates, keyword search, and Gemini embeddings cached in SQLite. Existing chats are indexed incrementally; run `npm run memory:index` to index all saved history immediately using your Gemini key. This sends saved message passages to Gemini for embedding. If embeddings are unavailable, date/keyword recall still works. No extra database or API key is needed.

Run `npm run eval:memory` to compare keyword and hybrid retrieval on synthetic multilingual, paraphrased, corrected, and missing-history questions. `npm run eval` additionally checks complete Gemini answers and web-search behavior.

### Research latency and recovery

Comparisons and dated rechecks use one `search_batch` call with independent queries executed concurrently. Research has a shared six-second deadline starting at the first search; synthesis uses completed evidence and identifies failed or timed-out queries. The deadline bounds waiting even if a search provider ignores cancellation.

If synthesis fails or returns no answer text, it retries once after a short backoff using the same evidence with tools disabled. Cancellation and failures after visible answer text do not replay the answer. Synthesis has a 30-second deadline shared by both attempts, within a 90-second agent deadline. If recovery fails, the UI keeps collected sources and shows an error; it never records an empty successful reply. These bounds do not guarantee the latency targets: model planning and generation still contribute to response time.
