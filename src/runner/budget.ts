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
  cost: { providerReportedUsd: number; estimatedUsd: number; reservedUnknownUsd: number };
  /** Requests whose usage is unknown (errors, timeouts, targets that report nothing); their worst case is counted. */
  unknownUsageRequests: number;
  overruns: string[];
  stopReason?: string;
}

const zero = (): Amounts => ({ requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });

export function validateLimits(limits: LiveLimits): string[] {
  const problems: string[] = [];
  const positiveInt = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v > 0;
  if (!positiveInt(limits.maxRequests)) problems.push('maxRequests must be a positive integer; live runs need a request limit');
  if (limits.maxRetriesPerCase !== undefined && !(Number.isInteger(limits.maxRetriesPerCase) && limits.maxRetriesPerCase >= 0)) problems.push('maxRetriesPerCase must be a non-negative integer');
  if (limits.concurrency !== undefined && !positiveInt(limits.concurrency)) problems.push('concurrency must be a positive integer');
  if (limits.timeoutMs !== undefined && !positiveInt(limits.timeoutMs)) problems.push('timeoutMs must be a positive integer');
  if (limits.maxConsecutiveErrors !== undefined && !positiveInt(limits.maxConsecutiveErrors)) problems.push('maxConsecutiveErrors must be a positive integer');
  if (limits.maxCostUsd !== undefined) {
    if (!(typeof limits.maxCostUsd === 'number' && limits.maxCostUsd > 0)) problems.push('maxCostUsd must be a positive number');
    if (!limits.pricing) problems.push('maxCostUsd needs pricing (input and output price per million tokens, with source and date)');
    if (!limits.maxOutputTokensPerRequest) problems.push('maxCostUsd needs maxOutputTokensPerRequest, so a request can be reserved at its worst case');
  }
  if (limits.maxOutputTokens !== undefined && !limits.maxOutputTokensPerRequest) problems.push('maxOutputTokens needs maxOutputTokensPerRequest for worst-case reservations');
  if (limits.pricing) {
    const p = limits.pricing;
    if (!(p.inputPerMillionTokensUsd >= 0 && p.outputPerMillionTokensUsd >= 0)) problems.push('pricing must have non-negative prices');
    if (!p.source || !p.checkedOn) problems.push('pricing needs a source and a checkedOn date');
  }
  return problems;
}

export function costOf(pricing: Pricing | undefined, inputTokens: number, outputTokens: number): number {
  if (!pricing) return 0;
  return (inputTokens * pricing.inputPerMillionTokensUsd + outputTokens * pricing.outputPerMillionTokensUsd) / 1_000_000;
}

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
export class BudgetGuard {
  readonly limits: LiveLimits;
  private committed = zero();
  private inFlight = new Map<number, Reservation>();
  private nextId = 1;
  private cost = { providerReportedUsd: 0, estimatedUsd: 0, reservedUnknownUsd: 0 };
  private overruns: string[] = [];
  private stop: string | undefined;
  private unknownUsage = 0;
  private consecutiveErrors = 0;

  constructor(limits: LiveLimits) {
    const problems = validateLimits(limits);
    if (problems.length) throw new Error(`Invalid live limits:\n  ${problems.join('\n  ')}`);
    this.limits = limits;
  }

  get stopReason(): string | undefined {
    return this.stop;
  }

  /** A request returned a response: the error streak ends. */
  recordSuccess(): void {
    this.consecutiveErrors = 0;
  }

  /** A request threw or timed out. Stops the run when errors keep coming with no success between them. */
  recordError(message: string): void {
    this.consecutiveErrors++;
    const max = this.limits.maxConsecutiveErrors ?? 3;
    if (this.consecutiveErrors >= max) this.stop ??= `${this.consecutiveErrors} consecutive errors with no successful response (last: ${message}); check the target's configuration before rerunning`;
  }

  /** Worst-case amounts for one request with this many estimated input tokens. */
  worstCase(estimatedInputTokens: number): Amounts {
    const out = this.limits.maxOutputTokensPerRequest ?? 0;
    return { requests: 1, inputTokens: estimatedInputTokens, outputTokens: out, costUsd: costOf(this.limits.pricing, estimatedInputTokens, out) };
  }

  /** Reserve a request's worst case, or stop the run and return the reason. */
  reserve(estimatedInputTokens: number): Reservation | { denied: string } {
    if (this.stop) return { denied: this.stop };
    const want = this.worstCase(estimatedInputTokens);
    const used = this.totalWithInFlight();
    const l = this.limits;
    let reason: string | undefined;
    if (used.requests + 1 > l.maxRequests) reason = `request limit reached (${l.maxRequests})`;
    else if (l.maxCostUsd !== undefined && used.costUsd + want.costUsd > l.maxCostUsd + 1e-12)
      reason = `cost limit: $${used.costUsd.toFixed(4)} committed or in flight + $${want.costUsd.toFixed(4)} worst case for the next request would exceed $${l.maxCostUsd}`;
    else if (l.maxInputTokens !== undefined && used.inputTokens + want.inputTokens > l.maxInputTokens) reason = `input token limit (${l.maxInputTokens}) would be exceeded`;
    else if (l.maxOutputTokens !== undefined && used.outputTokens + want.outputTokens > l.maxOutputTokens) reason = `output token limit (${l.maxOutputTokens}) would be exceeded`;
    if (reason) {
      this.stop = reason;
      return { denied: reason };
    }
    const r: Reservation = { id: this.nextId++, ...want };
    this.inFlight.set(r.id, r);
    return r;
  }

