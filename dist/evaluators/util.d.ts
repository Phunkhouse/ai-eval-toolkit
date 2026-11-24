import type { CheckResult, CheckStatus, EvaluationContext, Severity } from '../types.ts';
export declare function check(evaluator: string, criterion: string, status: CheckStatus, severity: Severity, message: string, details?: unknown): CheckResult;
/** A check that could not run because the output did not parse; the parse failure itself is reported by the schema evaluator. */
export declare function notParsed(evaluator: string, criterion: string, severity: Severity, ctx: EvaluationContext): CheckResult;
export type TextMatch = 'exact' | 'normalized' | 'normalized-case-insensitive';
/**
 * Normalization for quotation matching: Unicode NFKC, typographic quotes, dashes and ellipses to
 * ASCII, non-breaking spaces and runs of whitespace to one space, trimmed. Case is kept unless asked.
 */
export declare function normalizeText(text: string, mode: TextMatch): string;
/** Text form of an output, for content checks: strings as is, anything else as JSON. */
export declare function outputText(raw: unknown): string;
export declare function describeValue(v: unknown): string;
