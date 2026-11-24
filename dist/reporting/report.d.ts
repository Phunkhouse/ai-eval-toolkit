import type { CaseResult, EvidenceKind, Metric, Split, Table } from '../types.ts';
import type { BudgetSnapshot, LiveLimits } from '../runner/budget.ts';
import type { TargetInfo, Threshold } from '../runner/suite.ts';
import type { Comparison } from './compare.ts';
export declare const REPORT_FORMAT = "ai-eval-report/1";
export interface ThresholdResult extends Threshold {
    status: 'met' | 'not-met' | 'not-evaluable';
    value: number | null;
    denominator?: number;
    message: string;
    implicit?: boolean;
}
export interface CriticalFailure {
    caseId: string;
    reason: 'critical-check' | 'critical-risk-case';
    evaluator?: string;
    criterion?: string;
    message: string;
}
export interface Report {
    format: typeof REPORT_FORMAT;
    run: {
        id: string;
        startedAt: string;
        finishedAt: string;
        durationMs: number;
        mode: 'offline' | 'live';
        evidence: EvidenceKind;
        split: Split | 'all';
        filters: {
            caseIds?: string[];
            tags?: string[];
        };
        complete: boolean;
        incompleteReasons: string[];
        toolkitVersion: string;
        node: string;
        responsesFile?: string;
        recordedTo?: string;
    };
    suite: {
        id: string;
        version: string;
        description?: string;
        evaluators: Array<{
            id: string;
            version: string;
            kind: string;
            description?: string;
            config?: unknown;
        }>;
        /** Hash of evaluator ids, versions, kinds and configurations. Different hashes mean different criteria. */
        criteriaHash: string;
    };
    dataset: {
        id: string;
        version: string;
        fingerprint: string;
        path?: string;
        totalCases: number;
        selectedCases: number;
        splits: Record<Split, number>;
        annotation: Record<string, number>;
        origins: Record<string, number>;
        warnings: string[];
    };
    target: TargetInfo & {
        modelsObserved: string[];
        recordedAt?: string;
        responsesDescription?: string;
    };
    verdict: 'pass' | 'fail' | 'incomplete';
    summary: {
        selected: number;
        passed: number;
        failed: number;
        errored: number;
        skipped: number;
        checks: Record<'pass' | 'fail' | 'error' | 'skipped', number>;
        byTag: Record<string, {
            total: number;
            passed: number;
            failed: number;
            errored: number;
            skipped: number;
        }>;
        byRisk: Record<string, {
            total: number;
            passed: number;
            failed: number;
            errored: number;
            skipped: number;
        }>;
    };
    criticalFailures: CriticalFailure[];
    thresholds: ThresholdResult[];
    metrics: Metric[];
    tables: Array<Table & {
        evaluator?: string;
    }>;
    notes: string[];
    usage?: {
        limits: Omit<LiveLimits, 'estimateInputTokens'> & {
            estimateInputTokens?: string;
        };
        budget: BudgetSnapshot;
        attempts: number;
        retries: number;
        timeouts: number;
        errors: number;
        latencyMs: {
            n: number;
            p50?: number;
            p95?: number;
            max?: number;
        };
    };
    recordedUsage?: {
        latencyMs: {
            n: number;
            p50?: number;
            p95?: number;
            max?: number;
        };
        costUsd: number | null;
        costSources: Record<string, number>;
        inputTokens: number;
        outputTokens: number;
    };
    cases: CaseResult[];
    limitations: string[];
    nextActions: string[];
    comparison?: Comparison;
}
type Counts = {
    total: number;
    passed: number;
    failed: number;
    errored: number;
    skipped: number;
};
export declare function tally(cases: CaseResult[], keyOf: (c: CaseResult) => string[]): Record<string, Counts>;
export declare function evaluateThresholds(thresholds: Threshold[] | undefined, metrics: Metric[]): ThresholdResult[];
export declare function findCriticalFailures(cases: CaseResult[]): CriticalFailure[];
export declare function latencyStats(values: number[]): {
    n: number;
    p50?: number;
    p95?: number;
    max?: number;
};
/** Run-level metrics every report has, before evaluator metrics. */
export declare function caseMetrics(cases: CaseResult[], criticalFailures: number): Metric[];
export interface LimitationInput {
    evidence: EvidenceKind;
    selected: number;
    recordedAt?: string;
    evaluatorLimitations: string[];
    judgeEvaluators: string[];
    unreviewedSynthetic: number;
    disputed: number;
    split: Split | 'all';
    holdoutSelected: number;
    budgetStop?: string;
    live: boolean;
}
export declare function limitationsFor(i: LimitationInput): string[];
export declare function nextActionsFor(r: Pick<Report, 'criticalFailures' | 'thresholds' | 'summary' | 'run' | 'comparison' | 'metrics' | 'cases'>, unreviewedSynthetic: number): string[];
export {};
