import { describe, expect, it } from 'vitest';
import { classificationMetrics, INVALID, labelEvaluator, NO_LABEL } from '../src/index.ts';
import { ctx } from './helpers.ts';

const labels = ['a', 'b', 'c'];

describe('classificationMetrics', () => {
  it('computes accuracy, per-class precision, recall and F1 by hand-checked values', () => {
    // expected/predicted: a/a, a/b, b/b, b/b, c/(invalid), a/(no label)
    const r = classificationMetrics(
      [
        { caseId: '1', expected: 'a', predicted: 'a' },
        { caseId: '2', expected: 'a', predicted: 'b' },
        { caseId: '3', expected: 'b', predicted: 'b' },
        { caseId: '4', expected: 'b', predicted: 'b' },
        { caseId: '5', expected: 'c', predicted: INVALID },
        { caseId: '6', expected: 'a', predicted: NO_LABEL },
      ],
      labels,
    );
    expect(r.n).toBe(6);
    expect(r.correct).toBe(3);
    expect(r.validPredictions).toBe(4);
    const by = Object.fromEntries(r.perClass.map((c) => [c.label, c]));
    expect(by.a).toMatchObject({ support: 3, tp: 1, fp: 0, fn: 2, precision: 1, recall: 0.3333, f1: 0.5 });
    expect(by.b).toMatchObject({ support: 2, tp: 2, fp: 1, fn: 0, precision: 0.6667, recall: 1, f1: 0.8 });
    // c was expected once and never predicted: precision undefined, recall 0, F1 0.
    expect(by.c).toMatchObject({ support: 1, tp: 0, fp: 0, fn: 1, precision: null, recall: 0, f1: 0 });
    expect(r.macroF1).toBe(0.4333);
    expect(r.confusion.predictedColumns).toEqual(['a', 'b', 'c', INVALID, NO_LABEL]);
    expect(r.confusion.counts[0]).toEqual([1, 1, 0, 0, 1]);
  });

  it('leaves undefined values null and excludes absent classes from macro-F1', () => {
    const r = classificationMetrics([{ caseId: '1', expected: 'a', predicted: 'a' }], labels);
    const by = Object.fromEntries(r.perClass.map((c) => [c.label, c]));
    expect(by.b).toMatchObject({ support: 0, precision: null, recall: null, f1: null });
    expect(r.macroF1).toBe(1);
    expect(r.excludedFromMacro).toEqual(['b', 'c']);
  });

  it('counts a class predicted but never expected as a false positive with undefined recall', () => {
    const r = classificationMetrics([{ caseId: '1', expected: 'a', predicted: 'c' }], labels);
    const c = r.perClass.find((x) => x.label === 'c')!;
    expect(c).toMatchObject({ fp: 1, precision: 0, recall: null, f1: 0 });
    expect(r.excludedFromMacro).toContain('c');
  });

  it('handles an empty set without dividing by zero', () => {
    const r = classificationMetrics([], labels);
    expect(r).toMatchObject({ n: 0, correct: 0, macroF1: null });
  });
});

describe('labelEvaluator', () => {
  const ev = labelEvaluator({ labels, getLabel: (v) => (v as { label?: unknown }).label });
  const status = (expected: Record<string, unknown>, output: unknown) => (ev.evaluate(ctx({ expected }, output)) as { criterion: string; status: string }[]).map((c) => `${c.criterion}:${c.status}`);

  it('distinguishes correct, wrong, invalid and missing labels', () => {
    expect(status({ label: 'a' }, '{"label":"a"}')).toEqual(['label-correct:pass']);
    expect(status({ label: 'a' }, '{"label":"b"}')).toEqual(['label-correct:fail']);
    expect(status({ label: 'a' }, '{"label":"A"}')).toEqual(['label-valid:fail']);
    expect(status({ label: 'a' }, '{}')).toEqual(['label-present:fail']);
    expect(status({ label: 'a' }, 'not json')).toEqual(['label-correct:skipped']);
  });

  it('leaves abstention cases to the behavior evaluator', () => {
    expect(status({ behavior: 'abstain' }, '{"label":"a"}')).toEqual([]);
    expect(status({ label: 'a', behavior: 'refuse' }, '{"label":"a"}')).toEqual([]);
  });

  it('counts unparseable output as an invalid prediction in the metrics', () => {
    const records = [
      ['a', '{"label":"a"}'],
      ['a', 'garbage'],
    ].map(([label, out]) => {
      const c = ctx({ expected: { label } }, out);
      return { case: c.case, sources: [], parsed: c.parsed, response: c.response, checks: [] };
    });
    const acc = ev.summarize!(records).metrics.find((m) => m.name === 'label.accuracy')!;
    expect(acc).toMatchObject({ value: 0.5, numerator: 1, denominator: 2 });
  });

  it('rejects an empty or duplicated label set', () => {
    expect(() => labelEvaluator({ labels: ['a', 'a'], getLabel: () => 'a' })).toThrow();
    expect(() => labelEvaluator({ labels: [], getLabel: () => 'a' })).toThrow();
  });
});
