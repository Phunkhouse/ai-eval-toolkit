// The worked examples double as regression fixtures: every planted failure must be caught, by the
// intended check, and nothing else may fail.
import { describe, expect, it } from 'vitest';
import { compareReports, runSuite, type Report } from '../src/index.ts';
import { suite as invoice } from '../examples/invoice-extraction/invoice.eval.ts';
import { suite as triage } from '../examples/support-triage/triage.eval.ts';

const failedChecks = (r: Report) =>
  Object.fromEntries(r.cases.filter((c) => c.status !== 'passed').map((c) => [c.id, c.checks.filter((k) => k.status === 'fail').map((k) => `${k.evaluator}/${k.criterion}`)]));
const v1 = new URL('../examples/support-triage/responses.prompt-v1.mock.json', import.meta.url);

describe('support-triage example', () => {
  it('catches every failure planted in the prompt v1 responses', async () => {
    const r = await runSuite(triage, { responses: v1 });
    expect(failedChecks(r)).toEqual({
      'T-002': ['quotes/quote-exists'],
      'T-003': ['label/label-correct'],
      'T-005': ['quotes/quote-attribution'],
      'T-007': ['label/label-correct', 'forbidden/forbidden:case-forbidden-1'],
      'T-008': ['schema/parse'],
      'T-009': ['quotes/quote-length'],
      'T-014': ['quotes/citation-present'],
    });
    expect(r.criticalFailures.map((f) => f.caseId)).toEqual(['T-002', 'T-007', 'T-007', 'T-008']);
    expect(r.verdict).toBe('fail');
    expect(r.metrics.find((m) => m.name === 'label.accuracy')).toMatchObject({ numerator: 9, denominator: 12 });
  });

  it('shows a regression behind improved aggregates in prompt v2', async () => {
    const before = await runSuite(triage, { responses: v1 });
    const after = await runSuite(triage, { baseline: before });
    expect(failedChecks(after)).toEqual({ 'T-004': ['behavior/behavior'], 'T-009': ['quotes/quote-length'] });
    expect(after.comparison).toMatchObject({ compatibility: 'comparable', cases: { regressed: ['T-004'], stillFailing: ['T-009'] } });
    expect(after.comparison!.cases.improved).toHaveLength(6);
    expect(after.criticalFailures.map((f) => f.caseId)).toEqual(['T-004']);
    expect(after.verdict).toBe('fail');
    expect(compareReports(before, after).cases.regressed).toEqual(['T-004']);
  });

  it('keeps the holdout case out of ordinary runs', async () => {
    const r = await runSuite(triage, {});
    expect(r.cases.some((c) => c.id === 'T-012')).toBe(false);
    const holdout = await runSuite(triage, { split: 'holdout' });
    expect(holdout.cases.map((c) => [c.id, c.status])).toEqual([['T-012', 'passed']]);
  });
});

describe('invoice-extraction example', () => {
  it('catches every failure planted in the mock responses', async () => {
    const r = await runSuite(invoice, {});
    expect(failedChecks(r)).toEqual({
      'I-002': ['fields/field:due_date'],
      'I-003': ['fields/field:total'],
      'I-005': ['schema/parse'],
      'I-007': ['behavior/behavior'],
      'I-008': ['fields/field:vat_rate'],
      'I-010': ['schema/schema', 'fields/field:currency'],
      'I-011': ['schema/schema', 'fields/field:total'],
    });
    expect(r.summary).toMatchObject({ selected: 11, passed: 4, failed: 7 });
    expect(r.verdict).toBe('fail');
  });
});
