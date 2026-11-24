import type { Dataset, Evaluator, ParseResult, SourceDocument, TargetResponse } from '../types.ts';
import type { LiveLimits } from './budget.ts';
import type { ResponsesFile } from './responses.ts';
export interface TargetInfo {
    description?: string;
    model?: string;
    provider?: string;
    /** Version of the prompt or instructions, for example a Git revision or a file hash. */
    promptVersion?: string;
    /** Version of the application under test. */
    appVersion?: string;
    /** Inference settings worth recording: temperature, max tokens, tools enabled. No secrets. */
    config?: Record<string, unknown>;
}
export interface TargetContext {
    caseId: string;
    sources: SourceDocument[];
    /** Aborted on timeout. Pass it to your HTTP client or SDK. */
    signal: AbortSignal;
    /** 1 for the first attempt, 2 for the first retry, and so on. */
    attempt: number;
    /** The run's `maxOutputTokensPerRequest`. Pass it to the provider, or the cost reservation is meaningless. */
    maxOutputTokens?: number;
}
/**
 * The system under test, called once per case in live runs. It receives the case input and its
 * sources, never the expected outcome. Report usage when the provider returns it.
 */
export type LiveTarget = (input: unknown, ctx: TargetContext) => Promise<TargetResponse>;
export interface Threshold {
    /** A metric name from the report, for example `cases.pass_rate`, `label.accuracy` or `fields.accuracy`. */
    metric: string;
    min?: number;
    max?: number;
    /** Fail the threshold when the metric's denominator is smaller than this. */
    minSamples?: number;
    description?: string;
}
export interface Suite {
    id: string;
    /** Bump when the suite's configuration changes (parser, evaluators, thresholds). */
    version: string;
    description?: string;
    /** Dataset file (a path relative to the working directory, or a file URL) or the dataset itself. */
    dataset: string | URL | Dataset;
    /** Turns the raw output into a value for the evaluators. Default: the raw output as is (empty output fails). */
    parse?: (raw: unknown) => ParseResult;
    evaluators: Evaluator[];
    /** Set before running. With none, every selected case must pass. */
    thresholds?: Threshold[];
    target?: TargetInfo;
    /** Default responses for offline runs, as a file or inline: mock (hand-written) or recorded (captured live). */
    responses?: string | URL | ResponsesFile;
    /** Factory for the live target. Called only in live mode, after every guard has passed. */
    live?: () => LiveTarget | Promise<LiveTarget>;
    /** Limits for live runs. A live run without `maxRequests` is refused. */
    limits?: LiveLimits;
    /** Which outputs the report keeps (truncated). Default `failed`. Outputs may be sensitive. */
    outputs?: 'none' | 'failed' | 'all';
}
export declare function defineSuite(suite: Suite): Suite;
export declare function parseAsIs(raw: unknown): ParseResult;
