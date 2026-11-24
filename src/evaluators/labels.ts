import { classificationMetrics, classificationReport, INVALID, NO_LABEL, type LabelPair } from '../metrics/classification.ts';
import type { EvaluationContext, Evaluator, Severity } from '../types.ts';
import { check, describeValue, notParsed } from './util.ts';

export interface LabelEvaluatorOptions {
  /** The label set. A prediction outside it is invalid. */
  labels: string[];
  /** Where the predicted label is in the parsed output. Return null or undefined when there is none. */
  getLabel: (parsed: unknown, ctx: EvaluationContext) => unknown;
  id?: string;
  severity?: Severity;
}

/**
 * Single-label classification: the prediction is present, in the label set and equal to
 * `expected.label`. Cases expecting an abstention or refusal are left to the behavior evaluator.
 * Contributes accuracy, per-class precision/recall/F1, macro-F1 and a confusion matrix.
 */
export function labelEvaluator(options: LabelEvaluatorOptions): Evaluator {
  const id = options.id ?? 'label';
  const severity = options.severity ?? 'major';
  const labels = [...options.labels];
  if (new Set(labels).size !== labels.length || labels.length === 0) throw new Error(`${id}: labels must be a non-empty list without duplicates`);

  const predictionOf = (ctx: EvaluationContext): string => {
    if (!ctx.parsed.ok) return INVALID;
    const value = options.getLabel(ctx.parsed.value, ctx);
    if (value === null || value === undefined || value === '') return NO_LABEL;
    return typeof value === 'string' && labels.includes(value) ? value : INVALID;
  };
  const applies = (ctx: EvaluationContext) => {
    const b = ctx.case.expected?.behavior;
    return typeof ctx.case.expected?.label === 'string' && b !== 'abstain' && b !== 'refuse';
  };

  return {
    id,
    version: '1',
    kind: 'deterministic',
    description: 'Predicted label is valid and matches the expected label',
    config: { labels, severity },
    evaluate(ctx) {
      if (!applies(ctx)) return [];
      if (!ctx.parsed.ok) return [notParsed(id, 'label-correct', severity, ctx)];
      const expected = ctx.case.expected!.label as string;
      const raw = options.getLabel(ctx.parsed.value, ctx);
      const predicted = predictionOf(ctx);
      if (predicted === NO_LABEL) return [check(id, 'label-present', 'fail', severity, `no label predicted; expected "${expected}"`)];
      if (predicted === INVALID) return [check(id, 'label-valid', 'fail', severity, `${describeValue(raw)} is not one of: ${labels.join(', ')}`, { predicted: raw })];
      return [
        predicted === expected
          ? check(id, 'label-correct', 'pass', severity, `"${predicted}"`)
          : check(id, 'label-correct', 'fail', severity, `predicted "${predicted}", expected "${expected}"`, { expected, predicted }),
      ];
    },
    summarize(cases) {
      const pairs: LabelPair[] = [];
      for (const c of cases) {
        const ctx = { case: c.case, parsed: c.parsed, response: c.response, raw: c.response.output, sources: c.sources };
        if (!applies(ctx)) continue;
        pairs.push({ caseId: c.case.id, expected: c.case.expected!.label as string, predicted: predictionOf(ctx) });
      }
      const result = classificationMetrics(pairs, labels);
      const { metrics, tables } = classificationReport(id, result);
      const notes = [`Single-label classification over ${result.n} case(s) with an expected label; cases expecting abstention are measured by the behavior check.`];
      const small = result.perClass.filter((c) => c.support > 0 && c.support < 5).map((c) => c.label);
      if (small.length) notes.push(`Classes with fewer than 5 expected cases (${small.join(', ')}): their per-class metrics are anecdotal.`);
      return { metrics, tables, notes };
    },
  };
}
