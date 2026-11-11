# Decisions log

## Ideas parked
- Search, agent loop, persistence, streaming UI, and evals remain in their planned phases.

---

## Phase 0: Scaffold and ground rules (2026-11-11)
**Decided:** Use strict TypeScript, ESM, Node >=20, and the directory layout and dependencies from the implementation plan. Keep future modules as explicit placeholders.
**Why:** Establish a small project skeleton without implementing later phases.
**Considered and rejected:** A frontend build system is unnecessary for a static page. The Phase 0 server uses Node HTTP; Hono wiring is deferred until installed documentation can be inspected.
**Measured:** Dependency installation was attempted but registry.npmjs.org DNS resolution failed. Missing-key startup validation and ignore rules were checked successfully. HTTP startup reached listen(), but the sandbox denied binding port 3000 (EPERM). Native SQLite installation, typecheck, and Vitest remain unverified.
**Risks / unknowns:** Dependency ranges are temporarily unpinned; a successful npm install must generate a lockfile before reproducible installs can be claimed. Verify better-sqlite3 native installation and inspect installed API definitions before implementation. No Phase 0 completion tag is created until acceptance checks pass.
