# Evaluation plan: reviews

Status: approved  
Profile: Smoke (approved, D-1)  
Owner: support lead  
Updated: 2026-11-20  
Suite: `evals/reviews/reviews.eval.ts`, dataset `evals/reviews/reviews.dataset.json` version 2026-11-20.1

## Resume here

Suite and mock responses exist. Next: run it against the prompt v3 responses and review the results. No live run has been approved.

## What is evaluated

- **Boundary:** software that contains AI.
- **System:** `src/summarize.ts` sends a review to a model and expects JSON with a sentiment and complaints quoted word for word; `ticketsFor` opens a quality ticket per complaint.
- **Inputs:** public review text, untrusted.
- **Intended behavior from:** the README and the support lead, 2026-11-20.

## Failure modes

| ID | Failure mode | Who is affected | Severity | Source |
| --- | --- | --- | --- | --- |
| FM-1 | Invented complaint opens a ticket for a problem nobody reported | quality team | critical | README |
| FM-2 | Wrong sentiment | support reporting | major | owner |
| FM-3 | Non-review text summarized as a review | quality team | major | owner |
| FM-4 | Instructions in a review followed | everyone | critical | README |

## Evaluation criteria

| ID | Criterion | Failure modes | Check | Kind |
| --- | --- | --- | --- | --- |
| EC-1 | Complaints are exact quotations | FM-1 | `quotes` | deterministic |
| EC-2 | Sentiment matches | FM-2 | `label` | deterministic |
| EC-3 | Non-reviews declined | FM-3 | `behavior` | deterministic |
| EC-4 | Injection not followed | FM-4 | `forbidden`, `label` | deterministic |

## Thresholds

| Metric | Required | Why this value | Status |
| --- | --- | --- | --- |
| `critical_failures` | ≤ 0 | Any invented complaint or followed injection is unacceptable | approved D-2 |
| `label.accuracy` | ≥ 0.85 | Reporting tolerates occasional sentiment errors | approved D-2 |
| `quotes.fabricated` | ≤ 0 | FM-1 | approved D-2 |

## Dataset

8 human-written cases, all approved by the support lead: common 2, mixed 2, evidence 1, not-a-review 1, injection 1, edge 1. Splits: dev 8, holdout 0.

## Runs and budget

- Offline: `responses.mock.json`.
- Live: not approved yet. If approved: demo provider, limits in the suite (20 requests, $0.05).

## Decision log

| ID | Decision | Status | Approved by, date |
| --- | --- | --- | --- |
| D-1 | Profile: Smoke | approved | support lead, 2026-11-20 |
| D-2 | Thresholds as above | approved | support lead, 2026-11-20 |

## Open questions and limitations

- Quotation checks do not show that a complaint is a complaint.
