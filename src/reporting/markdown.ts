import { formatRatio } from '../metrics/stats.ts';
import type { Metric, Table } from '../types.ts';
import type { Comparison } from './compare.ts';
import type { Report } from './report.ts';

const esc = (v: unknown) => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

function table(columns: string[], rows: Array<Array<unknown>>): string {
  const head = `| ${columns.map(esc).join(' | ')} |\n| ${columns.map(() => '---').join(' | ')} |`;
  return `${head}\n${rows.map((r) => `| ${r.map((c) => (c === null || c === undefined ? '' : esc(c))).join(' | ')} |`).join('\n')}`;
}

function metricValue(m: Metric): string {
  if (m.unit === 'ratio') {
    const base = m.numerator !== undefined ? formatRatio(m) : m.value === null ? 'undefined' : `${(m.value * 100).toFixed(1)}%`;
    return m.interval ? `${base}, 95% CI ${(m.interval[0] * 100).toFixed(0)}–${(m.interval[1] * 100).toFixed(0)}%` : base;
  }
  if (m.value === null) return 'undefined';
  if (m.unit === 'usd') return `$${m.value.toFixed(4)}`;
  if (m.unit === 'ms') return `${m.value} ms${m.denominator !== undefined ? ` (n=${m.denominator})` : ''}`;
  return String(m.value);
}

const EVIDENCE_BANNER: Record<string, string> = {
  mock: '> [!WARNING]\n> **Mock responses.** This run tested the dataset, evaluators and report against hand-written outputs. It is not evidence of model quality.',
  recorded: '> [!NOTE]\n> **Recorded responses.** This run replays outputs captured from an earlier live run; it is not a fresh measurement.',
  live: '> [!NOTE]\n> **Live run.** Outputs came from the real system during this run. One run does not measure run-to-run variance.',
};

