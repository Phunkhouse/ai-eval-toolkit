import type { Evaluator, ParseResult, Severity } from '../types.ts';
import { ratio } from '../metrics/stats.ts';
import { check } from './util.ts';

// ---------- Standard Schema (https://standardschema.dev), copied per the spec so no dependency is needed ----------

export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) => StandardResult<Output> | Promise<StandardResult<Output>>;
    readonly types?: { readonly input: Input; readonly output: Output } | undefined;
  };
}
type StandardResult<Output> = { readonly value: Output; readonly issues?: undefined } | { readonly issues: ReadonlyArray<StandardIssue> };
interface StandardIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
}

/** A validator from any library: Zod, Valibot, ArkType (Standard Schema) or a wrapped function such as an Ajv validator. */
export type OutputSchema = StandardSchemaV1 | ValidateFunction;

export interface SchemaIssue {
  path: string;
  message: string;
}

/** A plain validation function, for libraries without Standard Schema support. */
export interface ValidateFunction {
  vendor: string;
  validate(value: unknown): { ok: true } | { ok: false; issues: SchemaIssue[] } | Promise<{ ok: true } | { ok: false; issues: SchemaIssue[] }>;
}

/**
 * Wrap an Ajv-style compiled validator (`const v = ajv.compile(schema)`): a function returning a
 * boolean with errors on `v.errors`.
 */
export function fromValidateFunction(
  fn: ((value: unknown) => boolean) & { errors?: Array<{ instancePath?: string; message?: string }> | null },
  vendor = 'json-schema',
): ValidateFunction {
  return {
    vendor,
    validate(value) {
      if (fn(value)) return { ok: true };
      const issues = (fn.errors ?? []).map((e) => ({ path: e.instancePath || '/', message: e.message ?? 'invalid' }));
      return { ok: false, issues: issues.length ? issues : [{ path: '/', message: 'invalid' }] };
    },
  };
}

export async function validateWithSchema(schema: OutputSchema, value: unknown): Promise<{ ok: true } | { ok: false; issues: SchemaIssue[] }> {
  if ('~standard' in schema) {
    const result = await schema['~standard'].validate(value);
    if (!result.issues) return { ok: true };
    return {
      ok: false,
      issues: result.issues.map((i) => ({
        path: (i.path ?? []).map((seg) => String(typeof seg === 'object' && seg !== null && 'key' in seg ? seg.key : seg)).join('.') || '(root)',
        message: i.message,
      })),
    };
  }
  return schema.validate(value);
}

function schemaVendor(schema: OutputSchema): string {
  return '~standard' in schema ? schema['~standard'].vendor : schema.vendor;
}

// ---------- Parsing ----------

export interface ParseJsonOptions {
  /**
   * Accept a single Markdown code fence around the JSON. Off by default: if the application parses
   * strictly, the evaluation should too.
   */
  allowCodeFence?: boolean;
}

/**
 * Parse a model's output as JSON, with explicit outcomes for empty and malformed output. Objects
 * that are already parsed (a provider's structured output) pass through.
 */
export function parseJsonOutput(raw: unknown, options: ParseJsonOptions = {}): ParseResult {
  if (raw !== null && typeof raw === 'object') return { ok: true, value: raw };
  if (typeof raw !== 'string') return { ok: false, reason: 'not-text', message: `output is ${raw === null ? 'null' : typeof raw}, not text` };
  let text = raw.trim();
  if (text === '') return { ok: false, reason: 'empty', message: 'output is empty' };
  if (options.allowCodeFence) {
    const fence = /^```[A-Za-z0-9_-]*\s*\n([\s\S]*?)\n?```$/.exec(text);
    if (fence) text = (fence[1] ?? '').trim();
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    const truncated = looksTruncated(text) ? '; it looks truncated (unclosed string, object or array)' : '';
    const fenced = !options.allowCodeFence && text.startsWith('```') ? '; it is wrapped in a code fence, which strict parsing rejects' : '';
    return { ok: false, reason: 'malformed', message: `not valid JSON: ${(e as Error).message}${truncated}${fenced}` };
  }
}

/** True when the text ends inside a string or with unclosed brackets, as a cut-off response does. */
function looksTruncated(text: string): boolean {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') depth--;
  }
  return inString || depth > 0;
}

/** A parser that accepts any output as is, for plain-text tasks. */
export function parseText(raw: unknown): ParseResult {
  if (typeof raw !== 'string') return { ok: false, reason: 'not-text', message: `output is ${typeof raw}, not text` };
  if (raw.trim() === '') return { ok: false, reason: 'empty', message: 'output is empty' };
  return { ok: true, value: raw };
}

// ---------- Evaluator ----------

export interface SchemaEvaluatorOptions {
  schema: OutputSchema;
  id?: string;
  /** Severity of a parse or schema failure. Default: critical, because downstream code cannot use such output. */
  severity?: Severity;
}

/**
 * Checks that the output parsed and matches the schema. Model abstentions and refusals should be
 * part of the schema (for example a discriminated union) so that a valid abstention passes here
 * and is judged by the behavior evaluator.
 */
export function schemaEvaluator(options: SchemaEvaluatorOptions): Evaluator {
  const id = options.id ?? 'schema';
  const severity = options.severity ?? 'critical';
  return {
    id,
    version: '1',
    kind: 'deterministic',
    description: 'Output parses and matches the schema',
    config: { vendor: schemaVendor(options.schema), severity },
    async evaluate(ctx) {
      if (!ctx.parsed.ok) return [check(id, 'parse', 'fail', severity, ctx.parsed.message, { reason: ctx.parsed.reason })];
      const result = await validateWithSchema(options.schema, ctx.parsed.value);
      if (result.ok) return [check(id, 'parse', 'pass', severity, 'output parsed'), check(id, 'schema', 'pass', severity, 'matches schema')];
      const list = result.issues.slice(0, 5).map((i) => `${i.path}: ${i.message}`).join('; ');
      const more = result.issues.length > 5 ? ` (+${result.issues.length - 5} more)` : '';
      return [check(id, 'parse', 'pass', severity, 'output parsed'), check(id, 'schema', 'fail', severity, `schema violations: ${list}${more}`, { issues: result.issues })];
    },
    summarize(cases) {
      let parsed = 0;
      let valid = 0;
      const reasons: Record<string, number> = {};
      for (const c of cases) {
        if (c.parsed.ok) parsed++;
        else reasons[c.parsed.reason] = (reasons[c.parsed.reason] ?? 0) + 1;
        if (c.checks.some((k) => k.criterion === 'schema' && k.status === 'pass')) valid++;
      }
      const n = cases.length;
      const notes = Object.entries(reasons).map(([r, k]) => `${k} output(s) ${r}`);
      return {
        metrics: [
          ratio(`${id}.parse_rate`, parsed, n),
          ratio(`${id}.valid_rate`, valid, n),
        ],
        notes,
      };
    },
  };
}
