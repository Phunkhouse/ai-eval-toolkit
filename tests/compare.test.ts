import { describe, expect, it } from 'vitest';
import { compareReports, defineSuite, labelEvaluator, parseJsonOutput, runSuite, type Dataset, type ResponsesFile } from '../src/index.ts';
import { dataset } from './helpers.ts';

const base = dataset([
  { id: 'A', input: 'a', expected: { label: 'x' } },
  { id: 'B', input: 'b', expected: { label: 'y' } },
  { id: 'C', input: 'c', expected: { label: 'x' } },
]);
const suite = (d: Dataset, version = '1', labels = ['x', 'y']) =>
  defineSuite({ id: 's', version: '1', dataset: d, parse: (r) => parseJsonOutput(r), evaluators: [{ ...labelEvaluator({ labels, getLabel: (v) => (v as { label: string }).label }), version }] });
const resp = (labels: Record<string, string>, origin: 'mock' | 'recorded' = 'recorded'): ResponsesFile => ({
  format: 'ai-eval-responses/1',
  origin,
  responses: Object.fromEntries(Object.entries(labels).map(([k, v]) => [k, { output: JSON.stringify({ label: v }) }])),
});

describe('compareReports', () => {
  it('finds regressions and improvements between comparable runs', async () => {
    const before = await runSuite(suite(base), { responses: resp({ A: 'x', B: 'x', C: 'x' }) });
    const after = await runSuite(suite(base), { responses: resp({ A: 'y', B: 'y', C: 'x' }) });
    const c = compareReports(before, after);
    expect(c.compatibility).toBe('comparable');
    expect(c.cases.regressed).toEqual(['A']);
    expect(c.cases.improved).toEqual(['B']);
    expect(c.metrics.find((m) => m.name === 'label.accuracy')).toMatchObject({ baseline: 0.6667, current: 0.6667, delta: 0 });
  });

  it('compares only unchanged cases when the dataset changed, without aggregate deltas', async () => {
    const edited = dataset([
      { id: 'A', input: 'a', expected: { label: 'y' } },
      { id: 'B', input: 'b', expected: { label: 'y' } },
      { id: 'D', input: 'd', expected: { label: 'x' } },
    ]);
    const before = await runSuite(suite(base), { responses: resp({ A: 'x', B: 'x', C: 'x' }) });
    const after = await runSuite(suite(edited), { responses: resp({ A: 'y', B: 'y', D: 'y' }) });
    const c = compareReports(before, after);
    expect(c.compatibility).toBe('partially-comparable');
    expect(c.cases.changed).toEqual(['A']);
    expect(c.cases.improved).toEqual(['B']);
    expect(c.cases.added).toEqual([{ id: 'D', status: 'failed' }]);
    expect(c.cases.removed).toEqual(['C']);
    expect(c.metrics).toEqual([]);
  });

  it('refuses to compare runs with different criteria', async () => {
    const before = await runSuite(suite(base), { responses: resp({ A: 'x', B: 'y', C: 'x' }) });
    const changedVersion = await runSuite(suite(base, '2'), { responses: resp({ A: 'x', B: 'y', C: 'x' }) });
    expect(compareReports(before, changedVersion)).toMatchObject({ compatibility: 'not-comparable' });
    const changedConfig = await runSuite(suite(base, '1', ['x', 'y', 'z']), { responses: resp({ A: 'x', B: 'y', C: 'x' }) });
    const c = compareReports(before, changedConfig);
    expect(c.compatibility).toBe('not-comparable');
    expect(c.reasons.join(' ')).toMatch(/criteria differ/);
    expect(c.cases.regressed).toEqual([]);
  });

  it('refuses to compare mock evidence with model evidence', async () => {
    const mock = await runSuite(suite(base), { responses: resp({ A: 'x', B: 'y', C: 'x' }, 'mock') });
    const recorded = await runSuite(suite(base), { responses: resp({ A: 'x', B: 'y', C: 'x' }) });
    const c = compareReports(mock, recorded);
    expect(c.compatibility).toBe('not-comparable');
    expect(c.reasons.join(' ')).toMatch(/fixtures, not the model/);
  });

  it('rejects files that are not reports', () => {
    expect(() => compareReports({} as never, {} as never)).toThrow(/not an ai-eval-report/);
  });
});
