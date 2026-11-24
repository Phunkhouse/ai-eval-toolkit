// The Skill's templates must form a working suite: copy them into a scratch "project" inside this
// package (so `ai-eval-toolkit` resolves to the built dist/) and run it.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { validateDataset } from '../src/index.ts';

const root = new URL('..', import.meta.url).pathname;
const templates = join(root, 'skills/eval-setup/templates');
mkdirSync(join(root, '.tmp'), { recursive: true });
const scratch = mkdtempSync(join(root, '.tmp', 'template-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe('eval-setup templates', () => {
  it('dataset template is valid', () => {
    const issues = validateDataset(JSON.parse(readFileSync(join(templates, 'dataset.json'), 'utf8')));
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('suite template runs offline and catches the planted canary', () => {
    const dir = join(scratch, 'evals', 'feature');
    mkdirSync(dir, { recursive: true });
    const fill = (text: string) => text.replaceAll('<feature>', 'feature');
    writeFileSync(join(dir, 'feature.eval.ts'), fill(readFileSync(join(templates, 'suite.eval.ts'), 'utf8')));
    writeFileSync(join(dir, 'feature.dataset.json'), readFileSync(join(templates, 'dataset.json'), 'utf8'));
    writeFileSync(join(dir, 'responses.mock.json'), readFileSync(join(templates, 'responses.mock.json'), 'utf8'));
    const r = spawnSync(process.execPath, [join(dir, 'feature.eval.ts'), '--out', join(dir, 'results')], { cwd: scratch, encoding: 'utf8', env: { ...process.env, VITEST: undefined } });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(1);
    const report = JSON.parse(readFileSync(join(dir, 'results', 'report.json'), 'utf8'));
    expect(report.criticalFailures).toEqual([expect.objectContaining({ caseId: 'C-003', criterion: 'forbidden:case-forbidden-1' })]);
    expect(report.cases.map((c: { status: string }) => c.status)).toEqual(['passed', 'passed', 'failed']);
  });
});
