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