  /** Replace a reservation with what the request actually used. Returns the cost and where it came from. */
  settle(r: Reservation, usage: Usage | undefined): { costUsd: number; costSource: CostSource } {
    this.inFlight.delete(r.id);
    const known = usage && (usage.inputTokens !== undefined || usage.outputTokens !== undefined || usage.costUsd !== undefined);
    if (!known) {
      this.add(r);
      this.cost.reservedUnknownUsd += r.costUsd;
      this.unknownUsage++;
      return { costUsd: r.costUsd, costSource: 'unknown' };
    }
    const inputTokens = usage.inputTokens ?? r.inputTokens;
    const outputTokens = usage.outputTokens ?? r.outputTokens;
    let costUsd: number;
    let costSource: CostSource;
    if (usage.costUsd !== undefined && usage.costSource === 'provider-reported') {
      costUsd = usage.costUsd;
      costSource = 'provider-reported';
      this.cost.providerReportedUsd += costUsd;
    } else if (usage.costUsd !== undefined) {
      costUsd = usage.costUsd;
      costSource = 'estimated';
      this.cost.estimatedUsd += costUsd;
    } else if (this.limits.pricing) {
      costUsd = costOf(this.limits.pricing, inputTokens, outputTokens);
      costSource = 'estimated';
      this.cost.estimatedUsd += costUsd;
    } else {
      costUsd = 0;
      costSource = 'unknown';
    }
    const requests = Math.max(1, usage.providerRequests ?? 1);
    this.add({ requests, inputTokens, outputTokens, costUsd });
    const over: string[] = [];
    if (this.limits.maxOutputTokensPerRequest !== undefined && outputTokens > this.limits.maxOutputTokensPerRequest) over.push(`${outputTokens} output tokens > ${this.limits.maxOutputTokensPerRequest} per request`);
    if (this.limits.maxCostUsd !== undefined && costUsd > r.costUsd + 1e-9) over.push(`cost $${costUsd.toFixed(4)} > reserved $${r.costUsd.toFixed(4)}`);
    if (requests > 1) over.push(`${requests} provider requests reported for one target call`);
    if (over.length) {
      this.overruns.push(over.join('; '));
      this.stop ??= `a response exceeded its reservation (${over.join('; ')}); stopped to keep the remaining budget bounded`;
    }
    const total = this.committed;
    const l = this.limits;
    if (total.requests > l.maxRequests || (l.maxCostUsd !== undefined && total.costUsd > l.maxCostUsd) || (l.maxInputTokens !== undefined && total.inputTokens > l.maxInputTokens) || (l.maxOutputTokens !== undefined && total.outputTokens > l.maxOutputTokens)) {
      this.stop ??= 'a limit was exceeded after a response arrived';
    }
    return { costUsd, costSource };
  }

  snapshot(): BudgetSnapshot {
    const s: BudgetSnapshot = { committed: { ...this.committed }, inFlight: this.sumInFlight(), cost: { ...this.cost }, unknownUsageRequests: this.unknownUsage, overruns: [...this.overruns] };
    if (this.stop) s.stopReason = this.stop;
    return s;
  }

  private add(a: Amounts) {
    this.committed.requests += a.requests;
    this.committed.inputTokens += a.inputTokens;
    this.committed.outputTokens += a.outputTokens;
    this.committed.costUsd += a.costUsd;
  }

  private sumInFlight(): Amounts {
    const s = zero();
    for (const r of this.inFlight.values()) {
      s.requests += r.requests;
      s.inputTokens += r.inputTokens;
      s.outputTokens += r.outputTokens;
      s.costUsd += r.costUsd;
    }
    return s;
  }

  private totalWithInFlight(): Amounts {
    const f = this.sumInFlight();
    const c = this.committed;
    return { requests: c.requests + f.requests, inputTokens: c.inputTokens + f.inputTokens, outputTokens: c.outputTokens + f.outputTokens, costUsd: c.costUsd + f.costUsd };
  }
}

/** Default input estimate: characters / 3, rounded up. Deliberately pessimistic for English text. */
export function defaultInputEstimate(input: unknown, sourcesText: string): number {
  const text = (typeof input === 'string' ? input : JSON.stringify(input ?? '')) + sourcesText;
  return Math.ceil(text.length / 3);
}
