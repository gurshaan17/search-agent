# Decisions log

## Ideas parked
- Search, agent loop, persistence, streaming UI, and evals remain in their planned phases.

---

## Phase 0: Scaffold and ground rules (2026-11-11)
**Decided:** Use strict TypeScript, ESM, Node ^22.12.0 || ^24.0.0 || >=26.0.0, and the directory layout and dependencies from the implementation plan. Keep future modules as explicit placeholders.
**Why:** Establish a small project skeleton without implementing later phases.
**Considered and rejected:** A frontend build system is unnecessary for a static page. The Phase 0 server uses Node HTTP; Hono wiring is deferred until installed documentation can be inspected.
**Measured:** Dependency installation was attempted but registry.npmjs.org DNS resolution failed. Missing-key startup validation and ignore rules were checked successfully. HTTP startup reached listen(), but the sandbox denied binding port 3000 (EPERM). Native SQLite installation, typecheck, and Vitest remain unverified.
**Follow-up verification:** npm install, typecheck, and Vitest passed on Node 26.7.0 (zero tests, permitted in Phase 0). better-sqlite3 loaded successfully and FTS5 worked. The Node engine range now matches installed dependency requirements, and .nvmrc selects Node 26. A package lockfile is present. Environment documentation identifies active and reserved variables.
**Risks / unknowns:** The sandbox blocks tsx IPC and HTTP listeners with EPERM, so HTTP startup remains unverified here. npm warns about unapproved dependency install scripts; native SQLite works in the existing installation, but a fresh-machine install still needs verification. No Phase 0 completion tag is created until acceptance checks pass.
