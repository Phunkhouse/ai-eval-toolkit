import { describe, expect, it } from 'vitest';
import { quoteEvaluator, type CheckResult, type Citation, type ExpectedOutcome, type SourceDocument } from '../src/index.ts';
import { ctx } from './helpers.ts';

const sources: SourceDocument[] = [
  { id: 'ticket', text: 'My order “LC-1” arrived with a  broken wheel — please replace it.' },
  { id: 'history', text: 'Order LC-1 delivered on 2026-11-02 by courier.' },
];
const ev = quoteEvaluator({ getCitations: (v) => (v as { evidence: Citation[] }).evidence });
// The quotation evaluator is synchronous.
const run = (evidence: Citation[], expected: ExpectedOutcome = { behavior: 'answer' }) => ev.evaluate(ctx({ expected, sources }, JSON.stringify({ evidence }))) as CheckResult[];
const summary = (checks: { criterion: string; status: string }[]) => checks.map((c) => `${c.criterion}:${c.status}`);

describe('quoteEvaluator', () => {
  it('verifies an exact quotation in the cited source', () => {
    expect(summary(run([{ sourceId: 'ticket', quote: 'arrived with a broken wheel' }]))).toEqual(['quote-exists:pass']);
  });

  it('normalizes whitespace, typographic quotes and dashes by default, but not case', () => {
    expect(summary(run([{ sourceId: 'ticket', quote: 'My order "LC-1" arrived' }]))).toEqual(['quote-exists:pass']);
    expect(summary(run([{ sourceId: 'ticket', quote: 'broken wheel - please replace' }]))).toEqual(['quote-exists:pass']);
    expect(summary(run([{ sourceId: 'ticket', quote: 'ARRIVED WITH A BROKEN WHEEL' }]))).toEqual(['quote-exists:fail']);
  });

  it('flags a fabricated quotation as critical', () => {
    const [c] = run([{ sourceId: 'ticket', quote: 'the wheel was bent in transit' }]);
    expect(c).toMatchObject({ criterion: 'quote-exists', status: 'fail', severity: 'critical' });
  });

  it('flags a real quotation attributed to the wrong source', () => {
    const [c] = run([{ sourceId: 'ticket', quote: 'delivered on 2026-11-02 by courier' }]);
    expect(c).toMatchObject({ criterion: 'quote-attribution', status: 'fail', severity: 'major' });
    expect(c!.message).toContain('"history"');
  });

  it('flags a source id that does not exist', () => {
    expect(run([{ sourceId: 'email', quote: 'arrived with a broken wheel' }])[0]).toMatchObject({ criterion: 'source-id', status: 'fail', severity: 'critical' });
  });

  it('refuses trivially short quotations', () => {
    expect(run([{ sourceId: 'ticket', quote: 'order' }])[0]).toMatchObject({ criterion: 'quote-length', status: 'fail' });
  });

  it('requires citations when answering but not when abstaining', () => {
    expect(summary(run([]))).toEqual(['citation-present:fail']);
    expect(run([], { behavior: 'abstain' })).toEqual([]);
  });

  it('checks existence without attribution when no source id is given and there are several sources', () => {
    expect(summary(run([{ quote: 'delivered on 2026-11-02' }]))).toEqual(['quote-exists:pass', 'quote-attribution:skipped']);
  });

  it('a verified quotation says nothing about whether the conclusion is right', () => {
    // The quotation exists, so this evaluator passes; a label or field check must catch the wrong conclusion.
    expect(summary(run([{ sourceId: 'history', quote: 'delivered on 2026-11-02 by courier' }]))).toEqual(['quote-exists:pass']);
    expect(ev.limitations?.join(' ')).toMatch(/not verify that the quotation supports the claim/);
  });

  it('accepts elided quotations only when allowed and the fragments appear in order', () => {
    const elided = quoteEvaluator({ getCitations: (v) => (v as { evidence: Citation[] }).evidence, allowEllipsis: true });
    const go = (quote: string) => (elided.evaluate(ctx({ sources }, JSON.stringify({ evidence: [{ sourceId: 'ticket', quote }] }))) as { status: string }[])[0]!.status;
    expect(go('My order "LC-1" arrived ... please replace it')).toBe('pass');
    expect(go('please replace it ... My order "LC-1" arrived')).toBe('fail');
    expect((run([{ sourceId: 'ticket', quote: 'My order "LC-1" arrived ... please replace it' }]) as { status: string }[])[0]!.status).toBe('fail');
  });

  it('can require the expected evidence', () => {
    const strict = quoteEvaluator({ getCitations: (v) => (v as { evidence: Citation[] }).evidence, requireExpectedEvidence: true });
    const expected: ExpectedOutcome = { behavior: 'answer', evidence: [{ sourceId: 'ticket', quote: 'arrived with a broken wheel' }] };
    const go = (quote: string) => summary(strict.evaluate(ctx({ expected, sources }, JSON.stringify({ evidence: [{ sourceId: 'ticket', quote }] }))) as { criterion: string; status: string }[]);
    expect(go('My order "LC-1" arrived with a broken wheel')).toContain('expected-evidence:pass');
    expect(go('please replace it')).toContain('expected-evidence:fail');
  });

  it('summarizes verified, fabricated and misattributed citations with denominators', () => {
    const records = [
      [{ sourceId: 'ticket', quote: 'arrived with a broken wheel' }],
      [{ sourceId: 'ticket', quote: 'the wheel was bent in transit' }],
      [{ sourceId: 'ticket', quote: 'delivered on 2026-11-02 by courier' }],
    ].map((evidence) => {
      const c = ctx({ expected: { behavior: 'answer' }, sources }, JSON.stringify({ evidence }));
      return { case: c.case, sources, parsed: c.parsed, response: c.response, checks: ev.evaluate(c) as never };
    });
    const m = Object.fromEntries(ev.summarize!(records).metrics.map((x) => [x.name, x]));
    expect(m['quotes.verified_rate']).toMatchObject({ numerator: 1, denominator: 3 });
    expect(m['quotes.fabricated']!.value).toBe(1);
    expect(m['quotes.misattributed']!.value).toBe(1);
  });
});
