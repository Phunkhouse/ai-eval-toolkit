import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  defineEvaluator,
  defineSuite,
  labelEvaluator,
  LiveRunRefused,
  parseJsonOutput,
  planLiveRun,
  renderMarkdown,
  runSuite,
  type LiveTarget,
  type ResponsesFile,
  type Suite,
} from '../src/index.ts';
import { dataset } from './helpers.ts';

const ds = dataset([
  { id: 'A', input: 'a', expected: { label: 'x' } },
  { id: 'B', input: 'b', expected: { label: 'y' } },
  { id: 'C', input: 'c', expected: { label: 'x' }, risk: 'critical' },
  { id: 'D', input: 'd', expected: { label: 'y' }, split: 'holdout' },
]);
const mock = (responses: ResponsesFile['responses'], origin: 'mock' | 'recorded' = 'mock'): ResponsesFile => ({ format: 'ai-eval-responses/1', origin, responses });
const suiteWith = (extra: Partial<Suite> = {}): Suite =>
  defineSuite({
    id: 'unit',
    version: '1',
    dataset: ds,
    parse: (raw) => parseJsonOutput(raw),
    evaluators: [labelEvaluator({ labels: ['x', 'y'], getLabel: (v) => (v as { label: string }).label })],
    ...extra,
  });
const out = (label: string) => ({ output: JSON.stringify({ label }) });
const offlineEnv = {};

describe('offline runs', () => {
  it('passes when every case passes, with the implicit threshold', async () => {
    const r = await runSuite(suiteWith(), { responses: mock({ A: out('x'), B: out('y'), C: out('x') }) });
    expect(r.verdict).toBe('pass');
    expect(r.run.evidence).toBe('mock');
    expect(r.summary).toMatchObject({ selected: 3, passed: 3 });
    expect(r.thresholds[0]).toMatchObject({ metric: 'cases.pass_rate', implicit: true, status: 'met' });
    expect(r.limitations[0]).toMatch(/MOCK RESPONSES/);
  });

  it('selects the dev split by default and holdout only when asked', async () => {
    const responses = mock({ A: out('x'), B: out('y'), C: out('x'), D: out('y') });
    expect((await runSuite(suiteWith(), { responses })).cases.map((c) => c.id)).toEqual(['A', 'B', 'C']);
    const holdout = await runSuite(suiteWith(), { responses, split: 'holdout' });
    expect(holdout.cases.map((c) => c.id)).toEqual(['D']);
    expect(holdout.limitations.join(' ')).toMatch(/holdout/);
  });

  it('keeps a critical failure visible even when aggregate thresholds are met', async () => {
    const s = suiteWith({ thresholds: [{ metric: 'label.accuracy', min: 0.5 }] });
    const r = await runSuite(s, { responses: mock({ A: out('x'), B: out('y'), C: out('y') }) });
    expect(r.thresholds[0]!.status).toBe('met');
    expect(r.criticalFailures).toEqual([expect.objectContaining({ caseId: 'C', reason: 'critical-risk-case' })]);
    expect(r.verdict).toBe('fail');
    const md = renderMarkdown(r);
    expect(md.indexOf('## Critical failures')).toBeLessThan(md.indexOf('## Metrics'));
    expect(md).toContain('| C | critical-risk case |');
  });

  it('reports missing responses as skipped and errors as errored, and the run as incomplete', async () => {
    const r = await runSuite(suiteWith(), { responses: mock({ A: out('x'), B: { output: null, error: 'HTTP 500' } }) });
    expect(r.cases.map((c) => c.status)).toEqual(['passed', 'errored', 'skipped']);
    expect(r.run.complete).toBe(false);
    expect(r.verdict).toBe('fail'); // implicit threshold: every case must pass
    const lenient = suiteWith({ thresholds: [{ metric: 'label.accuracy', min: 0.5 }] });
    const incomplete = await runSuite(lenient, { responses: mock({ A: out('x'), B: { output: null, error: 'HTTP 500' }, C: out('x') }) });
    expect(incomplete.verdict).toBe('incomplete'); // accuracy 2/2 is met, but B was never evaluated
    expect(incomplete.run.incompleteReasons.join(' ')).toMatch(/1 case\(s\) errored/);
    // A critical-risk case that was not evaluated is itself a critical failure.
    const missingCritical = await runSuite(lenient, { responses: mock({ A: out('x'), B: out('y') }) });
    expect(missingCritical.criticalFailures).toEqual([expect.objectContaining({ caseId: 'C', message: 'not evaluated: no response recorded for this case' })]);
    expect(missingCritical.verdict).toBe('fail');
  });

  it('fails thresholds that cannot be evaluated or lack samples', async () => {
    const s = suiteWith({ thresholds: [{ metric: 'no.such_metric', min: 0 }, { metric: 'label.accuracy', min: 0.5, minSamples: 10 }] });
    const r = await runSuite(s, { responses: mock({ A: out('x'), B: out('y'), C: out('x') }) });
    expect(r.thresholds.map((t) => t.status)).toEqual(['not-evaluable', 'not-met']);
    expect(r.verdict).toBe('fail');
  });

  it('turns a throwing evaluator into an errored case, not a crash', async () => {
    const boom = defineEvaluator({ id: 'boom', version: '1', kind: 'deterministic', evaluate: () => { throw new Error('bug'); } });
    const r = await runSuite(suiteWith({ evaluators: [boom] }), { responses: mock({ A: out('x'), B: out('y'), C: out('x') }) });
    expect(r.cases[0]).toMatchObject({ status: 'errored' });
    expect(r.cases[0]!.checks[0]!.message).toMatch(/evaluator threw: bug/);
  });

  it('applies only the evaluators a case lists in criteria', async () => {
    const never = defineEvaluator({ id: 'never', version: '1', kind: 'deterministic', evaluate: () => [{ evaluator: 'never', criterion: 'x', status: 'fail', severity: 'minor', message: 'always fails' }] });
    const d = dataset([{ id: 'A', input: 'a', expected: { label: 'x' }, criteria: ['label'] }]);
    const s = suiteWith({ dataset: d, evaluators: [labelEvaluator({ labels: ['x'], getLabel: (v) => (v as { label: string }).label }), never] });
    const r = await runSuite(s, { responses: mock({ A: out('x') }) });
    expect(r.cases[0]!.status).toBe('passed');
  });

  it('keeps outputs only as configured', async () => {
    const responses = mock({ A: out('x'), B: out('x'), C: out('x') });
    expect((await runSuite(suiteWith(), { responses })).cases.map((c) => c.output !== undefined)).toEqual([false, true, false]);
    expect((await runSuite(suiteWith(), { responses, outputs: 'none' })).cases.every((c) => c.output === undefined)).toBe(true);
  });

  it('never passes expectations to the target', async () => {
    let seen: unknown[] = [];
    const target: LiveTarget = async (input, c) => {
      seen = [input, c];
      return out('x');
    };
    await runSuite(suiteWith({ live: () => target, limits: { maxRequests: 10 } }), { mode: 'live', env: offlineEnv, caseIds: ['A'] });
    expect(JSON.stringify(seen)).not.toContain('expected');
    expect(JSON.stringify(seen)).not.toContain('"label"');
  });
});

