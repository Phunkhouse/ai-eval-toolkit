import type { CaseStatus } from '../types.ts';
import { type Report } from './report.ts';
export type Compatibility = 'comparable' | 'partially-comparable' | 'not-comparable';
export interface Comparison {
    baseline: {
        runId: string;
        startedAt: string;
        evidence: string;
        datasetVersion: string;
        suiteVersion: string;
        model?: string;
        promptVersion?: string;
    };
    compatibility: Compatibility;
    /** Why the runs are not fully comparable, and anything else a reader must know. */
    reasons: string[];
    cases: {
        /** failed or errored before, passed now (same case content) */
        improved: string[];
        /** passed before, failed or errored now (same case content) */
        regressed: string[];
        stillFailing: string[];
        /** cases not in the baseline, with their status now */
        added: Array<{
            id: string;
            status: CaseStatus;
        }>;
        removed: string[];
        /** present in both, but the case content changed; not compared */
        changed: string[];
        statusChanges: Array<{
            id: string;
            from: CaseStatus;
            to: CaseStatus;
        }>;
    };
    /** Only when comparable: same dataset content, same criteria, same case selection. */
    metrics: Array<{
        name: string;
        baseline: number | null;
        current: number | null;
        delta: number | null;
    }>;
    usage: Array<{
        name: string;
        baseline: number | null;
        current: number | null;
        delta: number | null;
    }>;
}
/**
 * Compares a run with a baseline run. Case-level changes are reported only for cases whose content
 * is unchanged, and aggregate deltas only when the runs are fully comparable. Runs with different
 * criteria, or mock evidence on one side and model evidence on the other, are not comparable.
 */
export declare function compareReports(baseline: Report, current: Report): Comparison;
