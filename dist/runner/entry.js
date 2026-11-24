import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { DatasetError } from '../dataset.js';
import { renderMarkdown } from '../reporting/markdown.js';
import { REPORT_FORMAT } from '../reporting/report.js';
import { LiveRunRefused, planLiveRun, runSuite } from './run.js';
export const EXIT = { pass: 0, fail: 1, usage: 2, incomplete: 3 };
const HELP = `Usage: node <suite file> [options]

Offline by default: replays the suite's responses file. Nothing is sent anywhere.

  --responses FILE      responses file for an offline run (default: the suite's)
  --split dev|holdout|all   cases to run (default: dev)
  --case ID             only this case (repeatable)
  --tag TAG             only cases with this tag (repeatable)
  --baseline FILE       compare with an earlier report.json
  --out DIR             report directory (default: evals/results/<suite>/<run id>)
  --outputs none|failed|all   outputs kept in the report, truncated (default: suite setting or failed)
  --quiet               print only the verdict line

Live runs call the real system and may cost money. They need --live and limits:

  --live                run against the suite's live target
  --dry-run             with --live: print the plan and worst-case cost, call nothing
  --max-requests N      override the suite's request limit
  --max-cost-usd X      override the suite's cost limit
  --concurrency N       override the suite's concurrency
  --record FILE         save the live responses for offline replay (may contain sensitive data)

Exit codes: 0 pass, 1 fail (critical failure or threshold not met), 2 usage or configuration
error, 3 incomplete (errored or skipped cases, budget stop).`;
/** True when the module with this `import.meta.url` is the script Node was started with. */
export function isMain(importMetaUrl) {
    if (!process.argv[1])
        return false;
    // Compare real paths: the script may be started through a symlink (on macOS, /var is /private/var).
    const real = (p) => {
        try {
            return realpathSync(p);
        }
        catch {
            return resolve(p);
        }
    };
    return real(process.argv[1]) === real(fileURLToPath(importMetaUrl));
}
export function writeReports(report, dir) {
    mkdirSync(dir, { recursive: true });
    const json = join(dir, 'report.json');
    const markdown = join(dir, 'report.md');
    writeFileSync(json, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(markdown, renderMarkdown(report));
    return { json, markdown };
}
export function readReport(path) {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    if (data?.format !== REPORT_FORMAT)
        throw new Error(`${path} is not an ${REPORT_FORMAT} report`);
    return data;
}
const num = (v, name) => {
    if (v === undefined)
        return undefined;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0)
        throw new UsageError(`${name} must be a positive number`);
    return n;
};
class UsageError extends Error {
}
/**
 * Entry point for a suite file: `await runCli(suite)` at the end of `evals/<name>.eval.ts`, then
 * `node evals/<name>.eval.ts [options]`. Sets process.exitCode and returns the report.
 */
