import type { Dataset, EvalCase, SourceDocument, Split } from './types.ts';
export declare const DATASET_FORMAT = "ai-eval-dataset/1";
export interface DatasetIssue {
    level: 'error' | 'warning';
    path: string;
    message: string;
}
export declare class DatasetError extends Error {
    readonly issues: DatasetIssue[];
    constructor(message: string, issues: DatasetIssue[]);
}
/**
 * Structural validation of a dataset. Errors make the dataset unusable; warnings are reported
 * (for example synthetic expectations nobody has reviewed) but do not stop a run.
 */
export declare function validateDataset(data: unknown): DatasetIssue[];
/** Parse and validate a dataset; throws DatasetError on any error. */
export declare function parseDataset(data: unknown): {
    dataset: Dataset;
    warnings: DatasetIssue[];
};
export declare function loadDataset(path: string): {
    dataset: Dataset;
    warnings: DatasetIssue[];
};
/** The case's own sources followed by any dataset-level sources it references. */
export declare function resolveSources(dataset: Dataset, c: EvalCase): SourceDocument[];
export declare function caseSplit(dataset: Dataset, c: EvalCase): Split;
/**
 * Hash of what a case measures: input, resolved sources, expectations and criteria. Metadata
 * (tags, annotation, provenance, notes) is excluded, so approving a case does not break comparisons.
 */
export declare function caseHash(dataset: Dataset, c: EvalCase): string;
/** Fingerprint of the whole dataset's measured content. */
export declare function datasetFingerprint(dataset: Dataset): string;
