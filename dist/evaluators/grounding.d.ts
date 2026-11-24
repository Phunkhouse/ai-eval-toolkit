import type { EvaluationContext, Evaluator, Severity } from '../types.ts';
import { type TextMatch } from './util.ts';
export interface Citation {
    /** The source the output says the quotation comes from. Optional when a case has one source. */
    sourceId?: string | null;
    quote: string;
}
export interface QuoteEvaluatorOptions {
    /** Where the citations are in the parsed output. Return undefined or [] when there are none. */
    getCitations: (parsed: unknown, ctx: EvaluationContext) => Citation[] | undefined | null;
    id?: string;
    /** How quotations are matched. Default `normalized` (whitespace, typographic quotes and dashes; case kept). */
    match?: TextMatch;
    /** Quotations shorter than this (after normalization) fail: "the invoice" exists in every invoice. Default 12. */
    minQuoteLength?: number;
    /**
     * Whether an answer must cite something. `when-answering` (default) requires citations unless the
     * case expects an abstention or refusal. `always` and `never` do what they say.
     */
    requireCitations?: 'when-answering' | 'always' | 'never';
    /**
     * Accept quotations with "..." between fragments when every fragment appears, in order, in the
     * source. Off by default: an elided quotation is not an exact quotation.
     */
    allowEllipsis?: boolean;
    /** Also require that each `expected.evidence` quotation is covered by a citation. Default false. */
    requireExpectedEvidence?: boolean;
    severity?: Partial<Record<'fabricated' | 'unknownSource' | 'misattributed' | 'missing' | 'tooShort' | 'expectedEvidence', Severity>>;
}
/**
 * Verifies quotations against the case's source documents.
 *
 * It checks **citation existence** (the quoted text occurs in a source) and **citation attribution**
 * (it occurs in the source the output names). It does **not** check semantic support (whether the
 * quotation supports the claim made with it) or factual correctness; a real quotation can be used
 * to justify a wrong conclusion. Use a label, field or human check for that.
 */
export declare function quoteEvaluator(options: QuoteEvaluatorOptions): Evaluator;
