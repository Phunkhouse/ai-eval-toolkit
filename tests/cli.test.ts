import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOOLKIT_VERSION } from '../src/index.ts';

const root = new URL('..', import.meta.url).pathname;
const node = (args: string[]) => spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', env: { ...process.env, VITEST: undefined } });

describe('package', () => {
  it('keeps TOOLKIT_VERSION equal to package.json', () => {
    expect(TOOLKIT_VERSION).toBe(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version);
  });
});

describe('ai-eval check-dataset', () => {
  it('accepts the example datasets', () => {
    const r = node(['src/cli.ts', 'check-dataset', 'examples/support-triage/triage.dataset.json', 'examples/invoice-extraction/invoice.dataset.json']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/support-triage 2026-11-24.1, 14 case/);
  });

  it('fails on an invalid dataset', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ai-eval-'));
    writeFileSync(join(dir, 'bad.json'), JSON.stringify({ format: 'ai-eval-dataset/1', id: 'x', version: '1', cases: [{ id: 'a' }, { id: 'a', input: 1 }] }));
    const r = node(['src/cli.ts', 'check-dataset', join(dir, 'bad.json')]);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/duplicate case id/);
  });
});

describe('suite entry point', () => {
  it('runs when started through a symlinked path', () => {
    // Regression: isMain compared unresolved paths, so a suite reached through a symlink
    // (as under macOS /var -> /private/var) exited 0 without running.
    const dir = mkdtempSync(join(tmpdir(), 'ai-eval-'));
    const link = join(dir, 'linked.eval.ts');
    symlinkSync(join(root, 'examples/invoice-extraction/invoice.eval.ts'), link);
    const r = node([link, '--out', join(dir, 'out'), '--quiet']);
    expect(r.stdout).toMatch(/^FAIL invoice-extraction/);
    expect(r.status).toBe(1);
  });

  it('rejects live-only options without --live', () => {
    const r = node(['examples/support-triage/triage.eval.ts', '--max-requests', '5']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/apply only to --live/);
  });

  it('plans a live run with --dry-run and calls nothing', () => {
    const r = node(['examples/support-triage/triage.eval.ts', '--live', '--dry-run']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/nothing was called/);
    expect(r.stdout).toMatch(/worst case if every attempt runs: 26 request/);
  });

  it('refuses a live run when CI is set', () => {
    const r = spawnSync(process.execPath, ['examples/support-triage/triage.eval.ts', '--live'], { cwd: root, encoding: 'utf8', env: { ...process.env, VITEST: undefined, CI: 'true', ANTHROPIC_API_KEY: '' } });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/Live run refused: .*CI/);
  });

  it('writes JSON and Markdown reports and exits 1 on failure', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ai-eval-'));
    const r = node(['examples/invoice-extraction/invoice.eval.ts', '--out', dir, '--quiet']);
    expect(r.status).toBe(1);
    expect(JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')).verdict).toBe('fail');
    expect(readFileSync(join(dir, 'report.md'), 'utf8')).toMatch(/^# Evaluation report: invoice-extraction/);
    const cmp = node(['src/cli.ts', 'compare', join(dir, 'report.json'), join(dir, 'report.json')]);
    expect(cmp.status).toBe(0);
    expect(cmp.stdout).toMatch(/\*\*comparable\.\*\*/);
  });
});

