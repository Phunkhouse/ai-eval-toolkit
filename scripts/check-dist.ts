// Fails when the committed dist/ differs from a fresh build of src/ (decision 0002).
// Usage: node scripts/check-dist.ts
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const fresh = mkdtempSync(join(tmpdir(), 'ai-eval-dist-'));
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });

try {
  execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(root, 'tsconfig.build.json'), '--outDir', fresh], { stdio: 'inherit' });
  const want = new Map(files(fresh).map((f) => [relative(fresh, f), readFileSync(f, 'utf8')]));
  const have = new Map(files(join(root, 'dist')).map((f) => [relative(join(root, 'dist'), f), readFileSync(f, 'utf8')]));
  const problems: string[] = [];
  for (const [f, text] of want) if (have.get(f) !== text) problems.push(have.has(f) ? `stale: dist/${f}` : `missing: dist/${f}`);
  for (const f of have.keys()) if (!want.has(f)) problems.push(`not built from src (delete it): dist/${f}`);
  if (problems.length) {
    console.error(`dist/ is out of date. Run npm run build and commit dist/.\n  ${problems.join('\n  ')}`);
    process.exitCode = 1;
  } else console.log(`dist/ matches src/ (${want.size} files).`);
} finally {
  rmSync(fresh, { recursive: true, force: true });
}
