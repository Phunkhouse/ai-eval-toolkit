import { describe, expect, it } from 'vitest';
import { behaviorEvaluator, defineEvaluator, fieldsEvaluator, forbiddenContentEvaluator, toolCallEvaluator, type CheckResult } from '../src/index.ts';
import { ctx } from './helpers.ts';

const s = (checks: CheckResult[] | Promise<CheckResult[]>) => (checks as CheckResult[]).map((c) => `${c.criterion}:${c.status}`);

describe('fieldsEvaluator', () => {
  const ev = fieldsEvaluator({
    getFields: (v) => v as Record<string, unknown>,
    fields: {
      total: { type: 'number', abs: 0.005 },
      rate: { type: 'number', rel: 0.01 },
      vendor: { type: 'string', match: 'case-insensitive' },
      code: 'exact',
      date: { type: 'date' },
    },
  });
  const run = (expected: Record<string, unknown>, output: Record<string, unknown>) => ev.evaluate(ctx({ expected: { fields: expected } }, JSON.stringify(output)));

  it('applies numeric tolerances', () => {
    expect(s(run({ total: 10 }, { total: 10.004 }))).toEqual(['field:total:pass']);
    expect(s(run({ total: 10 }, { total: 10.01 }))).toEqual(['field:total:fail']);
    expect(s(run({ rate: 200 }, { rate: 201.9 }))).toEqual(['field:rate:pass']);
    expect(s(run({ rate: 200 }, { rate: 202.1 }))).toEqual(['field:rate:fail']);
  });

  it('does not coerce types', () => {
    const [c] = run({ total: 10 }, { total: '10.00' }) as CheckResult[];
    expect(c).toMatchObject({ status: 'fail', details: { kind: 'type' } });
  });

  it('distinguishes missing values from values that should be empty', () => {
    expect((run({ code: 'X1' }, {}) as CheckResult[])[0]).toMatchObject({ status: 'fail', details: { kind: 'missing' } });
    expect((run({ code: null }, { code: 'X1' }) as CheckResult[])[0]).toMatchObject({ status: 'fail', details: { kind: 'should-be-empty' } });
    expect(s(run({ code: null }, { code: null }))).toEqual(['field:code:pass']);
  });

  it('compares strings and dates as configured', () => {
    expect(s(run({ vendor: 'Acme Ltd' }, { vendor: '  ACME   ltd ' }))).toEqual(['field:vendor:pass']);
    expect(s(run({ code: 'abc' }, { code: 'ABC' }))).toEqual(['field:code:fail']);
    expect(s(run({ date: '2026-01-02' }, { date: '02/01/2026' }))).toEqual(['field:date:fail']);
  });

  it('checks only fields with an expectation and a spec, and skips abstention cases', () => {
    expect(s(run({ unknown: 1 }, { unknown: 2 }))).toEqual([]);
    expect(ev.evaluate(ctx({ expected: { behavior: 'abstain', fields: { code: 'x' } } }, '{}'))).toEqual([]);
  });

  it('reports field accuracy and exact-match rate, counting unparseable output as wrong', () => {
    const records = [
      [{ code: 'A', total: 1 }, '{"code":"A","total":1}'],
      [{ code: 'B', total: 2 }, '{"code":"B","total":3}'],
      [{ code: 'C', total: 3 }, 'not json'],
    ].map(([expected, out]) => {
      const c = ctx({ expected: { fields: expected as Record<string, unknown> } }, out);
      return { case: c.case, sources: [], parsed: c.parsed, response: c.response, checks: ev.evaluate(c) as CheckResult[] };
    });
    const m = Object.fromEntries(ev.summarize!(records).metrics.map((x) => [x.name, x]));
    expect(m['fields.accuracy']).toMatchObject({ numerator: 3, denominator: 6 });
    expect(m['fields.exact_match_rate']).toMatchObject({ numerator: 1, denominator: 3 });
    expect(m['fields.accuracy.total']).toMatchObject({ numerator: 1, denominator: 3 });
  });
});