describe('live-run guards', () => {
  const target: LiveTarget = async () => out('x');

  it('refuses live runs inside Vitest by default', async () => {
    await expect(runSuite(suiteWith({ live: () => target, limits: { maxRequests: 10 } }), { mode: 'live' })).rejects.toThrow(LiveRunRefused);
  });

  it('refuses live runs in CI unless explicitly allowed', async () => {
    const s = suiteWith({ live: () => target, limits: { maxRequests: 10 } });
    await expect(runSuite(s, { mode: 'live', env: { CI: 'true' } })).rejects.toThrow(/CI/);
    await expect(runSuite(s, { mode: 'live', env: { CI: 'true', AI_EVAL_ALLOW_LIVE_IN_CI: '1' } })).resolves.toMatchObject({ run: { evidence: 'live' } });
  });

  it('refuses live runs without a target or a request limit', async () => {
    await expect(runSuite(suiteWith(), { mode: 'live', env: offlineEnv })).rejects.toThrow(/no live target/);
    await expect(runSuite(suiteWith({ live: () => target }), { mode: 'live', env: offlineEnv })).rejects.toThrow(/maxRequests/);
  });

  it('plans a live run without calling the target', () => {
    let called = false;
    const s = suiteWith({
      live: () => { called = true; return target; },
      limits: { maxRequests: 2, maxRetriesPerCase: 1, maxCostUsd: 0.01, maxOutputTokensPerRequest: 100, pricing: { inputPerMillionTokensUsd: 1, outputPerMillionTokensUsd: 10, source: 't', checkedOn: '2026-11-24' } },
    });
    const plan = planLiveRun(s);
    expect(called).toBe(false);
    expect(plan.cases).toBe(3);
    expect(plan.worstCase.requests).toBe(6);
    expect(plan.casesWithinLimits).toBe(2);
    expect(plan.warnings.join(' ')).toMatch(/Only 2 of 3 cases fit/);
  });
});

