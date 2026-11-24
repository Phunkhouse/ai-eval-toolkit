import type { Metric, Table } from '../types.ts';
/** Predictions that are not a valid label. Each counts as wrong for the expected class. */
export declare const INVALID = "(invalid)";
export declare const NO_LABEL = "(no label)";
export interface LabelPair {
    caseId: string;
    expected: string;
    /** A label from the label set, INVALID (unparseable or outside the set) or NO_LABEL (no prediction). */
    predicted: string;
}
export interface ClassMetrics {
    label: string;
    support: number;
    predicted: number;
    tp: number;
    fp: number;
    fn: number;
    /** tp / (tp + fp); null when the class was never predicted. */
    precision: number | null;
    /** tp / support; null when the class never occurs in the expected labels. */
    recall: number | null;
    /** 2tp / (2tp + fp + fn); null only when the class was neither expected nor predicted. */
    f1: number | null;
}
export interface ClassificationResult {
    n: number;
    correct: number;
    validPredictions: number;
    perClass: ClassMetrics[];
    /** Mean F1 over classes with support > 0. Classes absent from the expected labels are excluded and listed. */
    macroF1: number | null;
    excludedFromMacro: string[];
    confusion: {
        labels: string[];
        predictedColumns: string[];
        counts: number[][];
    };
}
/**
 * Single-label classification metrics.
 *
 * - Accuracy is correct / n, where n counts every pair, including invalid and missing predictions.
 * - Invalid and missing predictions are false negatives for the expected class and false positives
 *   for no class, so they lower recall but not any class's precision.
 * - A ratio with a zero denominator is `null`, never 0 or 1.
 * - Cases expected to abstain have no expected label and must be left out by the caller; they are
 *   measured by the behavior evaluator.
 */
export declare function classificationMetrics(pairs: LabelPair[], labels: string[]): ClassificationResult;
/** Flatten a classification result into report metrics and tables. */
export declare function classificationReport(prefix: string, r: ClassificationResult): {
    metrics: Metric[];
    tables: Table[];
};
