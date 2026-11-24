# Evaluation plan: <feature>

Status: draft | approved  
Profile: Smoke | Standard (proposed | approved, D-1)  
Owner: <role who approves expectations and thresholds>  
Updated: YYYY-MM-DD  
Suite: `evals/<feature>/<feature>.eval.ts`, dataset `evals/<feature>/<feature>.dataset.json` version <version>

## Resume here

<!-- Rewrite at the end of every session: what exists, what is waiting for the owner, the next step. -->

## What is evaluated

- **Boundary:** software that contains AI | the behavior of an AI agent or Skill.
- **System:** <what the model is asked to do; prompt and model location with file paths; what the application does with the output>.
- **Inputs:** <what the system receives; which parts are untrusted>.
- **Intended behavior from:** <Discovery handover AC-/A- IDs, SPEC sections, README; or "the owner, in chat, YYYY-MM-DD">.
- **Out of scope:** <what this evaluation does not cover>.

## Failure modes

| ID | Failure mode | Who is affected | Severity | Source |
| --- | --- | --- | --- | --- |
| FM-1 | | | critical | |

## Evaluation criteria

| ID | Criterion | Failure modes | Check | Kind |
| --- | --- | --- | --- | --- |
| EC-1 | Output matches the application's schema | FM-1 | `schema` | deterministic |

## Thresholds

Set before the first run they judge. Proposals until the owner approves them (decision log).

| Metric | Required | Why this value | Status |
| --- | --- | --- | --- |
| `critical_failures` | ≤ 0 | One critical failure is unacceptable | proposed |

## Dataset

| Category (tag) | Cases | What it covers |
| --- | --- | --- |
| common | | |

- Provenance: <synthetic drafts / human-written / redacted production samples and how they were redacted>.
- Expectations awaiting the owner's review: <case IDs>.
- Splits: dev <n>, holdout <n>. Holdout runs: <date, purpose> (none yet).

## Runs and budget

- Offline: `responses.mock.json` (hand-written, tests the evaluation only).
- Live: <not allowed | allowed: provider, model, data that leaves the machine, limits: maxRequests, maxCostUsd, pricing source and date>. Each live run needs the owner's yes.
- Baseline: <none | evals/<feature>/baseline.json, run id, accepted D-n>.

## Data handling

<Sensitivity of inputs and outputs; redaction; whether results and recorded responses are committed.>

## Decision log

| ID | Decision | Status | Approved by, date |
| --- | --- | --- | --- |
| D-1 | Profile: Smoke, because <reason> | proposed | |

## Open questions and limitations

- <What this evaluation cannot show; questions for the owner.>
