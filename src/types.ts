// Core types shared by datasets, evaluators, the runner and reports.

/** How much a failed check matters. A failed `critical` check is listed above every aggregate. */
export type Severity = 'critical' | 'major' | 'minor';

/** Risk of a case. A failure on a `critical` case is a critical failure whatever the check's severity. */
export type Risk = 'critical' | 'high' | 'normal' | 'low';

export type Split = 'dev' | 'holdout';

/** Who produced the case and its expectation. Synthetic expectations are not ground truth until reviewed. */
export type Origin = 'human' | 'synthetic' | 'production-sample' | 'adapted';

/** Review state of a case's expected outcome. Only `approved` counts as a human-approved reference. */
export type AnnotationStatus = 'draft' | 'reviewed' | 'approved' | 'disputed';

/** What the system should do with the input. */
export type Behavior = 'answer' | 'abstain' | 'refuse';

export interface SourceDocument {
  id: string;
  text: string;
  title?: string;
  /** Untrusted sources may contain instructions; evaluators and Skills treat them as data. */
  trusted?: boolean;
}

export interface Provenance {
  origin: Origin;
  /** A role, not a person's name, in shared repositories. */
  author?: string;
  created?: string;
  /** Free-text notes, for example where an adapted production sample came from and how it was redacted. */
  notes?: string;
  /** For synthetic cases: what produced them (a model, a script, a person). */
  generator?: string;
}

export interface Annotation {
  status: AnnotationStatus;
  /** Who reviewed the expectation, as a role. A model is never an approver. */
  reviewer?: string;
  date?: string;
  notes?: string;
}

export interface ExpectedOutcome {
  behavior?: Behavior;
  label?: string;
  fields?: Record<string, unknown>;
  /** Evidence a correct answer must cite: exact quotations from named sources. */
  evidence?: Array<{ sourceId: string; quote: string }>;
  /** Strings that must not appear in the output, such as an injected instruction's payload or a canary. */
  forbidden?: string[];
  toolCalls?: { required?: string[]; forbidden?: string[] };
  /** Anything else a custom evaluator reads. */
  [key: string]: unknown;
}

export interface EvalCase {
  id: string;
  input: unknown;
  sources?: SourceDocument[];
  /** References to dataset-level sources, by id. */
  sourceRefs?: string[];
  expected?: ExpectedOutcome;
  /** Evaluator ids that apply. Omitted: every evaluator applies. */
  criteria?: string[];
  tags?: string[];
  risk?: Risk;
  difficulty?: 'easy' | 'medium' | 'hard';
  split?: Split;
  provenance?: Provenance;
  annotation?: Annotation;
  notes?: string;
}

export interface Dataset {
  format: 'ai-eval-dataset/1';
  id: string;
  version: string;
  description?: string;
  /** Default split for cases without one. Default: dev. */
  split?: Split;
  sources?: SourceDocument[];
  cases: EvalCase[];
}

// ---------- Target responses ----------

export type CostSource = 'provider-reported' | 'estimated' | 'unknown';

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  /** Cost in USD for this response. Say where it came from with costSource. */
  costUsd?: number;
  costSource?: CostSource;
  /** Underlying provider requests made to produce this response, if the target makes several. */
  providerRequests?: number;
}

export interface TargetResponse {
  /** The raw output: usually text, or an already-parsed object. */
  output: unknown;
  usage?: Usage;
  /** Tool calls the system made, by name, for tool-calling evaluators. */
  toolCalls?: Array<{ name: string; arguments?: unknown }>;
  model?: string;
  provider?: string;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}

/** Where the evidence came from. Only `live` is fresh evidence of real model behavior. */
export type EvidenceKind = 'mock' | 'recorded' | 'live';

// ---------- Evaluation ----------

export type CheckStatus = 'pass' | 'fail' | 'error' | 'skipped';

export interface CheckResult {
  evaluator: string;
  /** A short machine-readable name for what was checked, for example `schema` or `quote-exists`. */
  criterion: string;
  status: CheckStatus;
  severity: Severity;
  message: string;
  details?: unknown;
}

export type ParseResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: 'empty' | 'malformed' | 'not-text'; message: string };

export interface EvaluationContext {
  case: EvalCase;
  /** Sources for this case: its own plus resolved dataset-level references. */
  sources: SourceDocument[];
  response: TargetResponse;
  raw: unknown;
  parsed: ParseResult;
}

export interface Evaluator {
  id: string;
  /** Bump when the evaluator's behavior changes; baselines refuse to compare across versions. */
  version: string;
  kind: 'deterministic' | 'judge' | 'human';
  description?: string;
  /** Serializable description of the evaluator's options; part of the criteria hash used by comparisons. */
  config?: unknown;
  /** What this evaluator cannot establish. Every report that uses it lists these. */
  limitations?: string[];
  /** Checks for one case. Return an empty array when nothing applies to the case. */
  evaluate(ctx: EvaluationContext): CheckResult[] | Promise<CheckResult[]>;
  /**
   * Dataset-level metrics from the cases this evaluator checked. Cases whose target errored or that
   * were skipped are not passed in; output that failed to parse is.
   */
  summarize?(cases: EvaluatedCase[]): EvaluatorSummary;
}

export type CaseStatus = 'passed' | 'failed' | 'errored' | 'skipped';

export interface CaseResult {
  id: string;
  status: CaseStatus;
  /** Content hash of the case, so comparisons notice edited cases. */
  hash: string;
  split: Split;
  tags: string[];
  risk: Risk;
  annotation: AnnotationStatus | 'none';
  origin: Origin | 'unknown';
  checks: CheckResult[];
  error?: string;
  skipReason?: string;
  attempts?: number;
  latencyMs?: number;
  usage?: Usage;
  model?: string;
  provider?: string;
  /** Present only when the run keeps outputs (see `outputs`). Truncated. */
  output?: string;
}

// ---------- Metrics ----------

export interface Metric {
  /** Dotted name; evaluator metrics are prefixed with the evaluator id, for example `label.accuracy`. */
  name: string;
  /** `null` when undefined, for example a ratio whose denominator is zero. Never silently 0 or 1. */
  value: number | null;
  numerator?: number;
  denominator?: number;
  /** 95% Wilson score interval for ratios, to make small samples visible. */
  interval?: [number, number];
  unit?: 'ratio' | 'count' | 'usd' | 'ms' | 'tokens';
  note?: string;
}

export interface Table {
  title: string;
  columns: string[];
  rows: Array<Array<string | number | null>>;
  note?: string;
}

/** One evaluated case as an evaluator's summarize() sees it: only that evaluator's checks. */
export interface EvaluatedCase {
  case: EvalCase;
  sources: SourceDocument[];
  parsed: ParseResult;
  response: TargetResponse;
  checks: CheckResult[];
}

export interface EvaluatorSummary {
  metrics: Metric[];
  tables?: Table[];
  notes?: string[];
}
