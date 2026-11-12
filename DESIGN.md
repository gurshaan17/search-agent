# Fieldnote design

Fieldnote helps answer questions that need current information and a record of what was said before. It combines Gemini, Exa web search, and dated SQLite memory in a browser and terminal chat. The aim is a small system whose decisions and evidence are easy to inspect.

```text
Browser / CLI → context builder → Gemini → web_search → Exa
                       ↑                         ↓
                    SQLite ← answer + sources + search records
```

## How a question becomes an answer

Hono serves the browser page and streams chat events over SSE. Before calling Gemini, the server supplies the current time, weekday, local date, timezone, recent conversation, and relevant saved questions and answers. The browser supplies its timezone; the terminal uses the system timezone. Tests can fix the clock with `AGENT_NOW`.

Gemini has one tool: `web_search`. It decides what to search and uses the returned excerpts to answer with numbered citations. The browser shows search progress, streams the answer, and links citations to sources. The server saves the conversation and evidence in SQLite. The sidebar can reopen earlier chats, including their source lists; reload restores the selected chat.

## Why the system is built this way

**Memory is retrieved before the model runs.** SQLite combines date filters, FTS5 over both roles, and multilingual Gemini embeddings over overlapping passages from saved exchanges. Normalized 768-dimensional vectors stay in SQLite with a versioned cache. A request indexes at most eight old exchanges while encoding its query, with a four-second deadline; unavailable embeddings fall back to dates and keywords. New replies are indexed after delivery. A resumable command backfills existing history. No extra agent tool or vector service is needed.

Explicit dates constrain candidates; ambiguous weekdays consider two past occurrences and use topic relevance to distinguish them. The model receives up to six exchanges, matching passages, nearby context, relevance strength, and ambiguity information. Later corrections can supersede earlier advice. Missing matches are not proof that a conversation never happened. Similarity thresholds are measured heuristics, not universal confidence scores.

**Research uses one bounded loop.** The prompt asks for independent entity searches in the same step. Code enforces a ceiling of four model steps, twelve searches, and 2048 output tokens per ordinary step and 4096 for change checks. A single-query round moves directly to an answer. Final synthesis receives plain, explicitly untrusted evidence rather than function-call history, addressing observed Gemini tool-loop failures. A separate planner, routing model, or orchestration framework has no measured benefit here.

**Checking for changes requires two views.** A date-filtered search finds announcements; an unfiltered official-page search checks the current state. Both matter because a pricing page can change without a publication date. The model compares this evidence with the saved answer and distinguishes a baseline correction from a dated change event. Code validates the declared baseline ID, entity names and since-date, then tracks current and dated searches per declared entity. Missing coverage is fed back before synthesis; failed or empty current evidence requires an unverifiable verdict. The model still chooses the entity list and interprets evidence, so coverage cannot prove factual support or complete entity extraction.

**Search results are kept small.** Exa uses auto mode, fresh-crawl requests, and four results by default. Normalization deduplicates URLs, caps results at eight, and limits excerpts to 1200 characters per source. Each search has an eight-second budget, including one retry for transient HTTP failures. Full-page text has no demonstrated benefit. Fast mode had mixed timings, and a global two-step limit failed cases, so neither became the default.

**Sources remain inspectable.** Citation validation buffers split references and flags numbers absent from returned sources, while preserving code literals. The frontend builds formatting with text nodes and safe links. Interrupted answers keep an explicit marker. Citation membership checks prevent invented reference numbers; they cannot establish that a claim is supported.

The server binds to localhost. Browser IDs scope history but are not authentication. Requests are limited to 64 KiB, questions to 20,000 characters, and chat requests to twenty per minute per socket IP. Logs contain allowlisted metrics rather than prompts, credentials, or upstream exception details. The frontend uses Instrument Serif and DM Sans with local fallbacks.

## What verification shows

| Check | Recorded result |
| --- | --- |
| Fresh-clone offline tests | 42 passed |
| Fresh-clone model evals with mock search | 14/14 passed |
| Phase 6 mock median completion | 4.976 seconds |
| Measured live lookup/follow-up first token | 6.6–11.4 seconds |
| Measured live comparison total | 20.5 seconds |

Fresh-clone browser checks also covered live research, citations, saved history, reload, and follow-up recall. [Eval outputs](docs/evals/phase8-gate.json) and [latency trials](docs/phase6-results.md) record the evidence and limitations. Live speed targets are not consistently met; model behavior varies, and factual accuracy still requires reviewing sources.

With another week, the next work would be measuring another search provider and reranking, storing dated claim snapshots for clearer change comparisons, and expanding human-reviewed answer-quality cases.

The hybrid-memory update adds independent retrieval evaluation: 12/12 synthetic cases find the expected memory or correctly return no match, versus 9/12 with keywords alone. These include paraphrases, translations, corrections, competing history, and absent topics. Replaying the original failed Punjabi question now retrieves the actual earlier reply without a language-specific lookup. Stored chats were preserved and indexed. Embedding requests send saved passages to Gemini and consume its quota; retrieval adds latency. Detailed trials, including failed thresholds and parser/budget regressions, are retained under docs/evals/.

Final verification for this update: 62 offline tests and 28/28 real-Gemini/mock-search answer evaluations passed. See [retrieval results](docs/evals/hybrid-retrieval.json) and [answer results](docs/evals/hybrid-agent.json).
