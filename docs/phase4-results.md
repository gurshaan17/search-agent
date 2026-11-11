# Phase 4 verification — 11 November 2026

Fixed clock: 2026-11-11 10:00 Asia/Kolkata. History prices are synthetic test baselines, not verified historical prices. All model checks used Gemini with the configured MODEL or the agent default.

| Scenario | Search backend | Searches | Total latency | Structural checks |
| --- | --- | ---: | ---: | --- |
| Five CRM tools since Monday | Mock | 10 | 12238 ms | Pass |
| CRM shortlist without history | Mock | 0 | 3470 ms | Pass |
| Prior question on 3 November | Mock | 6 | 12788 ms | Pass |
| No question on 3 November, other days populated | Mock | 0 | 2282 ms | Pass |
| Ambiguous last Tuesday, Postgres topic | Mock | 6 | 13686 ms | Pass |
| Prior question on 3 November | Exa | 6 | 20685 ms | Pass |
| Ambiguous last Tuesday, Postgres topic | Exa | 6 | 23099 ms | Pass |

The CRM case emitted all ten searches in step one. Both Postgres mock cases used the 3 November topic baseline rather than the unrelated 10 November bread conversation. Each entity received a dated announcement query and an unfiltered current-page query. One mock Postgres run used two parallel batches of three rather than six calls in one step. Missing-history cases did not search; the CRM response asked which tools, and the date response stated that no matching record existed.

The mock dated searches deliberately return no results, while current official-page fixtures have null publication dates. Both Postgres answers identified the synthetic Neon baseline difference and stated that its event date was unverified. Live results included undated official pages at https://neon.com/pricing, https://supabase.com/pricing, and https://aws.amazon.com/rds/postgresql/pricing/. These prove the unfiltered path can retrieve pages missed by publication-date filtering; they do not prove that an actual price changed during the fixed date window.

The first live attempt split a query batch and embellished the saved baseline. Prompt revisions explicitly require paired searches, fixed baseline quotes, and verdicts scoped to the saved claims. The subsequent outputs corrected the baseline comparison. Some live wording still makes broad statements about announcements; structural pass does not certify each generated claim. Citation attribution and historical change dates require human review. One live dated query did not return an observation; the answer still completed with the other sources. Search failure and citation hardening remain Phase 7 work.

The final raw runs initially failed two overly strict harness checks: requiring all six calls in step one (the implementation plan requires at least one independent call per entity in parallel), and rejecting grouped numeric citations such as [2, 3]. The harness now checks at least three first-step calls for Postgres (five for CRM), paired query coverage across the turn, and numeric citation groups. Rechecking the saved outputs against those conditions yields the table above. This does not claim the model always obeys the prompt's stronger all-pairs-first-step instruction.

Reproduce with:

```sh
npm run typecheck
npm test
node --import tsx scripts/temporal-smoke.ts
node --import tsx scripts/temporal-smoke.ts --live
```

The smoke command prints JSON assertions and full answers. It exits nonzero on failed structural checks or model errors. Outputs vary across model runs. The general latency/eval runner remains Phase 6 work.
