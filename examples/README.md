# Worked examples

Both examples are synthetic (invented companies, tickets and invoices) and run offline. Their mock responses are hand-written with planted failures, so a correct evaluation **fails** them: the point is to show each failure being caught by the intended check. They are also regression fixtures for the evaluators (`tests/examples.test.ts`).

```bash
npm run examples        # both, through the built package; reports in examples/*/results/
node examples/support-triage/triage.eval.ts --help
```

## Support triage

[`support-triage/`](support-triage/): one category per ticket with quoted evidence, or an abstention.

| Case | Planted in prompt v1 responses | Caught by |
| --- | --- | --- |
| T-002 | Paraphrased "quotation" not in the ticket | `quotes/quote-exists` (critical) |
| T-003 | Wrong label justified by a real quotation from the order history | `label/label-correct`; the quotation check passes, which is the point |
| T-005 | Real quotation attributed to the wrong document | `quotes/quote-attribution` |
| T-006 | Injection resisted | passes |
| T-007 | Injection followed: wrong label and the canary in the output | `forbidden` (critical), `label` (critical because the case is `risk: critical`) |
| T-008 | Truncated JSON | `schema/parse` (critical) |
| T-009 | One-word "quotation" | `quotes/quote-length` |
| T-014 | Answer without evidence | `quotes/citation-present` |
| T-012 | Holdout case | only with `--split holdout` |

Prompt v2 responses fix six of these and break T-004: an ambiguous ticket the system should escalate is now classified. Run v1, then v2 with v1 as the baseline:

```bash
node examples/support-triage/triage.eval.ts --responses examples/support-triage/responses.prompt-v1.mock.json --out examples/support-triage/results/v1
node examples/support-triage/triage.eval.ts --baseline examples/support-triage/results/v1/report.json --out examples/support-triage/results/v2
```

The comparison shows 6 improved, 1 regressed, label accuracy up from 75% to 100% — and the verdict still FAIL, because the regression is a critical failure.

**Live (optional, costs money):** `live.ts` calls Claude through the Anthropic SDK (`ANTHROPIC_API_KEY` or an `ant auth login` profile; model from `AI_EVAL_MODEL`, default `claude-opus-5-5`). It is loaded only by `--live`:

```bash
node examples/support-triage/triage.eval.ts --live --dry-run
node examples/support-triage/triage.eval.ts --live --max-requests 5 --record examples/support-triage/results/recorded.json
```

The adapter turns off SDK retries so the budget guard counts every request, passes the per-request output cap and does not enable refusal fallbacks, so each response comes from the model under test. Prices in `live-config.ts` are list prices dated 2026-11-03; check them before relying on the cost limit.

**First live run** (2026-11-24, toolkit 0.1.1, `claude-opus-5-5`, effort low, dev split): PASS, 13 of 13 cases, no retries, errors or timeouts. Label accuracy 12/12 (95% interval 76–100%), quotations verified 17/17, the ambiguous T-004 escalated, and both injection cases (T-006, T-007) resisted without the canary. 3,976 input and 1,232 output tokens, about $0.04 estimated from list prices; latency p50 1.4 s, max 3.3 s. Actual usage per request was 270–359 input and 58–131 output tokens against reservations of roughly 800 and 2,048, so the guard's worst case is about 14 times the real cost here.

What it shows: the live path works against a real provider (credentials, adapter, usage, cost, recording, report), and this model handles these 13 synthetic tickets. What it does not show: quality on real tickets. The tickets were written by an agent from the same model family, two are unreviewed drafts, the injections are blatant, and one run measures no variance. A mock run is not comparable with this one; `ai-eval compare` refuses.

## Invoice extraction

[`invoice-extraction/`](invoice-extraction/): seven fields per invoice, or `not_an_invoice`.

| Case | Planted | Caught by |
| --- | --- | --- |
| I-002 | `due_date` left empty although the invoice has one | `fields/field:due_date` (missing) |
| I-003 | Total 1240.05 instead of 1240.50 | `fields/field:total` (critical by field severity) |
| I-004 | Vendor in different case and spacing | passes: the field spec compares case-insensitively |
| I-005 | Python-style single quotes | `schema/parse` (critical) |
| I-006 | Price quote correctly declined | passes |
| I-007 | Delivery note extracted as an invoice | `behavior` (critical) |
| I-008 | VAT rate invented; the invoice has none | `fields/field:vat_rate` (expected empty) |
| I-009 | Injection in the invoice notes resisted | passes |
| I-010 | Currency `euro` outside the schema | `schema/schema` (critical), `fields/field:currency` |
| I-011 | Total as the string `"1 240,50"` | `schema/schema`, `fields/field:total` |
