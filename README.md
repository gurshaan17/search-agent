# Web-search chat agent

Phase 0 scaffold for a TypeScript agent with one web-search tool, dated memory, and streaming chat.

## Setup

Requires Node.js 22.12+, 24.x, or 26+. With nvm, run `nvm install` and `nvm use` to select Node 26 from `.nvmrc`.

```sh
npm install
cp .env.example .env
# Set ANTHROPIC_API_KEY and EXA_API_KEY in .env.
npm run dev
```

Open http://localhost:3000. The current server serves a scaffold page and `/health`; chat is implemented in later phases.

```sh
npm run typecheck
npm test
```

`npm run eval` is reserved for Phase 6; its runner is currently a placeholder.

Source modules live in `src/`, browser assets in `public/`, manual tools in `scripts/`, evaluation cases in `evals/`, and architecture decisions in `docs/decisions.md`. Runtime SQLite files will live in ignored `data/`.

See `.env.example` for configuration. `SEARCH_PROVIDER=mock` skips the Exa key requirement; the Anthropic key remains required. `MODEL` and `AGENT_NOW` are reserved for later phases.
