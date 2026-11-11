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

**Memory is retrieved before the model runs.** chrono-node resolves English date references, while SQLite timestamps and FTS5 find earlier conversations. Topic matches near a referenced date help distinguish two possible meanings of “last Tuesday.” Recall supplies up to six question-and-answer pairs. This avoids a separate memory tool and another model call. Timestamp filters and keyword search cover the current recall requirements without a vector database.

**Research uses one bounded loop.** The prompt asks for independent entity searches in the same step. Code enforces a ceiling of four model steps, twelve searches, and 2048 output tokens per model step. A single-query round moves directly to an answer. Final synthesis receives plain, explicitly untrusted evidence rather than function-call history, addressing observed Gemini tool-loop failures. A separate planner, routing model, or orchestration framework has no measured benefit here.

**Checking for changes requires two views.** A date-filtered search finds announcements; an unfiltered official-page search checks the current state. Both matter because a pricing page can change without a publication date. The model compares this evidence with the saved answer and distinguishes a baseline correction from a dated change event. Missing history, failed searches, and insufficient evidence must remain visible gaps.

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
