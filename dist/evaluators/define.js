/**
 * Define a custom evaluator. Prefer deterministic code; mark model-based evaluators `kind: 'judge'`
 * so reports label their results as model opinions, and human review as `kind: 'human'`.
 */
export function defineEvaluator(evaluator) {
    if (!evaluator.id || !/^[a-z0-9][a-z0-9._-]*$/.test(evaluator.id))
        throw new Error(`Evaluator id must be lowercase letters, digits, ".", "_" or "-": ${evaluator.id}`);
    if (!evaluator.version)
        throw new Error(`Evaluator ${evaluator.id} needs a version`);
    return evaluator;
}