export function renderMarkdown(r: Report): string {
  const out: string[] = [];
  const s = r.summary;
  out.push(`# Evaluation report: ${r.suite.id}`);
  out.push('');
  out.push(EVIDENCE_BANNER[r.run.evidence] ?? '');
  out.push('');
  const verdict = { pass: 'PASS', fail: 'FAIL', incomplete: 'INCOMPLETE' }[r.verdict];
  out.push(`**Verdict: ${verdict}** — ${s.passed} passed, ${s.failed} failed, ${s.errored} errored, ${s.skipped} skipped of ${s.selected} selected case(s); ${r.criticalFailures.length} critical failure(s).`);
  if (!r.run.complete) out.push(`\nIncomplete: ${r.run.incompleteReasons.join('; ')}.`);
  out.push('');

  out.push('## Critical failures');
  out.push('');
  if (r.criticalFailures.length === 0) out.push('None.');
  else
    out.push(
      table(
        ['Case', 'Why critical', 'Check', 'Finding'],
        r.criticalFailures.map((f) => [f.caseId, f.reason === 'critical-check' ? 'critical check' : 'critical-risk case', f.evaluator ? `${f.evaluator}/${f.criterion}` : '', f.message]),
      ),
    );
  out.push('');

  out.push('## Thresholds');
  out.push('');
  out.push(table(['Metric', 'Required', 'Result', 'Status'], r.thresholds.map((t) => [t.metric + (t.implicit ? ' (implicit)' : ''), [t.min !== undefined ? `≥ ${t.min}` : '', t.max !== undefined ? `≤ ${t.max}` : '', t.minSamples ? `n ≥ ${t.minSamples}` : ''].filter(Boolean).join(', '), t.message, t.status])));
  out.push('');

  out.push('## Run');
  out.push('');
  const target = r.target;
  const rows: Array<[string, unknown]> = [
    ['Run', `${r.run.id} (${r.run.mode}, evidence: ${r.run.evidence})`],
    ['When', `${r.run.startedAt} → ${r.run.finishedAt}`],
    ['Suite', `${r.suite.id} ${r.suite.version}, criteria ${r.suite.criteriaHash}`],
    ['Dataset', `${r.dataset.id} ${r.dataset.version}, fingerprint ${r.dataset.fingerprint}; ${r.dataset.selectedCases} of ${r.dataset.totalCases} case(s) selected (split: ${r.run.split}${r.run.filters.caseIds ? `, cases: ${r.run.filters.caseIds.join(', ')}` : ''}${r.run.filters.tags ? `, tags: ${r.run.filters.tags.join(', ')}` : ''})`],
    ['Expectations', `annotation ${fmtCounts(r.dataset.annotation)}; origin ${fmtCounts(r.dataset.origins)}`],
    ['Target', [target.description, target.provider, target.model, target.promptVersion ? `prompt ${target.promptVersion}` : '', target.appVersion ? `app ${target.appVersion}` : ''].filter(Boolean).join(', ') || 'not described'],
  ];
  if (target.modelsObserved.length) rows.push(['Models observed', target.modelsObserved.join(', ')]);
  if (target.config) rows.push(['Inference config', JSON.stringify(target.config)]);
  if (target.recordedAt) rows.push(['Recorded at', target.recordedAt]);
  if (r.run.responsesFile) rows.push(['Responses file', r.run.responsesFile]);
  if (r.run.recordedTo) rows.push(['Recorded to', r.run.recordedTo]);
  rows.push(['Evaluators', r.suite.evaluators.map((e) => `${e.id}@${e.version} (${e.kind})`).join(', ')]);
  rows.push(['Toolkit', `${r.run.toolkitVersion}, Node ${r.run.node}`]);
  out.push(table(['', ''], rows));
  out.push('');

  out.push('## Metrics');
  out.push('');
  out.push(table(['Metric', 'Value', 'Note'], r.metrics.map((m) => [m.name, metricValue(m), m.note ?? ''])));
  out.push('');
  for (const t of r.tables) out.push(renderTable(t));
  if (Object.keys(s.byTag).length) {
    out.push('### By tag');
    out.push('');
    out.push(table(['Tag', 'Cases', 'Passed', 'Failed', 'Errored', 'Skipped'], Object.entries(s.byTag).sort().map(([k, v]) => [k, v.total, v.passed, v.failed, v.errored, v.skipped])));
    out.push('');
  }
  if (r.notes.length) {
    out.push(r.notes.map((n) => `- ${n}`).join('\n'));
    out.push('');
  }

  const failed = r.cases.filter((c) => c.status === 'failed');
  out.push(`## Failed cases (${failed.length})`);
  out.push('');
  if (failed.length === 0) out.push('None.');
  for (const c of failed) {
    out.push(`### ${c.id}${c.risk !== 'normal' ? ` (risk: ${c.risk})` : ''}${c.tags.length ? ` — ${c.tags.join(', ')}` : ''}`);
    out.push('');
    for (const k of c.checks.filter((x) => x.status === 'fail')) out.push(`- **${k.severity}** \`${k.evaluator}/${k.criterion}\`: ${k.message}`);
    if (c.output !== undefined) out.push('', '<details><summary>Output</summary>', '', '```text', c.output.replace(/```/g, "'''"), '```', '', '</details>');
    out.push('');
  }

  const errored = r.cases.filter((c) => c.status === 'errored');
  const skipped = r.cases.filter((c) => c.status === 'skipped');
  out.push(`## Errored (${errored.length}) and skipped (${skipped.length}) cases`);
  out.push('');
  if (errored.length + skipped.length === 0) out.push('None.');
  else out.push(table(['Case', 'Status', 'Reason'], [...errored.map((c) => [c.id, 'errored', c.error ?? '']), ...skipped.map((c) => [c.id, 'skipped', c.skipReason ?? ''])]));
  out.push('');

  if (r.comparison) out.push(renderComparison(r.comparison));

  if (r.usage || r.recordedUsage) {
    out.push('## Cost and latency');
    out.push('');
    if (r.usage) {
      const u = r.usage;
      const b = u.budget;
      out.push(
        table(
          ['', ''],
          [
            ['Requests', `${b.committed.requests} committed (limit ${u.limits.maxRequests}); ${u.attempts} attempt(s), ${u.retries} retr${u.retries === 1 ? 'y' : 'ies'}, ${u.timeouts} timeout(s), ${u.errors} error(s)`],
            ['Tokens', `${b.committed.inputTokens} input, ${b.committed.outputTokens} output`],
            ['Cost', `$${b.committed.costUsd.toFixed(4)}${u.limits.maxCostUsd ? ` (limit $${u.limits.maxCostUsd})` : ''}: provider-reported $${b.cost.providerReportedUsd.toFixed(4)}, estimated $${b.cost.estimatedUsd.toFixed(4)}, worst case counted for unknown usage $${b.cost.reservedUnknownUsd.toFixed(4)}`],
            ['Pricing', u.limits.pricing ? `${u.limits.pricing.inputPerMillionTokensUsd}/${u.limits.pricing.outputPerMillionTokensUsd} USD per million input/output tokens, from ${u.limits.pricing.source}, checked ${u.limits.pricing.checkedOn}` : 'none given'],
            ['Latency', fmtLatency(u.latencyMs)],
            ['Stopped', b.stopReason ?? 'no'],
            ['Overruns', b.overruns.length ? b.overruns.join('; ') : 'none'],
          ],
        ),
      );
      out.push('', 'Estimated costs use the pricing above and reported token counts; they are not billing records. Check the provider console for actual charges.');
    } else if (r.recordedUsage) {
      const u = r.recordedUsage;
      out.push(table(['', ''], [['Latency (recorded)', fmtLatency(u.latencyMs)], ['Tokens (recorded)', `${u.inputTokens} input, ${u.outputTokens} output`], ['Cost (recorded)', u.costUsd === null ? 'not recorded' : `$${u.costUsd.toFixed(4)} (${fmtCounts(u.costSources)} response(s) by cost source)`]]));
    }
    out.push('');
  }

  if (r.dataset.warnings.length) {
    out.push('## Dataset warnings');
    out.push('');
    out.push(r.dataset.warnings.map((w) => `- ${w}`).join('\n'));
    out.push('');
  }
  out.push('## Limitations');
  out.push('');
  out.push(r.limitations.map((l) => `- ${l}`).join('\n'));
  out.push('');
  out.push('## Recommended next actions');
  out.push('');
  out.push(r.nextActions.length ? r.nextActions.map((a, i) => `${i + 1}. ${a}`).join('\n') : 'None.');
  out.push('');
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

function renderTable(t: Table & { evaluator?: string }): string {
  return `### ${t.evaluator ? `${t.evaluator}: ` : ''}${t.title}\n\n${table(t.columns, t.rows)}\n${t.note ? `\n${t.note}\n` : ''}`;
}

export function renderComparison(c: Comparison): string {
  const out: string[] = [];
  out.push(`## Comparison with baseline ${c.baseline.runId}`);
  out.push('');
  out.push(`**${c.compatibility}.** Baseline: ${c.baseline.startedAt}, evidence ${c.baseline.evidence}, dataset ${c.baseline.datasetVersion}, suite ${c.baseline.suiteVersion}${c.baseline.model ? `, model ${c.baseline.model}` : ''}${c.baseline.promptVersion ? `, prompt ${c.baseline.promptVersion}` : ''}.`);
  if (c.reasons.length) out.push('', c.reasons.map((r) => `- ${r}`).join('\n'));
  out.push('');
  if (c.compatibility !== 'not-comparable') {
    const k = c.cases;
    out.push(
      table(
        ['Change', 'Count', 'Cases'],
        [
          ['Regressed (passed → failed/errored)', k.regressed.length, k.regressed.join(', ')],
          ['Improved (failed/errored → passed)', k.improved.length, k.improved.join(', ')],
          ['Still failing', k.stillFailing.length, k.stillFailing.join(', ')],
          ['New cases', k.added.length, k.added.map((a) => `${a.id} (${a.status})`).join(', ')],
          ['New and failing', k.added.filter((a) => a.status !== 'passed').length, k.added.filter((a) => a.status !== 'passed').map((a) => a.id).join(', ')],
          ['Removed cases', k.removed.length, k.removed.join(', ')],
          ['Changed content (not compared)', k.changed.length, k.changed.join(', ')],
        ],
      ),
    );
    out.push('');
  }
  if (c.metrics.length) {
    out.push(table(['Metric', 'Baseline', 'Current', 'Change'], c.metrics.filter((m) => m.delta !== 0).map((m) => [m.name, m.baseline ?? 'undefined', m.current ?? 'undefined', m.delta === null ? '' : m.delta > 0 ? `+${m.delta}` : m.delta])));
    out.push('', 'Unchanged metrics are omitted.');
    out.push('');
  }
  const usage = c.usage.filter((u) => u.baseline !== null || u.current !== null);
  if (usage.length) {
    out.push(table(['Usage', 'Baseline', 'Current', 'Change'], usage.map((u) => [u.name, u.baseline ?? 'unknown', u.current ?? 'unknown', u.delta ?? ''])));
    out.push('');
  }
  return out.join('\n');
}

function fmtCounts(o: Record<string, number>): string {
  const e = Object.entries(o);
  return e.length ? e.map(([k, v]) => `${k} ${v}`).join(', ') : 'none';
}

function fmtLatency(l: { n: number; p50?: number; p95?: number; max?: number }): string {
  return l.n ? `p50 ${l.p50} ms, p95 ${l.p95} ms, max ${l.max} ms (n=${l.n})` : 'not measured';
}
