import type { EvaluationContext, Evaluator, Severity } from '../types.ts';
export type FieldSpec = 'exact' | {
    type: 'exact';
    severity?: Severity;
} | {
    type: 'number';
    abs?: number;
    rel?: number;
    severity?: Severity;
} | {
    type: 'string';
    match?: 'exact' | 'normalized' | 'case-insensitive';
    severity?: Severity;
} | {
    type: 'date';
    severity?: Severity;
} | {
    type: 'custom';
    compare: (expected: unknown, actual: unknown) => boolean;
    description: string;
    severity?: Severity;
};
export interface FieldsEvaluatorOptions {
    /** How each field is compared. Only fields listed here and present in `expected.fields` are checked. */
    fields: Record<string, FieldSpec>;
    /** Where the extracted fields are in the parsed output. */
    getFields: (parsed: unknown, ctx: EvaluationContext) => Record<string, unknown> | null | undefined;
    id?: string;
    severity?: Severity;
}
/**
 * Field-level extraction checks against `expected.fields`. An expected `null` means the value is not
 * in the source and the output must leave it empty, which catches invented values. Cases expecting
 * an abstention or refusal are left to the behavior evaluator.
 */
export declare function fieldsEvaluator(options: FieldsEvaluatorOptions): Evaluator;
