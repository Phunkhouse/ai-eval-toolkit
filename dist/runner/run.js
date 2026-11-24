import { fileURLToPath } from 'node:url';
import { caseHash, caseSplit, datasetFingerprint, loadDataset, parseDataset, resolveSources } from '../dataset.js';
import { outputText } from '../evaluators/util.js';
import { hashValue } from '../hash.js';
import { compareReports } from '../reporting/compare.js';
import { caseMetrics, evaluateThresholds, findCriticalFailures, tally, latencyStats, limitationsFor, nextActionsFor, REPORT_FORMAT, } from '../reporting/report.js';
import { TOOLKIT_VERSION } from '../version.js';
import { BudgetGuard, defaultInputEstimate } from './budget.js';
import { loadResponses, parseResponses, saveResponses } from './responses.js';
import { parseAsIs } from './suite.js';
export class LiveRunRefused extends Error {
    constructor(message) {
        super(message);
        this.name = 'LiveRunRefused';
    }
}
const toPath = (p) => (p instanceof URL ? fileURLToPath(p) : p);
function loadSuiteDataset(suite) {
    if (typeof suite.dataset === 'string' || suite.dataset instanceof URL) {
        const path = toPath(suite.dataset);
        const { dataset, warnings } = loadDataset(path);
        return { dataset, warnings: warnings.map((w) => `${w.path}: ${w.message}`), path };
    }
    const { dataset, warnings } = parseDataset(suite.dataset);
    return { dataset, warnings: warnings.map((w) => `${w.path}: ${w.message}`) };
}
function selectCases(dataset, split, caseIds, tags) {
    let cases = dataset.cases.filter((c) => split === 'all' || caseSplit(dataset, c) === split);
    if (caseIds?.length) {
        const unknown = caseIds.filter((id) => !dataset.cases.some((c) => c.id === id));
        if (unknown.length)
            throw new Error(`Unknown case id(s): ${unknown.join(', ')}`);
        cases = cases.filter((c) => caseIds.includes(c.id));
    }
    if (tags?.length)
        cases = cases.filter((c) => (c.tags ?? []).some((t) => tags.includes(t)));
    if (cases.length === 0)
        throw new Error(`No cases selected (split ${split}${caseIds?.length ? `, cases ${caseIds.join(',')}` : ''}${tags?.length ? `, tags ${tags.join(',')}` : ''})`);
    return cases;
}
function effectiveLimits(suite, overrides) {
    if (!suite.limits && !overrides?.maxRequests)
        return undefined;
    return { ...(suite.limits ?? {}), ...stripUndefined(overrides ?? {}) };
}
function stripUndefined(o) {
    return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}
