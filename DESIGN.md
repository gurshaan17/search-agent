# Design

The planned request flow is browser → Hono → context builder → single-tool agent → search provider. SQLite will supply dated recall before the model runs.

Only the Phase 0 scaffold is implemented. Decisions and verification evidence are tracked in [docs/decisions.md](docs/decisions.md); measured results and the final one-page design will be added after implementation.
