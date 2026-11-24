import { count, formatRatio, percentile, ratio, round } from '../metrics/stats.js';
export const REPORT_FORMAT = 'ai-eval-report/1';
export function tally(cases, keyOf) {
    const out = {};
    for (const c of cases) {
        for (const key of keyOf(c)) {
            const t = (out[key] ??= { total: 0, passed: 0, failed: 0, errored: 0, skipped: 0 });
            t.total++;
            t[c.status]++;
        }
    }
    return out;
}
export function evaluateThresholds(thresholds, metrics) {
    const list = thresholds && thresholds.length > 0 ? thresholds : [{ metric: 'cases.pass_rate', min: 1, description: 'No thresholds were defined, so every selected case must pass.', implicit: true }];
    return list.map((t) => {
        const m = metrics.find((x) => x.name === t.metric);
        const base = { ...t, status: 'not-evaluable', value: m?.value ?? null, message: '' };
        if (m?.denominator !== undefined)
            base.denominator = m.denominator;
        const bound = [t.min !== undefined ? `≥ ${t.min}` : '', t.max !== undefined ? `≤ ${t.max}` : ''].filter(Boolean).join(' and ');
        if (!m)
            return { ...base, message: `metric ${t.metric} was not produced by this run; a threshold that cannot be checked is not met` };
        if (m.value === null)
            return { ...base, message: `${t.metric} is undefined (${m.numerator ?? 0}/${m.denominator ?? 0}); not met` };
        if (t.minSamples !== undefined && (m.denominator ?? 0) < t.minSamples)
            return { ...base, status: 'not-met', message: `only ${m.denominator ?? 0} sample(s); at least ${t.minSamples} required` };
        const ok = (t.min === undefined || m.value >= t.min - 1e-12) && (t.max === undefined || m.value <= t.max + 1e-12);
        const shown = m.unit === 'ratio' ? formatRatio(m) : String(m.value);
        return { ...base, status: ok ? 'met' : 'not-met', message: `${shown}, required ${bound}` };
    });
}
export function findCriticalFailures(cases) {
    const out = [];
    for (const c of cases) {
        const failed = c.checks.filter((k) => k.status === 'fail');
        for (const k of failed) {
            if (k.severity === 'critical')
                out.push({ caseId: c.id, reason: 'critical-check', evaluator: k.evaluator, criterion: k.criterion, message: k.message });
            else if (c.risk === 'critical')
                out.push({ caseId: c.id, reason: 'critical-risk-case', evaluator: k.evaluator, criterion: k.criterion, message: k.message });
        }
        if (c.risk === 'critical' && c.status === 'errored')
            out.push({ caseId: c.id, reason: 'critical-risk-case', message: `errored: ${c.error ?? 'unknown error'}` });
        if (c.risk === 'critical' && c.status === 'skipped' && c.skipReason !== 'no applicable checks')
            out.push({ caseId: c.id, reason: 'critical-risk-case', message: `not evaluated: ${c.skipReason ?? 'skipped'}` });
    }
    return out;
}
export function latencyStats(values) {
    if (values.length === 0)
        return { n: 0 };
    const p50 = percentile(values, 50);
    const p95 = percentile(values, 95);
    return { n: values.length, p50: p50 === undefined ? undefined : round(p50, 1), p95: p95 === undefined ? undefined : round(p95, 1), max: round(Math.max(...values), 1) };
}
/** Run-level metrics every report has, before evaluator metrics. */
export function caseMetrics(cases, criticalFailures) {
    const n = cases.length;
    const by = (s) => cases.filter((c) => c.status === s).length;
    return [
        ratio('cases.pass_rate', by('passed'), n, 'denominator includes failed, errored and skipped cases'),
        count('cases.failed', by('failed')),
        count('cases.errored', by('errored')),
        count('cases.skipped', by('skipped')),
        count('critical_failures', criticalFailures),
    ];
}
export function limitationsFor(i) {
    const out = [];
    if (i.evidence === 'mock')
        out.push('MOCK RESPONSES: this run exercised the dataset, evaluators and report against hand-written outputs. It says nothing about how any model behaves.');
    if (i.evidence === 'recorded')
        out.push(`Recorded responses${i.recordedAt ? ` from ${i.recordedAt}` : ''}: this replays past model behavior. The model, provider or prompt may have changed since.`);
    if (i.live)
        out.push('One live run: model output is nondeterministic and this run does not measure run-to-run variance. Repeat the run before trusting small differences.');
    if (i.selected < 30)
        out.push(`Small sample (${i.selected} cases): rates have wide uncertainty; see the 95% intervals. Treat this as a smoke check, not a quality estimate.`);
    out.push(...i.evaluatorLimitations);
    if (i.judgeEvaluators.length)
        out.push(`Results from model-based evaluators (${i.judgeEvaluators.join(', ')}) are model opinions, not ground truth.`);
    if (i.unreviewedSynthetic)
        out.push(`${i.unreviewedSynthetic} case(s) have synthetic expectations no human approved; results on them measure agreement with an unreviewed draft.`);
    if (i.disputed)
        out.push(`${i.disputed} case(s) have disputed expectations.`);
    if (i.holdoutSelected > 0)
        out.push(`This run included ${i.holdoutSelected} holdout case(s). Holdout results stay independent only if no prompt or configuration was tuned on them.`);
    if (i.budgetStop)
        out.push(`The run stopped early: ${i.budgetStop}. Results cover only the cases that ran.`);
    out.push('A passing suite is evidence about these cases only, not proof of general reliability or safety.');
    return out;
}
export function nextActionsFor(r, unreviewedSynthetic) {
    const out = [];
    const nothingEvaluated = r.summary.errored > 0 && r.summary.passed + r.summary.failed === 0;
    // When nothing produced output, the configuration problem comes before any per-case finding.
    if (nothingEvaluated)
        out.push('No case produced an output that could be evaluated. The errors point to the target or its configuration (credentials, endpoint, adapter), not to model behavior; fix that before reading anything into this run.');
    if (r.criticalFailures.length)
        out.push(`Investigate the ${r.criticalFailures.length} critical failure(s)${nothingEvaluated ? ' once outputs exist' : ' first'}; aggregates do not offset them.`);
    if (r.summary.errored && !nothingEvaluated)
        out.push(`Fix the ${r.summary.errored} errored case(s) (target or evaluator errors) before reading metrics; errored cases are excluded from evaluator metrics.`);
    const noResponse = r.cases.filter((c) => c.skipReason === 'no response recorded for this case').length;
    if (noResponse)
        out.push(`Add responses for the ${noResponse} case(s) that have none, or record them with a bounded live run.`);
    const noChecks = r.cases.filter((c) => c.skipReason === 'no applicable checks').length;
    if (noChecks)
        out.push(`${noChecks} case(s) had no applicable checks: give them an expected outcome or criteria.`);
    const regressed = r.comparison?.cases.regressed.length ?? 0;
    if (regressed)
        out.push(`Review the ${regressed} regressed case(s) against the baseline before accepting the change.`);
    const unmet = r.thresholds.filter((t) => t.status !== 'met');
    if (unmet.length)
        out.push(`${unmet.length} threshold(s) not met. Fix the system, not the threshold; change a threshold only with the owner's explicit approval and a recorded reason.`);
    if (unreviewedSynthetic)
        out.push(`Have a person review the ${unreviewedSynthetic} synthetic expectation(s) and mark them approved, corrected or disputed.`);
    if (r.run.evidence === 'mock')
        out.push('This is a mock run. To learn how the model behaves, run live with limits (`--live --dry-run` first), or replay recorded responses.');
    if (r.summary.selected < 30)
        out.push('Grow the dataset toward the failure modes that matter before relying on rates.');
    return out;
}