describe('behaviorEvaluator', () => {
  const ev = behaviorEvaluator({ classify: (c) => (c.parsed.ok ? ((c.parsed.value as { b: 'answer' | 'abstain' | 'refuse' }).b) : 'answer') });
  const run = (expected: 'answer' | 'abstain' | 'refuse', b: string) => (ev.evaluate(ctx({ expected: { behavior: expected } }, JSON.stringify({ b }))) as CheckResult[])[0]!;

  it('treats answering instead of abstaining as critical and the reverse as major', () => {
    expect(run('abstain', 'answer')).toMatchObject({ status: 'fail', severity: 'critical' });
    expect(run('answer', 'abstain')).toMatchObject({ status: 'fail', severity: 'major' });
    expect(run('refuse', 'refuse')).toMatchObject({ status: 'pass' });
  });

  it('measures decline recall and precision', () => {
    const records = (
      [
        ['abstain', 'abstain'],
        ['abstain', 'answer'],
        ['answer', 'abstain'],
        ['answer', 'answer'],
      ] as const
    ).map(([e, o]) => {
      const c = ctx({ expected: { behavior: e } }, JSON.stringify({ b: o }));
      return { case: c.case, sources: [], parsed: c.parsed, response: c.response, checks: ev.evaluate(c) as CheckResult[] };
    });
    const m = Object.fromEntries(ev.summarize!(records).metrics.map((x) => [x.name, x]));
    expect(m['behavior.decline_recall']).toMatchObject({ numerator: 1, denominator: 2 });
    expect(m['behavior.decline_precision']).toMatchObject({ numerator: 1, denominator: 2 });
    expect(m['behavior.match_rate']).toMatchObject({ numerator: 2, denominator: 4 });
  });
});

describe('forbiddenContentEvaluator', () => {
  const ev = forbiddenContentEvaluator({ patterns: [{ id: 'card', pattern: /\b\d{4}-\d{4}-\d{4}-\d{4}\b/ }] });

  it('finds case-level strings case-insensitively and global patterns', () => {
    expect(s(ev.evaluate(ctx({ expected: { forbidden: ['Secret Word'] } }, 'the SECRET   word is here')))).toEqual(['forbidden:case-forbidden-1:fail']);
    expect(s(ev.evaluate(ctx({}, 'card 1234-5678-9012-3456')))).toEqual(['forbidden:card:fail']);
    expect(s(ev.evaluate(ctx({ expected: { forbidden: ['canary'] } }, 'clean output')))).toEqual(['forbidden-absent:pass']);
  });

  it('checks objects as JSON text', () => {
    expect(s(ev.evaluate(ctx({ expected: { forbidden: ['canary'] } }, { note: 'CANARY' })))).toEqual(['forbidden:case-forbidden-1:fail']);
  });

  it('applies to nothing when there is nothing to look for', () => {
    expect(forbiddenContentEvaluator().evaluate(ctx({}, 'x'))).toEqual([]);
  });
});

describe('toolCallEvaluator', () => {
  const ev = toolCallEvaluator({ allowed: ['search', 'lookup_order'] });
  it('checks required, forbidden and unlisted tools', () => {
    const c = ctx({ expected: { toolCalls: { required: ['lookup_order'], forbidden: ['refund'] } } }, 'ok', { response: { toolCalls: [{ name: 'search' }, { name: 'refund' }] } });
    expect(s(ev.evaluate(c))).toEqual(['required:lookup_order:fail', 'forbidden:refund:fail', 'allowlist:fail']);
  });
});

describe('defineEvaluator', () => {
  it('requires a lowercase id and a version', () => {
    expect(() => defineEvaluator({ id: 'Bad', version: '1', kind: 'deterministic', evaluate: () => [] })).toThrow();
    expect(() => defineEvaluator({ id: 'ok', version: '', kind: 'deterministic', evaluate: () => [] })).toThrow();
  });
});
