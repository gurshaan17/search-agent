# Web-search chat agent

TypeScript terminal agent powered by Gemini with one web-search tool. Dated memory and browser chat are planned.

## Setup

Requires Node.js 22.12+, 24.x, or 26+. With nvm, run `nvm install` and `nvm use` to select Node 26 from `.nvmrc`.

```sh
npm install
cp .env.example .env
# Set GEMINI_API_KEY and EXA_API_KEY in .env.
npm run chat
```

Use `/exit` or EOF to leave terminal chat. Conversation history lasts for the current CLI session. Search start/end events include timestamps and step numbers on stderr; answers stream to stdout with a source list. `SEARCH_PROVIDER=mock` returns empty results in the CLI.

`npm run dev` opens the scaffold server at http://localhost:3000. The current server serves a scaffold page and `/health`; browser chat is implemented in a later phase.

```sh
npm run typecheck
npm test
```

`npm run eval` is reserved for Phase 6; its runner is currently a placeholder.

Source modules live in `src/`, browser assets in `public/`, manual tools in `scripts/`, evaluation cases in `evals/`, and architecture decisions in `docs/decisions.md`. Runtime SQLite files will live in ignored `data/`.

See `.env.example` for configuration. `SEARCH_PROVIDER=mock` skips the Exa key requirement; the Gemini key remains required. `MODEL` defaults to `gemini-3.5-flash`; `AGENT_NOW` optionally fixes the clock.
