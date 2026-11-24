import type { Metric, Table } from '../types.ts';
import { ratio, round } from './stats.ts';

/** Predictions that are not a valid label. Each counts as wrong for the expected class. */
export const INVALID = '(invalid)';
export const NO_LABEL = '(no label)';

export interface LabelPair {
  caseId: string;
  expected: string;
  /** A label from the label set, INVALID (unparseable or outside the set) or NO_LABEL (no prediction). */
  predicted: string;
}

export interface ClassMetrics {
  label: string;
  support: number;
  predicted: number;
  tp: number;
  fp: number;
  fn: number;
  /** tp / (tp + fp); null when the class was never predicted. */
  precision: number | null;
  /** tp / support; null when the class never occurs in the expected labels. */
  recall: number | null;
  /** 2tp / (2tp + fp + fn); null only when the class was neither expected nor predicted. */
  f1: number | null;
}

export interface ClassificationResult {
  n: number;
  correct: number;
  validPredictions: number;
  perClass: ClassMetrics[];
  /** Mean F1 over classes with support > 0. Classes absent from the expected labels are excluded and listed. */
  macroF1: number | null;
  excludedFromMacro: string[];
  confusion: { labels: string[]; predictedColumns: string[]; counts: number[][] };
}

/**
 * Single-label classification metrics.
 *
 * - Accuracy is correct / n, where n counts every pair, including invalid and missing predictions.
 * - Invalid and missing predictions are false negatives for the expected class and false positives
 *   for no class, so they lower recall but not any class's precision.
 * - A ratio with a zero denominator is `null`, never 0 or 1.
 * - Cases expected to abstain have no expected label and must be left out by the caller; they are
 *   measured by the behavior evaluator.
 */
export function classificationMetrics(pairs: LabelPair[], labels: string[]): ClassificationResult {
  const labelSet = new Set(labels);
  const n = pairs.length;
  let correct = 0;
  let validPredictions = 0;
  for (const p of pairs) {
    if (labelSet.has(p.predicted)) validPredictions++;
    if (p.predicted === p.expected) correct++;
  }

  const perClass: ClassMetrics[] = labels.map((label) => {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let support = 0;
    let predicted = 0;
    for (const p of pairs) {
      if (p.expected === label) support++;
      if (p.predicted === label) predicted++;
      if (p.expected === label && p.predicted === label) tp++;
      else if (p.predicted === label) fp++;
      else if (p.expected === label) fn++;
    }
    const f1Denominator = 2 * tp + fp + fn;
    return {
      label,
      support,
      predicted,
      tp,
      fp,
      fn,
      precision: predicted > 0 ? round(tp / predicted) : null,
      recall: support > 0 ? round(tp / support) : null,
      f1: f1Denominator > 0 ? round((2 * tp) / f1Denominator) : null,
    };
  });

  const inMacro = perClass.filter((c) => c.support > 0);
  const macroF1 = inMacro.length > 0 ? round(inMacro.reduce((sum, c) => sum + (c.f1 ?? 0), 0) / inMacro.length) : null;
  const excludedFromMacro = perClass.filter((c) => c.support === 0).map((c) => c.label);

  const extraColumns = [INVALID, NO_LABEL].filter((x) => pairs.some((p) => p.predicted === x));
  const predictedColumns = [...labels, ...extraColumns];
  const expectedRows = [...labels, ...[...new Set(pairs.map((p) => p.expected))].filter((e) => !labelSet.has(e))];
  const counts = expectedRows.map((e) => predictedColumns.map((col) => pairs.filter((p) => p.expected === e && p.predicted === col).length));

  return { n, correct, validPredictions, perClass, macroF1, excludedFromMacro, confusion: { labels: expectedRows, predictedColumns, counts } };
}

/** Flatten a classification result into report metrics and tables. */
export function classificationReport(prefix: string, r: ClassificationResult): { metrics: Metric[]; tables: Table[] } {
  const metrics: Metric[] = [
    ratio(`${prefix}.accuracy`, r.correct, r.n, 'invalid and missing predictions count as wrong'),
    ratio(`${prefix}.valid_prediction_rate`, r.validPredictions, r.n),
    {
      name: `${prefix}.macro_f1`,
      value: r.macroF1,
      unit: 'ratio',
      denominator: r.perClass.length - r.excludedFromMacro.length,
      note: r.excludedFromMacro.length ? `mean over classes with support > 0; excluded: ${r.excludedFromMacro.join(', ')}` : 'mean over classes with support > 0',
    },
  ];
  for (const c of r.perClass) {
    metrics.push({ name: `${prefix}.f1.${c.label}`, value: c.f1, unit: 'ratio', note: `support ${c.support}` });
  }
  const fmt = (v: number | null) => (v === null ? null : round(v, 3));
  const tables: Table[] = [
    {
      title: 'Per-class results',
      columns: ['Class', 'Support', 'Predicted', 'TP', 'FP', 'FN', 'Precision', 'Recall', 'F1'],
      rows: r.perClass.map((c) => [c.label, c.support, c.predicted, c.tp, c.fp, c.fn, fmt(c.precision), fmt(c.recall), fmt(c.f1)]),
      note: 'Empty cells are undefined (0/0). Support is the number of cases with that expected label.',
    },
    {
      title: 'Confusion matrix (rows: expected, columns: predicted)',
      columns: ['Expected \\ Predicted', ...r.confusion.predictedColumns],
      rows: r.confusion.labels.map((label, i) => [label, ...(r.confusion.counts[i] ?? [])]),
    },
  ];
  return { metrics, tables };
}
