import { type Report } from '../reporting/report.ts';
import type { Split } from '../types.ts';
import { type LiveLimits } from './budget.ts';
import { type ResponsesFile } from './responses.ts';
import { type Suite } from './suite.ts';
export declare class LiveRunRefused extends Error {
    constructor(message: string);
}
export interface RunOptions {
    /** Offline (default) replays a responses file. Live calls the suite's live target and must be chosen explicitly. */
    mode?: 'offline' | 'live';
    /** Responses for offline runs; overrides the suite's. A path, file URL or parsed file. */
    responses?: string | URL | ResponsesFile;
    /** Which split to run. Default `dev`. */
    split?: Split | 'all';
    caseIds?: string[];
    tags?: string[];
    /** Overrides for the suite's live limits (for example a lower maxRequests on the command line). */
    limits?: Partial<LiveLimits>;
    /** Live only: write the responses to this file so the run can be replayed offline. */
    recordTo?: string;
    outputs?: 'none' | 'failed' | 'all';
    /** A baseline report to compare with. */
    baseline?: Report;
    /** Environment for the live-run guards. Default process.env. */
    env?: Record<string, string | undefined>;
    /** For tests: clock in milliseconds, pause function and run timestamp. */
    clock?: () => number;
    sleep?: (ms: number) => Promise<void>;
    now?: () => Date;
    log?: (message: string) => void;
}
export interface LivePlan {
    cases: number;
    maxAttempts: number;
    limits: LiveLimits;
    worstCase: {
        requests: number;
        inputTokens: number;
        outputTokens: number;
        costUsd: number | null;
    };
    /** Cases that fit within the limits at their worst case, in order. */
    casesWithinLimits: number;
    warnings: string[];
}
/** Throws LiveRunRefused unless a live run is explicitly and safely configured. */
export declare function assertLiveAllowed(suite: Suite, limits: LiveLimits | undefined, env: Record<string, string | undefined>): asserts limits is LiveLimits;
/** The worst case of a live run, without calling anything. */
export declare function planLiveRun(suite: Suite, options?: RunOptions): LivePlan;
/** Runs a suite and returns its report. Writes nothing except a recorded responses file when asked. */
export declare function runSuite(suite: Suite, options?: RunOptions): Promise<Report>;
