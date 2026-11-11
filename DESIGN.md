# Fieldnote design

Fieldnote is a local research chat for current facts, comparisons, and revisiting earlier answers. Gemini plans searches; Exa supplies sources; SQLite keeps dated conversations. The browser streams progress and answers, then saves the transcript for reopening from the sidebar. This document describes the implemented system. Detailed decisions and failed experiments remain in [the decision log](docs/decisions.md).

```text
Browser / CLI → context builder → Gemini → web_search → Exa
                       ↑                         ↓
                    SQLite ← validated answer + sources + searches
```

## How it works

Hono serves one buildless HTML page and a streaming chat endpoint. Before generation, code injects the current ISO time, local date, weekday, timezone, recent conversation messages, and relevant saved turns. The browser supplies its timezone; the CLI uses the system timezone. `AGENT_NOW` fixes the clock for tests. The agent exposes exactly one tool, `web_search`. Search events and answer deltas travel over SSE; source links use stable IDs within each turn.

Questions, answers, sources, and search records are stored in SQLite. Browser storage holds only the user and selected-conversation IDs. History endpoints scope reads to that user and paginate chats and messages; the model receives the latest forty conversation messages. These IDs are local namespaces, not authentication. The server binds to localhost.

## Decisions and tradeoffs

**Recall runs in code.** chrono-node resolves English dates against the request clock. Local-day boundaries are converted separately to UTC, including daylight-saving changes. FTS5 topic matches within seven days of a resolved date rank ahead of unrelated date-only hits. Up to six question/reply pairs provide a dated baseline. This preserves the one-tool interface and avoids another model round-trip. A vector database would add infrastructure without improving exact date lookup.

**One bounded agent loop plans research.** Independent entity queries can run in parallel. There are at most four model steps, twelve provider searches, and 2048 output tokens per model step. A single-query round proceeds directly to synthesis. Final synthesis receives plain, explicitly untrusted evidence without function-call history; this addressed observed Gemini tool-loop failures. A separate planner/executor framework or routing model adds complexity without a measured benefit here.

**Change checks use two searches.** Dated announcements and an unfiltered official page complement each other: pricing pages can change without a publication date. The model compares current evidence with the saved baseline, distinguishes a baseline correction from a proven change event, and states missing history or evidence rather than inventing it.

**Search context is bounded.** Exa defaults to auto mode, four results, fresh-crawl requests, and highlights. Local normalization deduplicates URLs, caps results at eight, and caps excerpts at 1200 characters per source. Full-page text has no demonstrated benefit. Fast mode produced mixed timings; a global two-step cap failed cases. Neither replaced the retained settings.

**Output remains inspectable.** Search content is treated as data rather than instructions. Citation validation buffers split references and flags unknown source numbers while preserving code literals. Browser formatting uses text nodes and safe links. Failures retain partial text with an interruption marker. Citation membership does not prove that a source supports a claim.

The server caps requests at 64 KiB and questions at 20,000 characters, with twenty chat requests per minute per socket IP. Metrics logs omit prompts, query text, credentials, and upstream error details. The frontend pairs Instrument Serif display type with DM Sans; local fallbacks keep it usable if external fonts fail.

## Measurements and limits

| Verification | Measured result |
| --- | --- |
| Phase 7 model evals, mock search | 14/14 structural passes |
| Offline tests after sidebar history | 42 passes |
| Phase 6 mock median completion | 4.976 seconds |
| Retained live lookup/follow-up first token | 6.6–11.4 seconds |
| Retained live comparison total | 20.5 seconds |

[Raw evals](docs/evals/phase7-gate.json) and [latency trials](docs/phase6-results.md) include limitations. Live speed targets are not consistently met, and earlier Exa smoke runs had timeouts. Model outputs vary; structural assertions cannot certify factual accuracy or tone. With another week, I would measure reranking and another search provider, keep dated claim snapshots for clearer comparisons, and expand human-reviewed answer-quality cases.
