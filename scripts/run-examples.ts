// Runs the worked examples offline through the built package (dist/), the way a project would,
// and checks each ends with the expected verdict. Reports go to examples/<name>/results/ (ignored).
// Usage: node scripts/run-examples.ts
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const env = { ...process.env, VITEST: undefined, CI: undefined };
let failures = 0;

function run(label: string, args: string[], expectedExit: number, expectedVerdict: string, out: string): void {
  const r = spawnSync(process.execPath, [...args, '--out', join(root, out)], { cwd: root, encoding: 'utf8', env });
  const verdict = r.status === 0 || r.status === 1 || r.status === 3 ? (JSON.parse(readFileSync(join(root, out, 'report.json'), 'utf8')) as { verdict: string }).verdict : 'none';
  const ok = r.status === expectedExit && verdict === expectedVerdict;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: exit ${r.status}, verdict ${verdict} (expected ${expectedExit}, ${expectedVerdict})`);
  console.log(`     ${r.stdout.split('\n')[0]}`);
  if (!ok) {
    failures++;
    console.error(r.stdout, r.stderr);
  }
}

// Both examples contain planted failures, so a correct evaluation fails them.
run('triage, prompt v1 (mock)', ['examples/support-triage/triage.eval.ts', '--responses', 'examples/support-triage/responses.prompt-v1.mock.json'], 1, 'fail', 'examples/support-triage/results/prompt-v1');
run('triage, prompt v2 vs v1 (mock)', ['examples/support-triage/triage.eval.ts', '--baseline', 'examples/support-triage/results/prompt-v1/report.json'], 1, 'fail', 'examples/support-triage/results/prompt-v2');
run('triage, holdout (mock)', ['examples/support-triage/triage.eval.ts', '--split', 'holdout'], 1, 'fail', 'examples/support-triage/results/holdout');
run('invoice extraction (mock)', ['examples/invoice-extraction/invoice.eval.ts'], 1, 'fail', 'examples/invoice-extraction/results/latest');

const dry = spawnSync(process.execPath, ['examples/support-triage/triage.eval.ts', '--live', '--dry-run'], { cwd: root, encoding: 'utf8', env });
const dryOk = dry.status === 0 && dry.stdout.includes('nothing was called');
console.log(`${dryOk ? 'ok  ' : 'FAIL'} triage live plan (--live --dry-run, no calls)`);
if (!dryOk) failures++;

if (failures) {
  console.error(`${failures} example check(s) failed.`);
  process.exitCode = 1;
} else console.log('All example checks passed. Reports are in examples/*/results/.');
