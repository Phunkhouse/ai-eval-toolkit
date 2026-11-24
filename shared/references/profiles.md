# Evaluation depth profiles

Choose by the risk of the AI feature and the decision the evaluation supports, not by the project's governance profile. A production application can need a quick Smoke check for an experiment; a Sprint project can need Standard for a feature that touches money or personal data.

| | Smoke | Standard | Continuous |
| --- | --- | --- | --- |
| **For** | Prototypes, assignments, experiments, prompt iteration | MVP features users rely on; any feature where a wrong output costs money, trust or safety | Mature features with ongoing quality requirements |
| **Dataset** | 10–30 cases: common, edge, negative, one or more adversarial; every critical failure mode at least once | 50+ cases with per-category coverage; human-approved expectations; dev and holdout splits | Versioned datasets refreshed from sampled production traces |
| **Checks** | Deterministic only: schema, labels or fields, quotations, forbidden content, behavior | Deterministic first; human review of ambiguous cases; an LLM judge only for named criteria, calibrated | Same, plus drift and cost monitoring |
| **Thresholds** | `critical_failures` ≤ 0 plus one or two headline metrics | Per-category thresholds with minimum sample sizes | Release gates and alert thresholds |
| **Runs** | Offline with mock responses; an optional small live run with strict limits | Recorded or live runs compared with a baseline on every prompt or model change | Scheduled and CI-gated runs |
| **Setup** | Minutes | Hours, built up from Smoke | Future toolkit capability |
| **Toolkit support in v0.1** | Complete | Partial: comparisons, splits, thresholds and annotations exist; multi-label metrics, judges and annotation workflows do not | Not yet |

## Signs Smoke is not enough

Recommend Standard, and say why, when any of these hold:

- A wrong output reaches a customer, moves money, changes records or is hard to notice.
- The feature handles personal data, untrusted documents or tool calls with side effects.
- A decision (ship, switch model, change prompt) will be made from the result.
- Several categories matter and Smoke's sample cannot show each one.
- Ambiguous cases need human adjudication.

## Moving from Smoke to Standard

Keep the dataset and IDs; add cases per category until each has enough support; move reviewed cases to `approved`; split off a holdout; record a baseline; add per-category thresholds with `minSamples`. The plan records the upgrade as a decision.
