import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { fromValidateFunction, parseJsonOutput, schemaEvaluator } from '../src/index.ts';
import { ctx } from './helpers.ts';

describe('parseJsonOutput', () => {
  it('parses JSON text and passes parsed objects through', () => {
    expect(parseJsonOutput('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseJsonOutput({ a: 1 })).toEqual({ ok: true, value: { a: 1 } });
  });

  it('reports empty, non-text and malformed output explicitly', () => {
    expect(parseJsonOutput('  ')).toMatchObject({ ok: false, reason: 'empty' });
    expect(parseJsonOutput(42)).toMatchObject({ ok: false, reason: 'not-text' });
    expect(parseJsonOutput("{'a': 1}")).toMatchObject({ ok: false, reason: 'malformed' });
  });

  it('says when output looks truncated', () => {
    const r = parseJsonOutput('{"a": [1, 2, {"b": "unfinished');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toMatch(/looks truncated/);
    const complete = parseJsonOutput('{"a": 1}}');
    expect(!complete.ok && complete.message).not.toMatch(/truncated/);
  });

  it('rejects a code fence unless allowed', () => {
    const fenced = '```json\n{"a":1}\n```';
    const strict = parseJsonOutput(fenced);
    expect(!strict.ok && strict.message).toMatch(/code fence/);
    expect(parseJsonOutput(fenced, { allowCodeFence: true })).toEqual({ ok: true, value: { a: 1 } });
  });
});

describe('schemaEvaluator', () => {
  const schema = z.strictObject({ label: z.enum(['a', 'b']), score: z.number() });
  const ev = schemaEvaluator({ schema });

  it('passes valid output', async () => {
    const checks = await ev.evaluate(ctx({}, '{"label":"a","score":1}'));
    expect(checks.map((c) => `${c.criterion}:${c.status}`)).toEqual(['parse:pass', 'schema:pass']);
  });

  it('fails malformed output as a critical parse failure', async () => {
    const [c] = await ev.evaluate(ctx({}, '{"label": "a"'));
    expect(c).toMatchObject({ criterion: 'parse', status: 'fail', severity: 'critical' });
  });

  it('names the path of every schema violation, including unexpected fields', async () => {
    const checks = await ev.evaluate(ctx({}, '{"label":"c","score":"high","extra":true}'));
    const schemaCheck = checks.find((c) => c.criterion === 'schema')!;
    expect(schemaCheck.status).toBe('fail');
    expect(schemaCheck.message).toMatch(/label/);
    expect(schemaCheck.message).toMatch(/score/);
    expect(JSON.stringify(schemaCheck.details)).toMatch(/extra|unrecognized/i);
  });

  it('accepts an Ajv-style validate function', async () => {
    // Shaped like an Ajv compiled validator: returns a boolean and leaves errors on itself.
    const ajvLike = Object.assign(
      (v: unknown): boolean => {
        const ok = typeof (v as { n?: unknown }).n === 'number';
        ajvLike.errors = ok ? null : [{ instancePath: '/n', message: 'must be number' }];
        return ok;
      },
      { errors: null as null | Array<{ instancePath: string; message: string }> },
    );
    const ev2 = schemaEvaluator({ schema: fromValidateFunction(ajvLike) });
    expect((await ev2.evaluate(ctx({}, '{"n":1}'))).at(-1)!.status).toBe('pass');
    const failed = (await ev2.evaluate(ctx({}, '{"n":"1"}'))).at(-1)!;
    expect(failed).toMatchObject({ status: 'fail' });
    expect(failed.message).toContain('/n: must be number');
  });
});
