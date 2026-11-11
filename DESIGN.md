# Design

The project has a TypeScript scaffold and an implemented search provider. Phase 1 acceptance is still pending because three of twenty live smoke requests timed out. The chat agent, persistence, and streaming UI remain planned work.

The planned request flow is browser → Hono → context builder → single-tool agent → search provider. SQLite will supply dated recall before the model runs. The model will have one tool, `web_search`; the current provider can be exercised independently through the smoke script.

## Search behavior

`SearchProvider` accepts a query, optional publication-date bounds, and a result count. The Exa implementation requests highlights with `maxAgeHours: 0` for freshness and maps date bounds to published-date filters. Date-filtered responses include a reminder that publication dates alone cannot establish whether an existing page changed.

Results default to four and are capped at eight. Normalization removes URL fragments, deduplicates URLs within each response, derives domains, and limits titles to 300 characters and total highlights to 1200 characters per source. One provider instance should be shared within a turn so sources keep stable IDs across searches. Highlights keep model context bounded; full-page text has no measured benefit yet.

Each search has an eight-second budget, including one retry after a short backoff for HTTP 429 or 5xx failures. Callers can also cancel through an abort signal. A mock provider supplies query-matched fixtures, empty responses, failures, and untrusted text for testing.

## Verification results

On 11 November 2026, typecheck and all four unit tests passed. Tests cover normalization and deduplication, stable source IDs, highlight limits, transient retry, timeout cancellation, and mock behavior.

The live comparison ran the same five queries for each mode and requested highlight size:

| Mode | Requested characters | Successful requests | Mean latency, including failures |
| --- | ---: | ---: | ---: |
| auto | 600 | 4/5 | 4678 ms |
| auto | 1200 | 4/5 | 3372 ms |
| fast | 600 | 5/5 | 1716 ms |
| fast | 1200 | 4/5 | 2552 ms |

All three failures were timeouts for “Supabase new features.” Successful responses passed result-count, URL deduplication, domain consistency, and local highlight-cap checks. Quality spot-checks found relevant official release, pricing, and announcement sources, plus directory listings with little useful prose.

Exa did not consistently honor the requested 600-character setting; local normalization enforced the 1200-character cap. This limits conclusions about highlight size. Fast/600 performed best in this run, but one small comparison does not establish a reliable quality or latency advantage. The implementation still defaults to auto/1200.

## Remaining work

Resolve or explicitly accept the live timeout results before marking Phase 1 complete. Later phases add the terminal agent, dated persistence and recall, change detection, streaming chat, evals, and hardening. End-to-end answer quality and latency have not been measured. The final design document will be revised as those decisions gain evidence.

Decision details and verification history are in [docs/decisions.md](docs/decisions.md).
