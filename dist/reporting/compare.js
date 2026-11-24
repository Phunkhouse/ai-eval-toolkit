import { round } from '../metrics/stats.js';
import { REPORT_FORMAT } from './report.js';
const failing = (s) => s === 'failed' || s === 'errored';
/**
 * Compares a run with a baseline run. Case-level changes are reported only for cases whose content
 * is unchanged, and aggregate deltas only when the runs are fully comparable. Runs with different
 * criteria, or mock evidence on one side and model evidence on the other, are not comparable.
 */
export function compareReports(baseline, current) {
    for (const [label, r] of [['baseline', baseline], ['current', current]]) {
        if (r?.format !== REPORT_FORMAT)
            throw new Error(`The ${label} is not an ${REPORT_FORMAT} report`);
    }
    const reasons = [];
    let compatibility = 'comparable';
    const downgrade = (to, reason) => {
        reasons.push(reason);
        if (to === 'not-comparable' || compatibility === 'comparable')
            compatibility = to;
    };
    if (baseline.dataset.id !== current.dataset.id)
        downgrade('not-comparable', `different datasets: "${baseline.dataset.id}" and "${current.dataset.id}"`);
    if (baseline.suite.criteriaHash !== current.suite.criteriaHash) {
        const b = new Map(baseline.suite.evaluators.map((e) => [e.id, e]));
        const c = new Map(current.suite.evaluators.map((e) => [e.id, e]));
        const diffs = [...new Set([...b.keys(), ...c.keys()])]
            .filter((id) => JSON.stringify(b.get(id)) !== JSON.stringify(c.get(id)))
            .map((id) => (!b.has(id) ? `${id} added` : !c.has(id) ? `${id} removed` : `${id} changed (version ${b.get(id).version} → ${c.get(id).version} or configuration)`));
        downgrade('not-comparable', `evaluation criteria differ: ${diffs.join('; ') || 'criteria hash differs'}`);
    }
    const mockB = baseline.run.evidence === 'mock';
    const mockC = current.run.evidence === 'mock';
    if (mockB !== mockC)
        downgrade('not-comparable', `evidence differs (${baseline.run.evidence} vs ${current.run.evidence}): differences would reflect fixtures, not the model`);
    else if (baseline.run.evidence !== current.run.evidence)
        reasons.push(`evidence differs (${baseline.run.evidence} vs ${current.run.evidence}); both come from a model`);
    if (baseline.dataset.fingerprint !== current.dataset.fingerprint)
        downgrade('partially-comparable', `dataset content differs (version ${baseline.dataset.version} → ${current.dataset.version}); only unchanged cases are compared`);
    if (baseline.run.split !== current.run.split || JSON.stringify(baseline.run.filters) !== JSON.stringify(current.run.filters))
        downgrade('partially-comparable', 'the runs selected cases differently (split or filters); aggregates are not compared');
    if (!baseline.run.complete || !current.run.complete)
        downgrade('partially-comparable', 'at least one run is incomplete; aggregates are not compared');
    if (baseline.suite.version !== current.suite.version)
        reasons.push(`suite version changed (${baseline.suite.version} → ${current.suite.version}); check the parser and thresholds did not change what is measured`);
    if (JSON.stringify(baseline.thresholds.map(stripResult)) !== JSON.stringify(current.thresholds.map(stripResult)))
        reasons.push('thresholds differ between the runs; verdicts are not directly comparable');
    const cases = { improved: [], regressed: [], stillFailing: [], added: [], removed: [], changed: [], statusChanges: [] };
    if (compatibility !== 'not-comparable') {
        const before = new Map(baseline.cases.map((c) => [c.id, c]));
        const nowIds = new Set(current.cases.map((c) => c.id));
        for (const c of current.cases) {
            const b = before.get(c.id);
            if (!b) {
                cases.added.push({ id: c.id, status: c.status });
                continue;
            }
            if (b.hash !== c.hash) {
                cases.changed.push(c.id);
                continue;
            }
            if (b.status !== c.status)
                cases.statusChanges.push({ id: c.id, from: b.status, to: c.status });
            if (b.status === 'passed' && failing(c.status))
                cases.regressed.push(c.id);
            else if (failing(b.status) && c.status === 'passed')
                cases.improved.push(c.id);
            else if (failing(b.status) && failing(c.status))
                cases.stillFailing.push(c.id);
        }
        for (const b of baseline.cases)
            if (!nowIds.has(b.id))
                cases.removed.push(b.id);
    }
    const delta = (a, b) => (a == null || b == null ? null : round(b - a));
    const metrics = [];
    if (compatibility === 'comparable') {
        const before = new Map(baseline.metrics.map((m) => [m.name, m.value]));
        for (const m of current.metrics) {
            if (!before.has(m.name) || m.name.startsWith('latency.') || m.name.startsWith('usage.'))
                continue;
            metrics.push({ name: m.name, baseline: before.get(m.name) ?? null, current: m.value, delta: delta(before.get(m.name), m.value) });
        }
    }
    const usageOf = (r) => {
        const lat = r.usage?.latencyMs ?? r.recordedUsage?.latencyMs;
        const cost = r.usage ? r.usage.budget.committed.costUsd : (r.recordedUsage?.costUsd ?? null);
        return { 'latency.p50_ms': lat?.p50 ?? null, 'latency.p95_ms': lat?.p95 ?? null, cost_usd: cost, input_tokens: r.usage?.budget.committed.inputTokens ?? r.recordedUsage?.inputTokens ?? null, output_tokens: r.usage?.budget.committed.outputTokens ?? r.recordedUsage?.outputTokens ?? null };
    };
    const ub = usageOf(baseline);
    const uc = usageOf(current);
    const usage = Object.keys(uc).map((k) => ({ name: k, baseline: ub[k], current: uc[k], delta: delta(ub[k], uc[k]) }));
    if (compatibility !== 'comparable')
        reasons.push('cost and latency are shown for information; the runs covered different cases or criteria');
    const baselineInfo = {
        runId: baseline.run.id,
        startedAt: baseline.run.startedAt,
        evidence: baseline.run.evidence,
        datasetVersion: baseline.dataset.version,
        suiteVersion: baseline.suite.version,
    };
    if (baseline.target.model)
        baselineInfo.model = baseline.target.model;
    if (baseline.target.promptVersion)
        baselineInfo.promptVersion = baseline.target.promptVersion;
    return { baseline: baselineInfo, compatibility, reasons, cases, metrics, usage };
}
function stripResult(t) {
    return { metric: t.metric, min: t.min, max: t.max, minSamples: t.minSamples };
}
