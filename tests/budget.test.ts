import { describe, expect, it } from 'vitest';
import { BudgetGuard, validateLimits, type LiveLimits } from '../src/index.ts';

const pricing = { inputPerMillionTokensUsd: 1, outputPerMillionTokensUsd: 10, source: 'test', checkedOn: '2026-11-24' };
const reserve = (g: BudgetGuard, input = 1000) => g.reserve(input);
const denied = (r: ReturnType<BudgetGuard['reserve']>) => ('denied' in r ? r.denied : undefined);

describe('validateLimits', () => {
  it('requires a request limit, and pricing and an output cap for a cost limit', () => {
    expect(validateLimits({} as LiveLimits).join()).toMatch(/maxRequests/);
    const p = validateLimits({ maxRequests: 5, maxCostUsd: 1 });
    expect(p.join()).toMatch(/pricing/);
    expect(p.join()).toMatch(/maxOutputTokensPerRequest/);
    expect(validateLimits({ maxRequests: 5, maxCostUsd: 1, pricing, maxOutputTokensPerRequest: 100 })).toEqual([]);
  });
});

describe('BudgetGuard', () => {
  it('stops at the request limit, counting requests in flight', () => {
    const g = new BudgetGuard({ maxRequests: 2 });
    expect(denied(reserve(g))).toBeUndefined();
    expect(denied(reserve(g))).toBeUndefined();
    expect(denied(reserve(g))).toMatch(/request limit/);
    expect(g.stopReason).toMatch(/request limit/);
  });

  it('reserves worst-case cost for in-flight requests before they report usage', () => {
    // Worst case per request: 1000 input ($0.001) + 100 output ($0.001) = $0.002.
    const g = new BudgetGuard({ maxRequests: 100, maxCostUsd: 0.005, pricing, maxOutputTokensPerRequest: 100 });
    const a = reserve(g);
    const b = reserve(g);
    expect(denied(a)).toBeUndefined();
    expect(denied(b)).toBeUndefined();
    // Two in flight hold $0.004; a third would need $0.006 > $0.005 even though nothing has been spent yet.
    expect(denied(reserve(g))).toMatch(/cost limit/);
  });

  it('replaces a reservation with reported usage, and keeps the worst case when usage is unknown', () => {
    const g = new BudgetGuard({ maxRequests: 10, maxCostUsd: 1, pricing, maxOutputTokensPerRequest: 100 });
    const a = reserve(g);
    const b = reserve(g);
    if ('denied' in a || 'denied' in b) throw new Error('unexpected');
    expect(g.settle(a, { inputTokens: 500, outputTokens: 10 })).toEqual({ costUsd: 0.0006, costSource: 'estimated' });
    expect(g.settle(b, undefined)).toEqual({ costUsd: 0.002, costSource: 'unknown' });
    const snap = g.snapshot();
    expect(snap.committed.requests).toBe(2);
    expect(snap.committed.costUsd).toBeCloseTo(0.0026, 10);
    expect(snap.cost.reservedUnknownUsd).toBeCloseTo(0.002, 10);
    expect(snap.inFlight.requests).toBe(0);
  });

  it('records provider-reported cost separately from estimates', () => {
    const g = new BudgetGuard({ maxRequests: 10, pricing });
    const a = reserve(g);
    if ('denied' in a) throw new Error('unexpected');
    expect(g.settle(a, { inputTokens: 1, outputTokens: 1, costUsd: 0.5, costSource: 'provider-reported' })).toEqual({ costUsd: 0.5, costSource: 'provider-reported' });
    expect(g.snapshot().cost.providerReportedUsd).toBe(0.5);
  });

  it('stops after a response that exceeds its reservation', () => {
    const g = new BudgetGuard({ maxRequests: 10, maxCostUsd: 1, pricing, maxOutputTokensPerRequest: 100 });
    const a = reserve(g);
    if ('denied' in a) throw new Error('unexpected');
    g.settle(a, { inputTokens: 1000, outputTokens: 5000 });
    expect(g.snapshot().overruns[0]).toMatch(/5000 output tokens > 100/);
    expect(denied(reserve(g))).toMatch(/exceeded its reservation/);
  });

  it('counts several provider requests reported by one target call', () => {
    const g = new BudgetGuard({ maxRequests: 3 });
    const a = reserve(g);
    if ('denied' in a) throw new Error('unexpected');
    g.settle(a, { inputTokens: 10, outputTokens: 10, providerRequests: 3 });
    expect(g.snapshot().committed.requests).toBe(3);
    expect(denied(reserve(g))).toBeDefined();
  });

  it('enforces token limits', () => {
    const g = new BudgetGuard({ maxRequests: 10, maxInputTokens: 1500 });
    expect(denied(reserve(g, 1000))).toBeUndefined();
    expect(denied(reserve(g, 1000))).toMatch(/input token limit/);
  });
});
