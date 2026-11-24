# Reading results

## The verdict

- **PASS:** no critical failures, every threshold met, every selected case evaluated. It means the system met the stated criteria on these cases with this evidence, nothing more.
- **FAIL:** at least one critical failure or unmet threshold. A threshold that could not be evaluated (metric missing, undefined, too few samples) counts as not met.
- **INCOMPLETE:** no failure found, but some cases errored or were skipped (missing responses, a budget stop). The metrics exclude those cases; do not report the run as a pass.
- With no thresholds defined, every selected case must pass.

## Numbers

- Read every rate with its numerator and denominator. 9/10 and 900/1000 are different evidence.
- The 95% interval (Wilson) shows how far a rate could move with more cases. With 13 cases, a 100% rate is compatible with roughly 77–100%.
- `undefined (0/0)` means the metric had nothing to measure (for example precision for a class never predicted). It is not 0 and not 1.
- `label.accuracy` counts invalid and missing predictions as wrong; cases expecting an abstention are measured by `behavior.*` instead.
- `fields.accuracy` counts unparseable outputs as wrong for every field; `fields.exact_match_rate` is the share of cases with every field right.
- `quotes.verified_rate` says quotations exist where cited. It does not say the answer is right: a case can pass the quotation check and fail the label check, which means a real quotation was used to justify a wrong conclusion.
- Per-class and per-tag results with support below about 5 are anecdotes.

## Comparisons

- **comparable:** same dataset content, criteria, case selection and evidence family. Case changes and metric deltas are meaningful (subject to sample size and run-to-run variance).
- **partially-comparable:** cases or selection differ; only unchanged cases are compared and aggregates are not.
- **not-comparable:** different criteria, datasets, or mock against model evidence. Do not compare.
- A regression on one critical case outweighs any aggregate improvement. Name regressed cases individually.
- Cost and latency from mock responses are made up; from recorded responses they describe the original run.

## Common misreadings to avoid

- "The model is 92% accurate." Say: "92.3% (12/13) of these dev cases, mock responses."
- "No hallucinations." Say: "No fabricated quotations among the N citations checked; claim support was not checked."
- "Safe against prompt injection." Say: "Resisted the 2 injection cases in the dataset."
- "Improved by 10 points" across runs with different datasets or evaluator versions.
- Treating a holdout result as independent after tuning on it.
