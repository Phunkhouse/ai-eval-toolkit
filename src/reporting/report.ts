import { count, formatRatio, percentile, ratio, round } from '../metrics/stats.ts';
import type { CaseResult, EvidenceKind, Metric, Origin, Split, Table } from '../types.ts';
import type { BudgetSnapshot, LiveLimits } from '../runner/budget.ts';
import type { TargetInfo, Threshold } from '../runner/suite.ts';
import type { Comparison } from './compare.ts';

export const REPORT_FORMAT = 'ai-eval-report/1';

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
    filters: { caseIds?: string[]; tags?: string[] };
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
    evaluators: Array<{ id: string; version: string; kind: string; description?: string; config?: unknown }>;
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
  target: TargetInfo & { modelsObserved: string[]; recordedAt?: string; responsesDescription?: string };
  verdict: 'pass' | 'fail' | 'incomplete';
  summary: {
    selected: number;
    passed: number;
    failed: number;
    errored: number;
    skipped: number;
    checks: Record<'pass' | 'fail' | 'error' | 'skipped', number>;
    byTag: Record<string, { total: number; passed: number; failed: number; errored: number; skipped: number }>;
    byRisk: Record<string, { total: number; passed: number; failed: number; errored: number; skipped: number }>;
  };
  criticalFailures: CriticalFailure[];
  thresholds: ThresholdResult[];
  metrics: Metric[];
  tables: Array<Table & { evaluator?: string }>;
  notes: string[];
  usage?: {
    limits: Omit<LiveLimits, 'estimateInputTokens'> & { estimateInputTokens?: string };
    budget: BudgetSnapshot;
    attempts: number;
    retries: number;
    timeouts: number;
    errors: number;
    latencyMs: { n: number; p50?: number; p95?: number; max?: number };
  };
  recordedUsage?: { latencyMs: { n: number; p50?: number; p95?: number; max?: number }; costUsd: number | null; costSources: Record<string, number>; inputTokens: number; outputTokens: number };
  cases: CaseResult[];
  limitations: string[];
  nextActions: string[];
  comparison?: Comparison;
}

type Counts = { total: number; passed: number; failed: number; errored: number; skipped: number };

export function tally(cases: CaseResult[], keyOf: (c: CaseResult) => string[]): Record<string, Counts> {
  const out: Record<string, Counts> = {};
  for (const c of cases) {
    for (const key of keyOf(c)) {
      const t = (out[key] ??= { total: 0, passed: 0, failed: 0, errored: 0, skipped: 0 });
      t.total++;
      t[c.status]++;
    }
  }
  return out;
}

export function evaluateThresholds(thresholds: Threshold[] | undefined, metrics: Metric[]): ThresholdResult[] {
  const list: Array<Threshold & { implicit?: boolean }> =
    thresholds && thresholds.length > 0 ? thresholds : [{ metric: 'cases.pass_rate', min: 1, description: 'No thresholds were defined, so every selected case must pass.', implicit: true }];
  return list.map((t) => {
    const m = metrics.find((x) => x.name === t.metric);
    const base: ThresholdResult = { ...t, status: 'not-evaluable', value: m?.value ?? null, message: '' };
    if (m?.denominator !== undefined) base.denominator = m.denominator;
    const bound = [t.min !== undefined ? `≥ ${t.min}` : '', t.max !== undefined ? `≤ ${t.max}` : ''].filter(Boolean).join(' and ');
    if (!m) return { ...base, message: `metric ${t.metric} was not produced by this run; a threshold that cannot be checked is not met` };
    if (m.value === null) return { ...base, message: `${t.metric} is undefined (${m.numerator ?? 0}/${m.denominator ?? 0}); not met` };
    if (t.minSamples !== undefined && (m.denominator ?? 0) < t.minSamples) return { ...base, status: 'not-met', message: `only ${m.denominator ?? 0} sample(s); at least ${t.minSamples} required` };
    const ok = (t.min === undefined || m.value >= t.min - 1e-12) && (t.max === undefined || m.value <= t.max + 1e-12);
    const shown = m.unit === 'ratio' ? formatRatio(m) : String(m.value);
    return { ...base, status: ok ? 'met' : 'not-met', message: `${shown}, required ${bound}` };
  });
}

export function findCriticalFailures(cases: CaseResult[]): CriticalFailure[] {
  const out: CriticalFailure[] = [];
  for (const c of cases) {
    const failed = c.checks.filter((k) => k.status === 'fail');
    for (const k of failed) {
      if (k.severity === 'critical') out.push({ caseId: c.id, reason: 'critical-check', evaluator: k.evaluator, criterion: k.criterion, message: k.message });
      else if (c.risk === 'critical') out.push({ caseId: c.id, reason: 'critical-risk-case', evaluator: k.evaluator, criterion: k.criterion, message: k.message });
    }
    if (c.risk === 'critical' && c.status === 'errored') out.push({ caseId: c.id, reason: 'critical-risk-case', message: `errored: ${c.error ?? 'unknown error'}` });
    if (c.risk === 'critical' && c.status === 'skipped' && c.skipReason !== 'no applicable checks') out.push({ caseId: c.id, reason: 'critical-risk-case', message: `not evaluated: ${c.skipReason ?? 'skipped'}` });
  }
  return out;
}

