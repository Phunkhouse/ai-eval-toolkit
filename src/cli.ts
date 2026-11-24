#!/usr/bin/env node
// ai-eval: read-only, offline helpers. Runs go through the suite file (see runCli).
import { writeFileSync } from 'node:fs';
import { loadDataset, DatasetError, validateDataset } from './dataset.ts';
import { compareReports } from './reporting/compare.ts';
import { renderComparison } from './reporting/markdown.ts';
import { readReport } from './runner/entry.ts';
import { readFileSync } from 'node:fs';

const HELP = `Usage:
  ai-eval check-dataset FILE...            validate dataset files; exit 1 on errors
  ai-eval compare BASELINE CURRENT [--md FILE] [--json]
                                           compare two report.json files; exit 1 on regressions,
                                           3 when the runs are not comparable

Nothing here calls a model or the network. Runs are started from the suite file:
  node evals/<suite>.eval.ts --help`;

function checkDataset(files: string[]): number {
  if (files.length === 0) {
    console.error(HELP);
    return 2;
  }
  let failed = 0;
  for (const file of files) {
    let data: unknown;
    try {
      data = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      console.error(`${file}: cannot read: ${(e as Error).message}`);
      failed++;
      continue;
    }
    const issues = validateDataset(data);
    const errors = issues.filter((i) => i.level === 'error');
    for (const i of issues) console.log(`${file}: ${i.level} ${i.path}: ${i.message}`);
    if (errors.length) failed++;
    else {
      const { dataset } = loadDataset(file);
      console.log(`${file}: valid (${dataset.id} ${dataset.version}, ${dataset.cases.length} case(s), ${issues.length} warning(s))`);
    }
  }
  return failed ? 1 : 0;
}

function compare(args: string[]): number {
  const md = args.indexOf('--md');
  const mdFile = md >= 0 ? args[md + 1] : undefined;
  const json = args.includes('--json');
  const files = args.filter((a, i) => !a.startsWith('--') && (md < 0 || i !== md + 1));
  if (files.length !== 2 || (md >= 0 && !mdFile)) {
    console.error(HELP);
    return 2;
  }
  const c = compareReports(readReport(files[0]!), readReport(files[1]!));
  if (json) console.log(JSON.stringify(c, null, 2));
  else console.log(renderComparison(c));
  if (mdFile) writeFileSync(mdFile, renderComparison(c));
  if (c.compatibility === 'not-comparable') return 3;
  return c.cases.regressed.length > 0 ? 1 : 0;
}

const [command, ...rest] = process.argv.slice(2);
try {
  if (command === 'check-dataset') process.exitCode = checkDataset(rest);
  else if (command === 'compare') process.exitCode = compare(rest);
  else {
    console.log(HELP);
    process.exitCode = command === undefined || command === '--help' || command === '-h' ? 0 : 2;
  }
} catch (e) {
  console.error(e instanceof DatasetError ? e.message : `Error: ${(e as Error).message}`);
  process.exitCode = 2;
}
