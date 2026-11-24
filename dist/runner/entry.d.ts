import { type Report } from '../reporting/report.ts';
import type { Suite } from './suite.ts';
export declare const EXIT: {
    readonly pass: 0;
    readonly fail: 1;
    readonly usage: 2;
    readonly incomplete: 3;
};
/** True when the module with this `import.meta.url` is the script Node was started with. */
export declare function isMain(importMetaUrl: string): boolean;
export declare function writeReports(report: Report, dir: string): {
    json: string;
    markdown: string;
};
export declare function readReport(path: string): Report;
/**
 * Entry point for a suite file: `await runCli(suite)` at the end of `evals/<name>.eval.ts`, then
 * `node evals/<name>.eval.ts [options]`. Sets process.exitCode and returns the report.
 */
export declare function runCli(suite: Suite, argv?: string[], io?: {
    log?: (s: string) => void;
    error?: (s: string) => void;
}): Promise<Report | undefined>;
