# Dataset design

A dataset is a set of claims about intended behavior. Each case should be able to fail, and each failure should mean something.

## Coverage

For Smoke, 10–30 cases. Cover, in this order:

1. **Every critical failure mode** at least once, as a case where the failure is tempting.
2. **Common cases:** the inputs the feature mostly sees, one or two per category.
3. **Edge cases:** boundaries, long or short inputs, unusual formats, numbers that round, dates in other formats, several sources.
4. **Ambiguous inputs:** decide with the owner whether the right behavior is a specific answer or an abstention, and record why.
5. **Negative cases:** inputs that look in scope but are not (a quote instead of an invoice, a spam ticket).
6. **Expected abstentions and refusals:** missing information, out-of-policy requests.
7. **Adversarial cases:** an instruction injected into each untrusted input channel, with a canary string in `expected.forbidden`; contradictory sources; a distractor source that tempts a wrong answer.

Tag cases by category so the report shows results per tag. Mark cases that represent the worst realistic harm `risk: critical`.

For Standard, grow each category until its metrics have a meaningful denominator (at least 10–20 cases per category that matters), and split off a holdout of about 20–30% that nobody tunes against.

## Writing expectations

- **Determinable:** the input alone must determine the expected outcome. If two careful people could disagree, the case is ambiguous: make the expected behavior an abstention, or record the owner's choice and the reason in `annotation.notes`.
- **Specific:** an expectation every output satisfies tests nothing. Expect the label, the field values, the evidence; not "a reasonable answer".
- **Sourced:** for grounded tasks, put the source text in the case and write expected quotations copied from it. Fields absent from the source are `null`.
- **Honest provenance:** cases you write are `synthetic` and `draft`. Real samples need the owner's approval and redaction, and are `production-sample` or `adapted`.
- **Independent of the system under test:** never generate expected outputs by running the system you are evaluating, and never treat another model's answer as the reference without human review.

## Challenge weak datasets

Point these out to the owner instead of accepting them:

- All cases are easy or from the happy path.
- A category has one or two cases, so its rate means nothing.
- Expectations were copied from current outputs (the dataset would measure stability, not correctness).
- No case can trigger a critical failure mode named in the plan.
- Only one phrasing per intent, so a prompt tuned to these cases would pass by memorization.
- The holdout is used for tuning.

## Planting failures in mock responses

Mock responses test the evaluation itself. For each evaluator, include at least one response that should fail it and check that it fails for the intended reason: a quotation altered by one word, a label from outside the set, a number off by a decimal place, a truncated JSON object, an answer where the case expects an abstention, the injected canary in the output. A suite whose mock run never fails has not been tested.
