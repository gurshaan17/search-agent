# Phase 6 evaluations and latency — 12 November 2026

The evaluation runner uses Gemini with deterministic mock searches by default. Fixtures use Wednesday 11 November 2026, 10:00 Asia/Kolkata, and an isolated in-memory database. Fixture prices are synthetic observations, not verified historical prices. Live trials use Exa while retaining that fixed model clock; they do not reconstruct historical web content.

## What is checked

Twelve cases cover the five temporal scenarios, a current Node.js lookup, a three-provider hosting comparison, CAP theorem without search, a Neon follow-up, injected result instructions, one failing provider search, and conflicting prices. Assertions inspect query coverage and date filters, parallel first-step calls, search/step limits, numeric citation membership, recalled date and baseline, per-item verdicts, missing-history honesty, injection canary avoidance, partial-failure acknowledgment, conflict acknowledgment, and output truncation. Verdict and citation assertions are structural; claim attribution, completeness, and tone still need human review.

The table reports time to the local `thinking` event separately from first search and first answer token. JSON includes full answers, tool-call queries/filters/step numbers, per-search timing/failures, sources, model finish reason, and token/cache usage. A correctness failure exits nonzero. The latency targets are reported rather than used to hide correctness results.

## Changes driven by failed runs

The initial full baseline passed 6/12 cases. Repeated equivalent searches made single lookups exceed one search and caused several runs to reach the final step without an answer. A first prompt/disable-tools attempt reached 7/12. A global two-step trial also reached only 7/12 and was rejected: some multi-entity queries needed the remaining research steps.

A request probe that excluded credentials from its output verified that tool results reached Gemini. It also showed that removing function declarations caused the provider to omit its tool-disable configuration; preserving declarations with `NONE` alone did not consistently solve continuation of function-call history. The final synthesis path now presents completed results as explicitly untrusted plain evidence, with no function-call history or declarations. Single-query rounds synthesize immediately; larger rounds keep the four-step ceiling and twelve-search budget. An offline test using the real Google SDK verifies the synthesis request shape.

This brought the suite to 11/12. The remaining failure was a comparison that queried two providers first and the third later. The first-step coverage assertion was retained. Strengthening the tool description to require every entity in one response produced three consecutive passes of the comparison (12.079, 13.209, and 10.321 seconds). Those runs still used 6, 9, and 6 searches respectively, so repeated research and latency remain visible limitations.

## Final gate

`npm run eval -- --output=/tmp/phase6-gate.json` passed **12/12** with the retained settings. Typecheck and **28** offline unit/integration tests also passed. Full output is in [phase6-gate.json](evals/phase6-gate.json).

| Case | Steps | Searches | First status | First token | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| crm | 2 | 10 | 77 ms | 12782 ms | 13707 ms |
| crm-no-history | 1 | 0 | 16 ms | 2871 ms | 2913 ms |
| november-3 | 2 | 6 | 13 ms | 9201 ms | 9856 ms |
| november-3-no-history | 1 | 0 | 10 ms | 2552 ms | 2703 ms |
| last-tuesday | 2 | 6 | 13 ms | 8723 ms | 9547 ms |
| latest-node | 2 | 1 | 7 ms | 3683 ms | 3731 ms |
| hosting-comparison | 4 | 9 | 4 ms | 8223 ms | 9873 ms |
| cap | 1 | 0 | 2 ms | 2890 ms | 4661 ms |
| follow-up | 2 | 1 | 18 ms | 4497 ms | 5290 ms |
| injection | 2 | 1 | 47 ms | 3594 ms | 3628 ms |
| partial-failure | 3 | 3 | 5 ms | 11830 ms | 12812 ms |
| conflicting-prices | 2 | 1 | 21 ms | 3842 ms | 4090 ms |

Median total time across these twelve different mock-search scenarios: 4.976 seconds; 10/12 finished under ten seconds. Local first-status times ranged from 2 to 77 ms. The Node.js lookup used exactly one query and reached its first token in 3.683 seconds. This is one run, not a service guarantee. The hosting comparison still made nine searches across its four steps, and the partial-failure case made three; redundant research is visible in the artifact and remains a latency limitation.

## Search-mode experiment

Change only Exa mode, retain four results by default and 1200-character local highlight caps, and run the same three prompts sequentially. There is one sample per prompt/mode; planning and network variability prevent a statistical claim.

| Case | Auto first token / total | Fast first token / total |
| --- | ---: | ---: |
| Node.js lookup | 9.075 / 9.352 s | 7.883 / 7.893 s |
| Hosting comparison | 16.718 / 21.003 s | 16.452 / 22.900 s |
| Neon follow-up | 8.182 / 10.209 s | 7.493 / 9.534 s |

Both modes passed 2/3 structural cases; the comparisons used `[s1]`-style citations and ended mid-detail. Fast improved the two single-query times but made comparison total time worse. Keep `auto`; this small mixed result does not justify changing the default. Provider calls themselves varied from 1.159 to 7.220 seconds in the fast run.

The next candidate kept auto and constrained ordinary lookups/follow-ups to 150 words and comparisons to a compact table with at most 300 words unless more detail was requested. Final synthesis explicitly maps `s1` to `[1]`. Truncation is now checked through the model finish reason.

| Case | First status | First search | First token | Total | Structural result |
| --- | ---: | ---: | ---: | ---: | --- |
| Node.js lookup | 68 ms | 2504 ms | 11379 ms | 11585 ms | Pass |
| Hosting comparison | 2 ms | 1800 ms | 17608 ms | 20525 ms | Pass |
| Neon follow-up | 4 ms | 1980 ms | 6602 ms | 7900 ms | Pass |

All three completed with `stop` and numeric citations. Retain the concise-answer policy for completion and formatting; timings are mixed and do not establish an overall speed gain. The under-500-ms local status target is met here. The approximately four-second first-token target for single searches is missed, and the ten-second total target is not met consistently.

## Other levers

- Retain four default results and the 1200-character cap. Earlier Phase 1 evidence showed that the provider did not consistently honor the requested 600-character size, limiting a clean size comparison. No new result-count/size speed claim is made.
- The installed Google provider accepts `cachedContent`. Google's [context caching documentation](https://aistudio.google.com/docs/caching) confirms implicit caching is enabled by default and favors shared prefixes. These runs reported zero cache-read tokens. No explicit cache-resource lifecycle or speculative caching benefit is introduced.
- No routing model was added. It would add another model call; its quality/latency tradeoff was not measured and is not claimed to be beneficial.
- The global two-step candidate is available only as an eval override (`--step-cap=2`) for reproduction. Production keeps the four-step ceiling.

Raw experiment outputs, including the failed checks and generated answers, are in [phase6-experiments.json](evals/phase6-experiments.json). Model outputs vary between runs; a structural pass is not a factual quality guarantee.

## Reproduce

```sh
npm run typecheck
npm test
npm run eval -- --output=/tmp/eval-results.json
npm run eval -- --live --case=latest-node,hosting-comparison,follow-up --search-type=auto --output=/tmp/auto.json
npm run eval -- --live --case=latest-node,hosting-comparison,follow-up --search-type=fast --output=/tmp/fast.json
```

Both eval modes require the real Gemini key. Live mode additionally requires Exa; injection, failure, and conflict cases always use controlled search fixtures. The full suite does not change saved CLI/browser memory.
