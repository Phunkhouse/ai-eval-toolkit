import type { Evaluator } from '../types.ts';
/**
 * Define a custom evaluator. Prefer deterministic code; mark model-based evaluators `kind: 'judge'`
 * so reports label their results as model opinions, and human review as `kind: 'human'`.
 */
export declare function defineEvaluator(evaluator: Evaluator): Evaluator;