describe('live runs with a fake target', () => {
  const noSleep = async () => {};

  it('stops at the request limit, marks the rest skipped and reports the run incomplete', async () => {
    let calls = 0;
    const s = suiteWith({ live: () => async () => { calls++; return { ...out('x'), usage: { inputTokens: 10, outputTokens: 5 } }; }, limits: { maxRequests: 2 } });
    const r = await runSuite(s, { mode: 'live', env: offlineEnv, sleep: noSleep });
    expect(calls).toBe(2);
    expect(r.cases.map((c) => c.status)).toEqual(['passed', 'failed', 'skipped']);
    expect(r.cases[2]!.skipReason).toMatch(/budget: request limit reached/);
    expect(r.run.complete).toBe(false);
    expect(r.usage!.budget.stopReason).toMatch(/request limit/);
    expect(renderMarkdown(r)).toMatch(/Stopped \| request limit reached/);
  });

  it('retries thrown errors within the limit and counts every attempt', async () => {
    let calls = 0;
    const flaky: LiveTarget = async () => {
      calls++;
      if (calls === 1) throw new Error('503 overloaded, api_key=sk-abcdefghijklmnopqrstuvwxyz');
      return out('x');
    };
    const r = await runSuite(suiteWith({ live: () => flaky, limits: { maxRequests: 10, maxRetriesPerCase: 1 } }), { mode: 'live', env: offlineEnv, caseIds: ['A'], sleep: noSleep });
    expect(r.cases[0]).toMatchObject({ status: 'passed', attempts: 2 });
    expect(r.usage).toMatchObject({ attempts: 2, retries: 1, errors: 1 });
    expect(r.usage!.budget.committed.requests).toBe(2);
  });

  it('redacts secrets from error messages', async () => {
    const failing: LiveTarget = async () => { throw new Error('auth failed for key sk-abcdefghijklmnopqrstuvwxyz'); };
    const r = await runSuite(suiteWith({ live: () => failing, limits: { maxRequests: 10 } }), { mode: 'live', env: offlineEnv, caseIds: ['A'], sleep: noSleep });
    expect(r.cases[0]!.error).toContain('[redacted]');
    expect(r.cases[0]!.error).not.toContain('abcdefghijkl');
  });

  it('times out a target that never answers and keeps its worst case committed', async () => {
    const hang: LiveTarget = (_i, c) => new Promise((_r, reject) => c.signal.addEventListener('abort', () => reject(new Error('aborted'))));
    const pricing = { inputPerMillionTokensUsd: 1, outputPerMillionTokensUsd: 10, source: 't', checkedOn: '2026-11-24' };
    const s = suiteWith({ live: () => hang, limits: { maxRequests: 5, timeoutMs: 20, maxCostUsd: 1, pricing, maxOutputTokensPerRequest: 100 } });
    const r = await runSuite(s, { mode: 'live', env: offlineEnv, caseIds: ['A'], sleep: noSleep });
    expect(r.cases[0]!.status).toBe('errored');
    expect(r.cases[0]!.error).toMatch(/timed out after 20 ms/);
    expect(r.usage!.timeouts).toBe(1);
    expect(r.usage!.budget.cost.reservedUnknownUsd).toBeGreaterThan(0);
  });

  it('bounds spend across concurrent requests', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    let calls = 0;
    const slow: LiveTarget = async () => {
      calls++;
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
      return { ...out('x'), usage: { inputTokens: 1000, outputTokens: 100 } };
    };
    const pricing = { inputPerMillionTokensUsd: 1, outputPerMillionTokensUsd: 10, source: 't', checkedOn: '2026-11-24' };
    // Each request reserves $0.002 at worst; $0.005 admits two in flight, never three.
    const s = suiteWith({ live: () => slow, limits: { maxRequests: 10, concurrency: 3, maxCostUsd: 0.005, pricing, maxOutputTokensPerRequest: 100, estimateInputTokens: () => 1000 } });
    const r = await runSuite(s, { mode: 'live', env: offlineEnv, sleep: noSleep });
    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(r.usage!.budget.committed.costUsd).toBeLessThanOrEqual(0.005);
    expect(calls).toBe(2);
    expect(r.summary.skipped).toBe(1);
    expect(r.cases.find((c) => c.status === 'skipped')!.skipReason).toMatch(/cost limit/);
  });

  it('records live responses for offline replay', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ai-eval-'));
    const file = join(dir, 'recorded.json');
    const s = suiteWith({ live: () => async () => ({ ...out('x'), model: 'fake-1' }), limits: { maxRequests: 10 }, target: { model: 'fake-1' } });
    const live = await runSuite(s, { mode: 'live', env: offlineEnv, recordTo: file, sleep: noSleep });
    const saved = JSON.parse(readFileSync(file, 'utf8')) as ResponsesFile;
    expect(saved.origin).toBe('recorded');
    expect(Object.keys(saved.responses)).toEqual(['A', 'B', 'C']);
    const replay = await runSuite(s, { responses: file });
    expect(replay.run.evidence).toBe('recorded');
    expect(replay.cases.map((c) => c.status)).toEqual(live.cases.map((c) => c.status));
    expect(replay.target.model).toBe('fake-1');
  });
});
