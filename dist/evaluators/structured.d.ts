import type { Evaluator, ParseResult, Severity } from '../types.ts';
export interface StandardSchemaV1<Input = unknown, Output = Input> {
    readonly '~standard': {
        readonly version: 1;
        readonly vendor: string;
        readonly validate: (value: unknown) => StandardResult<Output> | Promise<StandardResult<Output>>;
        readonly types?: {
            readonly input: Input;
            readonly output: Output;
        } | undefined;
    };
}
type StandardResult<Output> = {
    readonly value: Output;
    readonly issues?: undefined;
} | {
    readonly issues: ReadonlyArray<StandardIssue>;
};
interface StandardIssue {
    readonly message: string;
    readonly path?: ReadonlyArray<PropertyKey | {
        readonly key: PropertyKey;
    }> | undefined;
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
    validate(value: unknown): {
        ok: true;
    } | {
        ok: false;
        issues: SchemaIssue[];
    } | Promise<{
        ok: true;
    } | {
        ok: false;
        issues: SchemaIssue[];
    }>;
}
/**
 * Wrap an Ajv-style compiled validator (`const v = ajv.compile(schema)`): a function returning a
 * boolean with errors on `v.errors`.
 */
export declare function fromValidateFunction(fn: ((value: unknown) => boolean) & {
    errors?: Array<{
        instancePath?: string;
        message?: string;
    }> | null;
}, vendor?: string): ValidateFunction;
export declare function validateWithSchema(schema: OutputSchema, value: unknown): Promise<{
    ok: true;
} | {
    ok: false;
    issues: SchemaIssue[];
}>;
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
export declare function parseJsonOutput(raw: unknown, options?: ParseJsonOptions): ParseResult;
/** A parser that accepts any output as is, for plain-text tasks. */
export declare function parseText(raw: unknown): ParseResult;
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
export declare function schemaEvaluator(options: SchemaEvaluatorOptions): Evaluator;
export {};
