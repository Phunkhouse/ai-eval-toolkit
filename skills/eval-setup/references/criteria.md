# From failure modes to criteria

## Failure modes worth naming

Start from what the application does with the output, then ask how each step can go wrong. Typical modes by use case:

| Use case | Failure modes to consider |
| --- | --- |
| Structured extraction | Malformed or truncated output; wrong type; missing field; invented value for a field the source lacks; numeric or date errors; unit or currency confusion; extracting from a document that is not the right kind |
| Classification | Wrong label; label outside the set; no label; overconfident label on an ambiguous input; class imbalance hiding a weak class |
| Grounded answers, RAG | Fabricated quotation; real quotation from the wrong source; quotation that does not support the claim; answer beyond the sources; ignoring contradictory sources; answering when the sources do not contain the answer |
| Decision support, recommendations | Recommendation contradicts a business rule; missing caveat; unsupported reasoning |
| Generation | Required element missing; forbidden content; wrong format or length; tone or policy violations |
| Agents and tool calls | Unauthorized or forbidden tool call; required tool not called; wrong arguments; side effects without approval; loops |
| Untrusted input | Following an injected instruction; leaking a canary, system prompt or personal data |
| Operation | Errors, timeouts, latency, token use and cost beyond what the feature can afford |

## Which evaluator checks what

| Criterion | Deterministic check | When code cannot decide |
| --- | --- | --- |
| Output is usable | `schemaEvaluator` with the application's own schema | — |
| Correct category | `labelEvaluator` | Human adjudication for genuinely ambiguous inputs |
| Correct fields | `fieldsEvaluator` with tolerances | — |
| Quotation is real and correctly attributed | `quoteEvaluator` | — |
| Quotation supports the claim | — | Human review, or a calibrated judge (deferred in v0.1) |
| Declines when it should | `behaviorEvaluator` with a `classify` that reads the output's own abstention form | — |
| Never emits X | `forbiddenContentEvaluator` with a canary or the injected payload | — |
| Calls the right tools | `toolCallEvaluator` | Argument correctness: custom evaluator |
| Business rule holds | `defineEvaluator` with ordinary code | — |
| Explanation quality, relevance, completeness | — | Rubric with human review; a judge only after calibration against human labels |

Prefer to change the output contract so a criterion becomes checkable: ask for quotations with source ids, an explicit abstention shape, an enum instead of free text. Note such changes as recommendations for the application, not as evaluator workarounds.

## Severity

- **critical:** the output cannot be used or causes harm if used: unparseable output, fabricated evidence, a followed injection, an unauthorized tool call, an answer where the case requires declining, a wrong value in a field that moves money. One critical failure fails the run whatever the aggregates say.
- **major:** wrong but noticeable or recoverable: a wrong label, a missing field, a misattributed quotation.
- **minor:** style and formatting that downstream code tolerates.

A case's `risk: critical` makes any failure on it critical. Use it for cases that represent the worst realistic harm.

## Thresholds

- Always `critical_failures` at most 0.
- One headline metric per main criterion, with `minSamples` so a small denominator cannot pass by luck.
- Avoid thresholds of 100% on metrics with small samples unless any failure really is unacceptable; then make those cases `risk: critical` instead.
- Write down why each threshold value was chosen. A threshold the owner did not approve is a proposal.
