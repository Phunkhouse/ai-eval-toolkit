import type { Evaluator, Severity } from '../types.ts';
export interface ForbiddenPattern {
    id: string;
    /** A RegExp, or a string matched case-insensitively after whitespace normalization. */
    pattern: RegExp | string;
    severity?: Severity;
    description?: string;
}
export interface ForbiddenContentOptions {
    /** Patterns checked on every case, for example a secret canary or a system-prompt marker. */
    patterns?: ForbiddenPattern[];
    /** Also check each case's `expected.forbidden` strings. Default true. */
    useCaseForbidden?: boolean;
    id?: string;
    severity?: Severity;
}
/**
 * Detects content that must never appear in the output: an injected instruction's payload, a
 * canary planted in a source or system prompt, personal data. Matches the raw output as text
 * (objects as JSON). Absence of a listed string is not evidence of safety in general.
 */
export declare function forbiddenContentEvaluator(options?: ForbiddenContentOptions): Evaluator;
export interface ToolCallOptions {
    /** Tools the system may call at all. A call outside this list is unauthorized. Omit to skip the check. */
    allowed?: string[];
    id?: string;
    severity?: Severity;
}
/**
 * Checks the tool calls a response reports (`response.toolCalls`) against the case's
 * `expected.toolCalls` (required and forbidden names) and an optional global allowlist.
 * It checks names only, not arguments.
 */
export declare function toolCallEvaluator(options?: ToolCallOptions): Evaluator;