export function latencyStats(values: number[]): { n: number; p50?: number; p95?: number; max?: number } {
  if (values.length === 0) return { n: 0 };
  const p50 = percentile(values, 50);
  const p95 = percentile(values, 95);
  return { n: values.length, p50: p50 === undefined ? undefined : round(p50, 1), p95: p95 === undefined ? undefined : round(p95, 1), max: round(Math.max(...values), 1) } as { n: number; p50?: number; p95?: number; max?: number };
}

/** Run-level metrics every report has, before evaluator metrics. */
export function caseMetrics(cases: CaseResult[], criticalFailures: number): Metric[] {
  const n = cases.length;
  const by = (s: CaseResult['status']) => cases.filter((c) => c.status === s).length;
  return [
    ratio('cases.pass_rate', by('passed'), n, 'denominator includes failed, errored and skipped cases'),
    count('cases.failed', by('failed')),
    count('cases.errored', by('errored')),
    count('cases.skipped', by('skipped')),
    count('critical_failures', criticalFailures),
  ];
}

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

export function limitationsFor(i: LimitationInput): string[] {
  const out: string[] = [];
  if (i.evidence === 'mock') out.push('MOCK RESPONSES: this run exercised the dataset, evaluators and report against hand-written outputs. It says nothing about how any model behaves.');
  if (i.evidence === 'recorded') out.push(`Recorded responses${i.recordedAt ? ` from ${i.recordedAt}` : ''}: this replays past model behavior. The model, provider or prompt may have changed since.`);
  if (i.live) out.push('One live run: model output is nondeterministic and this run does not measure run-to-run variance. Repeat the run before trusting small differences.');
  if (i.selected < 30) out.push(`Small sample (${i.selected} cases): rates have wide uncertainty; see the 95% intervals. Treat this as a smoke check, not a quality estimate.`);
  out.push(...i.evaluatorLimitations);
  if (i.judgeEvaluators.length) out.push(`Results from model-based evaluators (${i.judgeEvaluators.join(', ')}) are model opinions, not ground truth.`);
  if (i.unreviewedSynthetic) out.push(`${i.unreviewedSynthetic} case(s) have synthetic expectations no human approved; results on them measure agreement with an unreviewed draft.`);
  if (i.disputed) out.push(`${i.disputed} case(s) have disputed expectations.`);
  if (i.holdoutSelected > 0) out.push(`This run included ${i.holdoutSelected} holdout case(s). Holdout results stay independent only if no prompt or configuration was tuned on them.`);
  if (i.budgetStop) out.push(`The run stopped early: ${i.budgetStop}. Results cover only the cases that ran.`);
  out.push('A passing suite is evidence about these cases only, not proof of general reliability or safety.');
  return out;
}

export function nextActionsFor(r: Pick<Report, 'criticalFailures' | 'thresholds' | 'summary' | 'run' | 'comparison' | 'metrics' | 'cases'>, unreviewedSynthetic: number): string[] {
  const out: string[] = [];
  if (r.criticalFailures.length) out.push(`Investigate the ${r.criticalFailures.length} critical failure(s) first; aggregates do not offset them.`);
  if (r.summary.errored) out.push(`Fix the ${r.summary.errored} errored case(s) (target or evaluator errors) before reading metrics; errored cases are excluded from evaluator metrics.`);
  const noResponse = r.cases.filter((c) => c.skipReason === 'no response recorded for this case').length;
  if (noResponse) out.push(`Add responses for the ${noResponse} case(s) that have none, or record them with a bounded live run.`);
  const noChecks = r.cases.filter((c) => c.skipReason === 'no applicable checks').length;
  if (noChecks) out.push(`${noChecks} case(s) had no applicable checks: give them an expected outcome or criteria.`);
  const regressed = r.comparison?.cases.regressed.length ?? 0;
  if (regressed) out.push(`Review the ${regressed} regressed case(s) against the baseline before accepting the change.`);
  const unmet = r.thresholds.filter((t) => t.status !== 'met');
  if (unmet.length) out.push(`${unmet.length} threshold(s) not met. Fix the system, not the threshold; change a threshold only with the owner's explicit approval and a recorded reason.`);
  if (unreviewedSynthetic) out.push(`Have a person review the ${unreviewedSynthetic} synthetic expectation(s) and mark them approved, corrected or disputed.`);
  if (r.run.evidence === 'mock') out.push('This is a mock run. To learn how the model behaves, run live with limits (`--live --dry-run` first), or replay recorded responses.');
  if (r.summary.selected < 30) out.push('Grow the dataset toward the failure modes that matter before relying on rates.');
  return out;
}
