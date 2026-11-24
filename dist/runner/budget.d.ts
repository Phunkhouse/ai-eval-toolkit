import type { CostSource, Usage } from '../types.ts';
export interface Pricing {
    inputPerMillionTokensUsd: number;
    outputPerMillionTokensUsd: number;
    /** Where the prices came from and when they were checked. Prices change; the report repeats this. */
    source: string;
    checkedOn: string;
}
/** Limits for a live run. `maxRequests` is required; every other limit is optional. */
export interface LiveLimits {
    /** Target invocations, retries included. The run stops scheduling when the next one would exceed it. */
    maxRequests: number;
    /** Retries per case after a thrown error or timeout. Invalid output is never retried. Default 0. */
    maxRetriesPerCase?: number;
    /** Parallel requests. Default 1. */
    concurrency?: number;
    /** Per-request timeout; the target receives an AbortSignal. Default 60000. */
    timeoutMs?: number;
    /** Pause before a retry, in milliseconds. Default 1000. */
    retryDelayMs?: number;
    /**
     * Stop the run after this many errors or timeouts in a row with no successful response in
     * between, retries included. Default 3. Catches configuration problems (missing credentials,
     * a wrong endpoint) before they use up the request and cost limits.
     */
    maxConsecutiveErrors?: number;
    /** Total spend limit in USD. Requires `pricing` and `maxOutputTokensPerRequest`. */
    maxCostUsd?: number;
    /** Total input and output token limits across the run. */
    maxInputTokens?: number;
    maxOutputTokens?: number;
    /** The output cap your adapter passes to the provider (it receives it as `ctx.maxOutputTokens`). Used for worst-case reservations. */
    maxOutputTokensPerRequest?: number;
    pricing?: Pricing;
    /**
     * Estimate of input tokens for a case, before sending it. Default: characters / 3 over the input
     * and sources, rounded up, which over-estimates for most English text. Include your system prompt.
     */
    estimateInputTokens?: (input: unknown, sourcesText: string) => number;
}
export interface Amounts {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
}
export interface Reservation extends Amounts {
    readonly id: number;
}
export interface BudgetSnapshot {
    committed: Amounts;
    inFlight: Amounts;
    /** Cost by where it came from. `reservedUnknown` is worst-case cost counted for requests whose usage is unknown. */
    cost: {
        providerReportedUsd: number;
        estimatedUsd: number;
        reservedUnknownUsd: number;
    };
    /** Requests whose usage is unknown (errors, timeouts, targets that report nothing); their worst case is counted. */
    unknownUsageRequests: number;
    overruns: string[];
    stopReason?: string;
}
export declare function validateLimits(limits: LiveLimits): string[];
export declare function costOf(pricing: Pricing | undefined, inputTokens: number, outputTokens: number): number;
/**
 * Enforces live-run limits, counting requests in flight at their worst case.
 *
 * Before each request (and each retry) the runner reserves its worst case: one request, the
 * estimated input tokens, `maxOutputTokensPerRequest` output tokens and their cost. A reservation is
 * refused if committed + in-flight + the new reservation would exceed any limit, and the guard then
 * stops: no further requests start. When a request finishes, its reservation is replaced by the
 * reported usage. When usage is unknown (an error, a timeout, a target that reports nothing), the
 * worst case stays committed, because the provider may still bill for it.
 *
 * Limitations: input tokens are estimated before sending; the provider may bill differently from
 * the prices given; a target that makes several provider calls must report their total usage; and a
 * response that exceeds its reservation is recorded as an overrun and stops the run, but the money
 * is already spent. The guard bounds spend under these assumptions; it is not a billing guarantee.
 */
export declare class BudgetGuard {
    readonly limits: LiveLimits;
    private committed;
    private inFlight;
    private nextId;
    private cost;
    private overruns;
    private stop;
    private unknownUsage;
    private consecutiveErrors;
    constructor(limits: LiveLimits);
    get stopReason(): string | undefined;
    /** A request returned a response: the error streak ends. */
    recordSuccess(): void;
    /** A request threw or timed out. Stops the run when errors keep coming with no success between them. */
    recordError(message: string): void;
    /** Worst-case amounts for one request with this many estimated input tokens. */
    worstCase(estimatedInputTokens: number): Amounts;
    /** Reserve a request's worst case, or stop the run and return the reason. */
    reserve(estimatedInputTokens: number): Reservation | {
        denied: string;
    };
    /** Replace a reservation with what the request actually used. Returns the cost and where it came from. */
    settle(r: Reservation, usage: Usage | undefined): {
        costUsd: number;
        costSource: CostSource;
    };
    snapshot(): BudgetSnapshot;
    private add;
    private sumInFlight;
    private totalWithInFlight;
}
/** Default input estimate: characters / 3, rounded up. Deliberately pessimistic for English text. */
export declare function defaultInputEstimate(input: unknown, sourcesText: string): number;