/** Throws LiveRunRefused unless a live run is explicitly and safely configured. */
export function assertLiveAllowed(suite, limits, env) {
    if (env.VITEST)
        throw new LiveRunRefused('Live runs are refused inside Vitest: unit tests must stay offline.');
    if (env.CI && env.AI_EVAL_ALLOW_LIVE_IN_CI !== '1')
        throw new LiveRunRefused('Live runs are refused when CI is set. Set AI_EVAL_ALLOW_LIVE_IN_CI=1 in a deliberately configured CI job to allow them.');
    if (!suite.live)
        throw new LiveRunRefused(`Suite ${suite.id} has no live target.`);
    if (!limits || !limits.maxRequests)
        throw new LiveRunRefused('Live runs need limits with maxRequests (in the suite or with --max-requests).');
}
/** The worst case of a live run, without calling anything. */
export function planLiveRun(suite, options = {}) {
    const limits = effectiveLimits(suite, options.limits);
    if (!limits?.maxRequests)
        throw new LiveRunRefused('Live runs need limits with maxRequests (in the suite or with --max-requests).');
    const guard = new BudgetGuard(limits);
    const { dataset } = loadSuiteDataset(suite);
    const cases = selectCases(dataset, options.split ?? 'dev', options.caseIds, options.tags);
    const estimate = limits.estimateInputTokens ?? defaultInputEstimate;
    const attempts = 1 + (limits.maxRetriesPerCase ?? 0);
    const total = { requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
    let within = 0;
    let fits = true;
    // First attempts only: retries happen only after errors, so they are reported in the total, not here.
    const first = { requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
    for (const c of cases) {
        const sources = resolveSources(dataset, c);
        const wc = guard.worstCase(estimate(c.input, sources.map((s) => s.text).join('\n')));
        first.requests += 1;
        first.costUsd += wc.costUsd;
        first.inputTokens += wc.inputTokens;
        first.outputTokens += wc.outputTokens;
        if (fits && first.requests <= limits.maxRequests && (limits.maxCostUsd === undefined || first.costUsd <= limits.maxCostUsd + 1e-12) && (limits.maxInputTokens === undefined || first.inputTokens <= limits.maxInputTokens) && (limits.maxOutputTokens === undefined || first.outputTokens <= limits.maxOutputTokens))
            within++;
        else
            fits = false;
        total.requests += attempts;
        total.inputTokens += wc.inputTokens * attempts;
        total.outputTokens += wc.outputTokens * attempts;
        total.costUsd += wc.costUsd * attempts;
    }
    const warnings = [];
    if (!limits.maxCostUsd)
        warnings.push('No maxCostUsd: spend is bounded only by maxRequests and whatever the provider charges per request.');
    if (!limits.pricing)
        warnings.push('No pricing: cost cannot be estimated.');
    if (!limits.maxOutputTokensPerRequest)
        warnings.push('No maxOutputTokensPerRequest: output length, and so cost, is unbounded per request.');
    if (within < cases.length)
        warnings.push(`Only ${within} of ${cases.length} cases fit the limits at their worst case without retries; the run would stop early and report the rest as skipped.`);
    else if (attempts > 1 && (total.requests > limits.maxRequests || (limits.maxCostUsd !== undefined && total.costUsd > limits.maxCostUsd)))
        warnings.push('Every case fits without retries, but not if every case is retried; many errors would stop the run early.');
    if (limits.pricing)
        warnings.push(`Prices from ${limits.pricing.source}, checked ${limits.pricing.checkedOn}. Check them again if that was long ago.`);
    return {
        cases: cases.length,
        maxAttempts: attempts,
        limits,
        worstCase: { ...total, costUsd: limits.pricing ? Math.round(total.costUsd * 1e6) / 1e6 : null },
        casesWithinLimits: within,
        warnings,
    };
}
const SECRETS = [/\b(sk|pk|rk)-[A-Za-z0-9_-]{12,}/g, /\b(api[_-]?key|token|secret|password)\s*[=:]\s*\S+/gi, /Bearer\s+[A-Za-z0-9._~+/=-]{12,}/g];
function sanitizeError(e) {
    let msg = e instanceof Error ? `${e.name === 'Error' ? '' : `${e.name}: `}${e.message}` : String(e);
    for (const re of SECRETS)
        msg = msg.replace(re, '[redacted]');
    return msg.length > 300 ? `${msg.slice(0, 297)}...` : msg;
}
async function runLiveCases(cases, dataset, target, guard, options, stats) {
    const limits = guard.limits;
    const results = new Map();
    const estimate = limits.estimateInputTokens ?? defaultInputEstimate;
    const timeoutMs = limits.timeoutMs ?? 60_000;
    const maxRetries = limits.maxRetriesPerCase ?? 0;
    let next = 0;
    const worker = async () => {
        while (next < cases.length) {
            const c = cases[next++];
            const sources = resolveSources(dataset, c);
            const est = estimate(c.input, sources.map((s) => s.text).join('\n'));
            let attempt = 0;
            let lastError;
            let done;
            while (!done) {
                const r = guard.reserve(est);
                if ('denied' in r) {
                    done = attempt === 0 ? { skipReason: `budget: ${r.denied}` } : { error: `${lastError}; no retry: ${r.denied}`, attempts: attempt };
                    break;
                }
                attempt++;
                stats.attempts++;
                const controller = new AbortController();
                let timer;
                const timeout = new Promise((_, reject) => {
                    timer = setTimeout(() => {
                        controller.abort();
                        reject(new Error(`timed out after ${timeoutMs} ms`));
                    }, timeoutMs);
                });
                const start = options.clock();
                try {
                    const ctx = { caseId: c.id, sources, signal: controller.signal, attempt, ...(limits.maxOutputTokensPerRequest ? { maxOutputTokens: limits.maxOutputTokensPerRequest } : {}) };
                    const response = await Promise.race([target(c.input, ctx), timeout]);
                    const latencyMs = options.clock() - start;
                    const settled = guard.settle(r, response.usage);
                    response.usage = { ...response.usage, costUsd: settled.costUsd, costSource: settled.costSource };
                    done = { response, attempts: attempt, latencyMs };
                }
                catch (e) {
                    const timedOut = controller.signal.aborted;
                    guard.settle(r, undefined);
                    // A target that honours the signal rejects with its own abort error first; name the real cause.
                    lastError = timedOut ? `timed out after ${timeoutMs} ms` : sanitizeError(e);
                    if (timedOut)
                        stats.timeouts++;
                    else
                        stats.errors++;
                    if (attempt > maxRetries)
                        done = { error: lastError, attempts: attempt };
                    else
                        await options.sleep((limits.retryDelayMs ?? 1000) * attempt);
                }
                finally {
                    clearTimeout(timer);
                }
            }
            results.set(c.id, done);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limits.concurrency ?? 1, cases.length) }, worker));
    return results;
}
function truncate(text, max = 2000) {
    return text.length > max ? `${text.slice(0, max)}… [truncated ${text.length - max} characters]` : text;
}
/** Runs a suite and returns its report. Writes nothing except a recorded responses file when asked. */
export async function runSuite(suite, options = {}) {
    const now = options.now ?? (() => new Date());
    const clock = options.clock ?? (() => performance.now());
    const sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    const log = options.log ?? (() => { });
    const env = options.env ?? process.env;
    const mode = options.mode ?? 'offline';
    const split = options.split ?? 'dev';
    const startedAt = now();
    const t0 = clock();
    const { dataset, warnings, path: datasetPath } = loadSuiteDataset(suite);
    const selected = selectCases(dataset, split, options.caseIds, options.tags);
    const parse = suite.parse ?? parseAsIs;
    // ----- obtain responses -----
    let obtained;
    let responsesFile;
    let responsesPath;
    let guard;
    let limits;
    const live = { timeouts: 0, errors: 0, attempts: 0 };
    if (mode === 'live') {
        limits = effectiveLimits(suite, options.limits);
        assertLiveAllowed(suite, limits, env);
        guard = new BudgetGuard(limits);
        const target = await suite.live();
        log(`Live run: ${selected.length} case(s), at most ${limits.maxRequests} request(s)${limits.maxCostUsd ? `, at most $${limits.maxCostUsd}` : ''}.`);
        obtained = await runLiveCases(selected, dataset, target, guard, { clock, sleep }, live);
    }
    else {
        const source = options.responses ?? suite.responses;
        if (!source)
            throw new Error(`Suite ${suite.id} has no responses file for offline runs; pass one or run live explicitly.`);
        if (typeof source === 'string' || source instanceof URL) {
            responsesPath = toPath(source);
            responsesFile = loadResponses(responsesPath);
        }
        else
            responsesFile = parseResponses(source);
        obtained = new Map();
        for (const c of selected) {
            const r = responsesFile.responses[c.id];
            if (!r)
                obtained.set(c.id, { skipReason: 'no response recorded for this case' });
            else if (r.error !== undefined)
                obtained.set(c.id, { error: String(r.error) });
            else
                obtained.set(c.id, r.latencyMs !== undefined ? { response: r, latencyMs: r.latencyMs } : { response: r });
        }
    }
    // ----- evaluate -----
    const outputs = options.outputs ?? suite.outputs ?? 'failed';
    const caseResults = [];
    const evaluatedByEvaluator = new Map(suite.evaluators.map((e) => [e.id, []]));
    for (const c of selected) {
        const o = obtained.get(c.id);
        const sources = resolveSources(dataset, c);
        const result = {
            id: c.id,
            status: 'passed',
            hash: caseHash(dataset, c),
            split: caseSplit(dataset, c),
            tags: c.tags ?? [],
            risk: c.risk ?? 'normal',
            annotation: c.annotation?.status ?? 'none',
            origin: c.provenance?.origin ?? 'unknown',
            checks: [],
        };
        if (o.attempts !== undefined)
            result.attempts = o.attempts;
        if (o.latencyMs !== undefined)
            result.latencyMs = Math.round(o.latencyMs * 10) / 10;
        if (o.skipReason) {
            result.status = 'skipped';
            result.skipReason = o.skipReason;
            caseResults.push(result);
            continue;
        }
        if (o.error !== undefined || !o.response) {
            result.status = 'errored';
            result.error = o.error ?? 'no response';
            caseResults.push(result);
            continue;
        }
        const response = o.response;
        if (response.usage)
            result.usage = response.usage;
        if (response.model)
            result.model = response.model;
        if (response.provider)
            result.provider = response.provider;
        let parsed;
        try {
            parsed = parse(response.output);
        }
        catch (e) {
            result.status = 'errored';
            result.error = `parser threw: ${sanitizeError(e)}`;
            caseResults.push(result);
            continue;
        }
        const ctx = { case: c, sources, response, raw: response.output, parsed };
        for (const ev of suite.evaluators) {
            if (c.criteria && !c.criteria.includes(ev.id))
                continue;
            let checks;
            try {
                checks = await ev.evaluate(ctx);
            }
            catch (e) {
                checks = [{ evaluator: ev.id, criterion: 'evaluator-error', status: 'error', severity: 'major', message: `evaluator threw: ${sanitizeError(e)}` }];
            }
            result.checks.push(...checks);
            evaluatedByEvaluator.get(ev.id).push({ case: c, sources, parsed, response, checks });
        }
        const statuses = result.checks.map((k) => k.status);
        if (statuses.includes('fail'))
            result.status = 'failed';
        else if (statuses.includes('error')) {
            result.status = 'errored';
            result.error = 'an evaluator failed; see checks';
        }
        else if (!statuses.includes('pass')) {
            result.status = 'skipped';
            result.skipReason = 'no applicable checks';
        }
        if (outputs === 'all' || (outputs === 'failed' && result.status !== 'passed'))
            result.output = truncate(outputText(response.output));
        caseResults.push(result);
    }
    // ----- aggregate -----
    const criticalFailures = findCriticalFailures(caseResults);
    const metrics = caseMetrics(caseResults, criticalFailures.length);
    const tables = [];
    const notes = [];
    for (const ev of suite.evaluators) {
        if (!ev.summarize)
            continue;
        const s = ev.summarize(evaluatedByEvaluator.get(ev.id));
        metrics.push(...s.metrics);
        tables.push(...(s.tables ?? []).map((t) => ({ ...t, evaluator: ev.id })));
        notes.push(...(s.notes ?? []).map((n) => `${ev.id}: ${n}`));
    }
    const latencies = caseResults.map((c) => c.latencyMs).filter((x) => x !== undefined);
    let usage;
    let recordedUsage;
    if (guard && limits) {
        const budget = guard.snapshot();
        const { estimateInputTokens, ...rest } = limits;
        usage = {
            limits: { ...rest, ...(estimateInputTokens ? { estimateInputTokens: 'custom function' } : {}) },
            budget,
            attempts: live.attempts,
            retries: caseResults.reduce((s, c) => s + Math.max(0, (c.attempts ?? 0) - 1), 0),
            timeouts: live.timeouts,
            errors: live.errors,
            latencyMs: latencyStats(latencies),
        };
        metrics.push({ name: 'usage.requests', value: budget.committed.requests, unit: 'count' }, { name: 'usage.cost_usd', value: Math.round(budget.committed.costUsd * 1e6) / 1e6, unit: 'usd', note: 'provider-reported where available, otherwise estimated; includes worst-case reservations for requests with unknown usage' }, { name: 'usage.error_rate', value: live.attempts ? live.errors / live.attempts : null, numerator: live.errors, denominator: live.attempts, unit: 'ratio' }, { name: 'usage.timeout_rate', value: live.attempts ? live.timeouts / live.attempts : null, numerator: live.timeouts, denominator: live.attempts, unit: 'ratio' });
    }
    else {
        const sources = {};
        let cost = 0;
        let costKnown = false;
        let inputTokens = 0;
        let outputTokens = 0;
        for (const c of caseResults) {
            if (!c.usage)
                continue;
            if (c.usage.costUsd !== undefined)
                costKnown = true;
            cost += c.usage.costUsd ?? 0;
            inputTokens += c.usage.inputTokens ?? 0;
            outputTokens += c.usage.outputTokens ?? 0;
            const key = c.usage.costSource ?? (c.usage.costUsd !== undefined ? 'estimated' : 'unknown');
            sources[key] = (sources[key] ?? 0) + 1;
        }
        if (latencies.length || Object.keys(sources).length)
            recordedUsage = { latencyMs: latencyStats(latencies), costUsd: costKnown ? Math.round(cost * 1e6) / 1e6 : null, costSources: sources, inputTokens, outputTokens };
    }
    if (latencies.length) {
        const l = latencyStats(latencies);
        metrics.push({ name: 'latency.p50_ms', value: l.p50 ?? null, unit: 'ms', denominator: l.n }, { name: 'latency.p95_ms', value: l.p95 ?? null, unit: 'ms', denominator: l.n });
    }
    const thresholds = evaluateThresholds(suite.thresholds, metrics);
    const counts = { passed: 0, failed: 0, errored: 0, skipped: 0 };
    for (const c of caseResults)
        counts[c.status]++;
    const checks = { pass: 0, fail: 0, error: 0, skipped: 0 };
    for (const k of caseResults.flatMap((c) => c.checks))
        checks[k.status]++;
    const incompleteReasons = [];
    const budgetStop = guard?.stopReason;
    const skippedForData = caseResults.filter((c) => c.status === 'skipped' && c.skipReason !== 'no applicable checks').length;
    if (skippedForData)
        incompleteReasons.push(`${skippedForData} case(s) not run${budgetStop ? ` (${budgetStop})` : ''}`);
    if (counts.errored)
        incompleteReasons.push(`${counts.errored} case(s) errored; evaluator metrics exclude them`);
    const complete = incompleteReasons.length === 0;
    const evidence = mode === 'live' ? 'live' : responsesFile.origin;
    const annotation = {};
    const origins = {};
    for (const c of selected) {
        annotation[c.annotation?.status ?? 'none'] = (annotation[c.annotation?.status ?? 'none'] ?? 0) + 1;
        origins[c.provenance?.origin ?? 'unknown'] = (origins[c.provenance?.origin ?? 'unknown'] ?? 0) + 1;
    }
    const unreviewedSynthetic = selected.filter((c) => c.provenance?.origin === 'synthetic' && c.annotation?.status !== 'approved' && c.expected).length;
    const splits = { dev: 0, holdout: 0 };
    for (const c of dataset.cases)
        splits[caseSplit(dataset, c)]++;
    const finishedAt = now();
    const evaluatorInfo = suite.evaluators.map((e) => ({ id: e.id, version: e.version, kind: e.kind, ...(e.description ? { description: e.description } : {}), ...(e.config !== undefined ? { config: e.config } : {}) }));
    const modelsObserved = [...new Set(caseResults.map((c) => c.model).filter((m) => !!m))];
    // Offline, the responses file says what produced the outputs; the suite's target describes the live system.
    const targetInfo = mode === 'live' ? (suite.target ?? {}) : { ...(suite.target?.description ? { description: suite.target.description } : {}), ...(responsesFile?.target ?? {}) };
    const target = { ...targetInfo, modelsObserved };
    if (responsesFile?.recordedAt)
        target.recordedAt = responsesFile.recordedAt;
    if (responsesFile?.description)
        target.responsesDescription = responsesFile.description;
    const runId = `${suite.id}-${startedAt.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-${evidence}`;
    const report = {
        format: REPORT_FORMAT,
        run: {
            id: runId,
            startedAt: startedAt.toISOString(),
            finishedAt: finishedAt.toISOString(),
            durationMs: Math.round(clock() - t0),
            mode,
            evidence,
            split,
            filters: { ...(options.caseIds?.length ? { caseIds: options.caseIds } : {}), ...(options.tags?.length ? { tags: options.tags } : {}) },
            complete,
            incompleteReasons,
            toolkitVersion: TOOLKIT_VERSION,
            node: process.version,
            ...(responsesPath ? { responsesFile: responsesPath } : {}),
        },
        suite: { id: suite.id, version: suite.version, ...(suite.description ? { description: suite.description } : {}), evaluators: evaluatorInfo, criteriaHash: hashValue(evaluatorInfo) },
        dataset: {
            id: dataset.id,
            version: dataset.version,
            fingerprint: datasetFingerprint(dataset),
            ...(datasetPath ? { path: datasetPath } : {}),
            totalCases: dataset.cases.length,
            selectedCases: selected.length,
            splits,
            annotation,
            origins,
            warnings,
        },
        target,
        verdict: 'pass',
        summary: {
            selected: selected.length,
            ...counts,
            checks,
            byTag: tally(caseResults, (c) => c.tags),
            byRisk: tally(caseResults, (c) => [c.risk]),
        },
        criticalFailures,
        thresholds,
        metrics,
        tables,
        notes,
        cases: caseResults,
        limitations: [],
        nextActions: [],
    };
    if (usage)
        report.usage = usage;
    if (recordedUsage)
        report.recordedUsage = recordedUsage;
    report.verdict = criticalFailures.length > 0 || thresholds.some((t) => t.status !== 'met') ? 'fail' : complete ? 'pass' : 'incomplete';
    if (options.baseline)
        report.comparison = compareReports(options.baseline, report);
    report.limitations = limitationsFor({
        evidence,
        selected: selected.length,
        ...(responsesFile?.recordedAt ? { recordedAt: responsesFile.recordedAt } : {}),
        evaluatorLimitations: [...new Set(suite.evaluators.flatMap((e) => e.limitations ?? []))],
        judgeEvaluators: suite.evaluators.filter((e) => e.kind === 'judge').map((e) => e.id),
        unreviewedSynthetic,
        disputed: annotation.disputed ?? 0,
        split,
        holdoutSelected: selected.filter((c) => caseSplit(dataset, c) === 'holdout').length,
        ...(budgetStop ? { budgetStop } : {}),
        live: mode === 'live',
    });
    report.nextActions = nextActionsFor(report, unreviewedSynthetic);
    if (mode === 'live' && options.recordTo) {
        const responses = {};
        for (const c of selected) {
            const o = obtained.get(c.id);
            if (o.response)
                responses[c.id] = { ...o.response, ...(o.latencyMs !== undefined ? { latencyMs: Math.round(o.latencyMs) } : {}) };
            else if (o.error !== undefined)
                responses[c.id] = { output: null, error: o.error };
        }
        const file = {
            format: 'ai-eval-responses/1',
            origin: 'recorded',
            recordedAt: startedAt.toISOString(),
            description: `Recorded by live run ${runId}`,
            ...(suite.target ? { target: suite.target } : {}),
            dataset: { id: dataset.id, version: dataset.version, fingerprint: report.dataset.fingerprint },
            responses,
        };
        saveResponses(options.recordTo, file);
        report.run.recordedTo = options.recordTo;
    }
    return report;
}
