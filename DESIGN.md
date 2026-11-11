# Design

The project has a TypeScript scaffold, an implemented search provider, and a Gemini terminal agent. Phase 2 automated checks pass; a live Gemini CAP response used zero searches. The Node.js and pricing acceptance prompts remain unverified. Phase 3 persistence and recall pass automated checks and a live cross-session recall check. Phase 1 acceptance is still pending because three of twenty live smoke requests timed out. Phase 4 adds fixed-clock temporal checks and refined baseline comparison policy; the browser streaming UI remains planned work.

The planned request flow is browser → Hono → context builder → single-tool agent → search provider. SQLite supplies dated recall before the model runs. The terminal agent exposes one tool, `web_search`, with a four-step cap and twelve-search budget. It streams answers and logs search timestamps and step numbers. `MODEL` defaults to `gemini-3.5-flash`, using `GEMINI_API_KEY`; this replaces the originally planned Anthropic provider at the owner’s request. The search provider can also be exercised independently through the smoke script.

## Dated memory

The CLI stores timestamped questions and answers in `data/chat.sqlite`, along with source snapshots and search logs. Each CLI session starts a new conversation; `CLI_USER_ID` identifies the memory owner across sessions. This local identity scopes queries but is not authentication.

Before generation, code parses English dates with chrono-node against the request clock and system timezone. Local-day bounds are converted separately to UTC to respect daylight-saving changes; bare weekdays resolve into the past. FTS5 keyword matches within seven days of a resolved date rank ahead of date-only candidates. At most six questions are paired with their following assistant reply in the same conversation, truncated to 2000 characters per answer, and injected with timestamps, sources, and a suggested `since` date. Missing history is explicit. Recall adds no model tool or extra model call.

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

Resolve or explicitly accept the live timeout results before marking Phase 1 complete. Verify the remaining Phase 2 live search prompts. Later phases add streaming chat, evals, and hardening. End-to-end answer quality and latency have not been measured. The final design document will be revised as those decisions gain evidence.

Decision details and verification history are in [docs/decisions.md](docs/decisions.md).


Phase 4 verification covers five temporal scenarios with Gemini and mock search, plus two live Exa spot-checks. The model pairs dated announcements with unfiltered current pages and asks for the missing shortlist without searching. Synthetic baseline differences on undated pricing pages are detected. Some runs split research into two parallel batches; structural passes do not guarantee every generated claim is supported. Measurements and remaining quality limits are in [docs/phase4-results.md](docs/phase4-results.md).