export async function runCli(suite, argv = process.argv.slice(2), io = {}) {
    const log = io.log ?? ((s) => console.log(s));
    const error = io.error ?? ((s) => console.error(s));
    try {
        const { values } = parseArgs({
            args: argv,
            strict: true,
            options: {
                live: { type: 'boolean' },
                'dry-run': { type: 'boolean' },
                responses: { type: 'string' },
                split: { type: 'string' },
                case: { type: 'string', multiple: true },
                tag: { type: 'string', multiple: true },
                baseline: { type: 'string' },
                out: { type: 'string' },
                outputs: { type: 'string' },
                record: { type: 'string' },
                'max-requests': { type: 'string' },
                'max-cost-usd': { type: 'string' },
                concurrency: { type: 'string' },
                quiet: { type: 'boolean' },
                help: { type: 'boolean', short: 'h' },
            },
        });
        if (values.help) {
            log(HELP);
            return undefined;
        }
        if (values.split && !['dev', 'holdout', 'all'].includes(values.split))
            throw new UsageError('--split must be dev, holdout or all');
        if (values.outputs && !['none', 'failed', 'all'].includes(values.outputs))
            throw new UsageError('--outputs must be none, failed or all');
        if (!values.live && (values['dry-run'] || values.record || values['max-requests'] || values['max-cost-usd'] || values.concurrency)) {
            throw new UsageError('--dry-run, --record, --max-requests, --max-cost-usd and --concurrency apply only to --live runs');
        }
        if (values.live && values.responses)
            throw new UsageError('--responses is for offline runs; a live run calls the target');
        const maxRequests = num(values['max-requests'], '--max-requests');
        const maxCostUsd = num(values['max-cost-usd'], '--max-cost-usd');
        const concurrency = num(values.concurrency, '--concurrency');
        const options = {
            mode: values.live ? 'live' : 'offline',
            split: values.split ?? 'dev',
            ...(values.case ? { caseIds: values.case } : {}),
            ...(values.tag ? { tags: values.tag } : {}),
            ...(values.responses ? { responses: values.responses } : {}),
            ...(values.outputs ? { outputs: values.outputs } : {}),
            ...(values.record ? { recordTo: values.record } : {}),
            limits: { ...(maxRequests ? { maxRequests: Math.floor(maxRequests) } : {}), ...(maxCostUsd ? { maxCostUsd } : {}), ...(concurrency ? { concurrency: Math.floor(concurrency) } : {}) },
            log: values.quiet ? () => { } : log,
        };
        if (values.baseline)
            options.baseline = readReport(values.baseline);
        if (values.live && values['dry-run']) {
            const plan = planLiveRun(suite, options);
            log(`Live run plan for ${suite.id} (nothing was called):`);
            log(`  cases: ${plan.cases}, attempts per case at most ${plan.maxAttempts}`);
            log(`  limits: ${plan.limits.maxRequests} request(s)${plan.limits.maxCostUsd ? `, $${plan.limits.maxCostUsd}` : ''}${plan.limits.maxOutputTokensPerRequest ? `, ${plan.limits.maxOutputTokensPerRequest} output tokens per request` : ''}, concurrency ${plan.limits.concurrency ?? 1}, timeout ${plan.limits.timeoutMs ?? 60000} ms`);
            log(`  worst case if every attempt runs: ${plan.worstCase.requests} request(s), ~${plan.worstCase.inputTokens} input and ${plan.worstCase.outputTokens} output tokens, ${plan.worstCase.costUsd === null ? 'cost unknown (no pricing)' : `~$${plan.worstCase.costUsd.toFixed(4)}`}`);
            log(`  cases that fit the limits at their worst case: ${plan.casesWithinLimits} of ${plan.cases}`);
            for (const w of plan.warnings)
                log(`  note: ${w}`);
            process.exitCode = EXIT.pass;
            return undefined;
        }
        const report = await runSuite(suite, options);
        const dir = values.out ?? join('evals', 'results', suite.id, report.run.id);
        const paths = writeReports(report, dir);
        const s = report.summary;
        const line = `${report.verdict.toUpperCase()} ${suite.id} [${report.run.evidence}]: ${s.passed} passed, ${s.failed} failed, ${s.errored} errored, ${s.skipped} skipped of ${s.selected}; ${report.criticalFailures.length} critical failure(s)`;
        log(line);
        if (!values.quiet) {
            for (const f of report.criticalFailures.slice(0, 10))
                log(`  critical: ${f.caseId} ${f.evaluator ? `${f.evaluator}/${f.criterion}: ` : ''}${f.message}`);
            if (report.criticalFailures.length > 10)
                log(`  … and ${report.criticalFailures.length - 10} more`);
            for (const t of report.thresholds.filter((x) => x.status !== 'met'))
                log(`  threshold ${t.metric}: ${t.message}`);
            if (report.comparison)
                log(`  baseline: ${report.comparison.compatibility}; ${report.comparison.cases.regressed.length} regressed, ${report.comparison.cases.improved.length} improved`);
            if (report.run.evidence === 'mock')
                log('  mock responses: this checks the evaluation, not the model');
            if (report.usage) {
                const b = report.usage.budget;
                const known = b.cost.providerReportedUsd + b.cost.estimatedUsd;
                const reserved = b.unknownUsageRequests ? `, plus $${b.cost.reservedUnknownUsd.toFixed(4)} counted at worst case for ${b.unknownUsageRequests} request(s) with unknown usage (may not have been billed)` : '';
                log(`  usage: ${b.committed.requests} request(s); cost $${known.toFixed(4)} from reported usage${reserved}${b.stopReason ? `; stopped: ${b.stopReason}` : ''}`);
            }
            const rel = relative(process.cwd(), paths.markdown);
            log(`  report: ${rel && !rel.startsWith('..') ? rel : paths.markdown}`);
        }
        process.exitCode = report.verdict === 'pass' ? EXIT.pass : report.verdict === 'fail' ? EXIT.fail : EXIT.incomplete;
        return report;
    }
    catch (e) {
        if (e instanceof UsageError || e instanceof LiveRunRefused || e instanceof DatasetError || e.code?.startsWith('ERR_PARSE_ARGS')) {
            error(`${e instanceof LiveRunRefused ? 'Live run refused: ' : ''}${e.message}`);
            if (!(e instanceof LiveRunRefused) && !(e instanceof DatasetError))
                error('Run with --help for usage.');
            process.exitCode = EXIT.usage;
            return undefined;
        }
        error(`Error: ${e.message}`);
        process.exitCode = EXIT.usage;
        return undefined;
    }
}
