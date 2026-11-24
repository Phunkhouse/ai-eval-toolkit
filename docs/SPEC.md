# Specification

## Purpose

Help developers and coding agents design, run and interpret evaluations of LLM-powered features, so they can answer with reproducible evidence whether a feature behaves reliably enough for its intended use. Establish confidence; never manufacture it.

## Users

- A developer adding or changing an AI feature in their own project, often working with Claude Code or Codex.
- The coding agent doing that work, guided by the Skills.
- An owner who approves expectations, thresholds and live-run budgets.

## Scope of v0.1 (Smoke)

| Capability | Where | Status |
| --- | --- | --- |
| Portable, versioned dataset with stable IDs, sources, expectations, tags, risk, splits, provenance and annotation status | `src/dataset.ts` | done |
| Structured output parsing and schema validation through existing libraries | `src/evaluators/structured.ts` | done |
| Quotation existence and attribution against source documents | `src/evaluators/grounding.ts` | done |
| Single-label classification metrics with denominators, undefined values and confusion matrix | `src/metrics/classification.ts`, `src/evaluators/labels.ts` | done |
| Field-level extraction with numeric tolerance and invented-value detection | `src/evaluators/fields.ts` | done |
| Expected behavior (answer, abstain, refuse), forbidden content, tool names | `src/evaluators/behavior.ts`, `content.ts` | done |
| Offline runs on mock and recorded responses | `src/runner/run.ts` | done |
| Explicit, bounded live runs with a reservation-based budget guard | `src/runner/budget.ts`, `run.ts` | done |
| JSON and Markdown reports with evidence kind, critical failures first, thresholds, limitations and next actions | `src/reporting/` | done |
| Baseline comparison that refuses incompatible runs | `src/reporting/compare.ts` | done |
| Setup and run Skills for Claude Code and Codex | `skills/` | done; Codex not run |
| Two synthetic worked examples, offline | `examples/` | done |

## Requirements the implementation keeps

- The default test command (`npm test`) and the examples never use the network, credentials or paid inference.
- A live run needs `--live`, a live target, `maxRequests`; it is refused inside Vitest and in CI unless explicitly allowed.
- A run that hits a limit stops scheduling, reports the cases not run, and is never reported as a pass.
- Critical failures are listed before aggregates and fail the run regardless of thresholds.
- Every ratio carries its numerator and denominator; a zero denominator gives `null`, not 0 or 1.
- Mock, recorded and live evidence are labelled in every report; mock and model evidence are never compared.
- The target never receives a case's expected outcome.
- Comparisons check dataset content per case and evaluator versions and configuration.

## Known limitations

- **Quotation checks** are deterministic substring matching after normalization (whitespace, typographic quotes and dashes, NFKC; optional case folding). They do not detect paraphrased fabrication that happens to match, unsupported claims, or wrong conclusions backed by real quotations, and they do not handle PDFs or OCR layout: sources are plain text.
- **Budget guard:** bounds spend under stated assumptions (estimated input tokens, given prices, a target that reports its usage and honors the output cap). It is not a billing guarantee; overruns are detected after the fact and stop the run. Prices are user-supplied and can be stale.
- **Single runs:** live results are one sample; variance across repeated runs is not measured in v0.1.
- **Classification** is single-label only. Multi-label is v0.2.
- **Thresholds** are fixed numbers; there is no statistical significance test for comparisons. Intervals are shown so small samples are visible.
- **No LLM judge or human annotation workflow** in v0.1. Custom evaluators can be written, and `kind: 'judge'` labels their results.
- **Tool-call checks** compare names only.
- **Datasets** are single JSON files, practical up to a few thousand cases.
- **Codex compatibility** is designed for (portable frontmatter, agent-neutral wording, the same install locations as the sibling toolkits) but not run, because no Codex CLI was available.
- **Running suites** needs Node 22.18 or later for TypeScript type stripping; older Node needs `tsx` or a build.

## Open questions for the owner

- Publishing: keep Git-only installation, or publish to npm (name, scope, licence)?
- Licence for the repository; the sibling toolkits have none.
- Whether a Starter Pack recipe and Audit context line should follow (see [ecosystem](ecosystem.md)).
