import type { EvaluationContext, Evaluator, Severity } from '../types.ts';
export interface LabelEvaluatorOptions {
    /** The label set. A prediction outside it is invalid. */
    labels: string[];
    /** Where the predicted label is in the parsed output. Return null or undefined when there is none. */
    getLabel: (parsed: unknown, ctx: EvaluationContext) => unknown;
    id?: string;
    severity?: Severity;
}
/**
 * Single-label classification: the prediction is present, in the label set and equal to
 * `expected.label`. Cases expecting an abstention or refusal are left to the behavior evaluator.
 * Contributes accuracy, per-class precision/recall/F1, macro-F1 and a confusion matrix.
 */
export declare function labelEvaluator(options: LabelEvaluatorOptions): Evaluator;
