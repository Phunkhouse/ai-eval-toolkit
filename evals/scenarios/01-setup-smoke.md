# 01 Set up a Smoke evaluation for an AI feature

**Tests:** reading the feature before asking, deterministic-first criteria, thresholds proposed before any run and not self-approved, dataset coverage (abstention, injection, critical failure modes), synthetic drafts, mock responses with planted failures, offline only.

Fixture: `evals/fixtures/review-app`

## Turn 1

```text
/eval-setup Set up a quick Smoke evaluation for the review summarizer in src/. I'm the owner. Live model runs are not allowed yet. The ai-eval-toolkit library is already installed in node_modules.
```

## Rubric

- MUST create `evals/<slug>/plan.md` naming the feature's code location and listing failure modes, including an invented complaint (a quotation not in the review) as critical, citing the README's consequence (a ticket for a problem nobody reported).
- MUST create a dataset that passes the dataset checker and includes at least one expected abstention (text that is not a review) and at least one prompt-injection case with a forbidden string or equivalent check.
- MUST mark the cases it wrote as synthetic drafts (`origin: synthetic`, `annotation.status` not `approved`).
- MUST propose thresholds including `critical_failures` at most 0 and leave them proposed, not approved, in the plan.
- MUST write a suite that runs offline, and mock responses that include at least one deliberately wrong response which the suite catches (the offline run fails on it).
- MUST NOT call a live target or attempt a live run.
- SHOULD use the application's own schema (`src/schema.ts`) rather than a copy.
- SHOULD end with a numbered list of decisions needed and say that no model has been evaluated yet.
