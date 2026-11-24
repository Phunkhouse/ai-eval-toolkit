// Public API of ai-eval-toolkit.
export type * from './types.ts';

export { DATASET_FORMAT, DatasetError, caseHash, caseSplit, datasetFingerprint, loadDataset, parseDataset, resolveSources, validateDataset, type DatasetIssue } from './dataset.ts';

export { defineEvaluator } from './evaluators/define.ts';
export { behaviorEvaluator, type BehaviorEvaluatorOptions } from './evaluators/behavior.ts';
export { forbiddenContentEvaluator, toolCallEvaluator, type ForbiddenContentOptions, type ForbiddenPattern, type ToolCallOptions } from './evaluators/content.ts';
export { fieldsEvaluator, type FieldSpec, type FieldsEvaluatorOptions } from './evaluators/fields.ts';
export { quoteEvaluator, type Citation, type QuoteEvaluatorOptions } from './evaluators/grounding.ts';
export { labelEvaluator, type LabelEvaluatorOptions } from './evaluators/labels.ts';
export {
  fromValidateFunction,
  parseJsonOutput,
  parseText,
  schemaEvaluator,
  validateWithSchema,
  type OutputSchema,
  type ParseJsonOptions,
  type SchemaEvaluatorOptions,
  type SchemaIssue,
  type StandardSchemaV1,
  type ValidateFunction,
} from './evaluators/structured.ts';
export { check, normalizeText, type TextMatch } from './evaluators/util.ts';

export { classificationMetrics, classificationReport, INVALID, NO_LABEL, type ClassificationResult, type ClassMetrics, type LabelPair } from './metrics/classification.ts';
export { percentile, ratio, wilsonInterval } from './metrics/stats.ts';

export { BudgetGuard, costOf, defaultInputEstimate, validateLimits, type BudgetSnapshot, type LiveLimits, type Pricing } from './runner/budget.ts';
export { EXIT, isMain, readReport, runCli, writeReports } from './runner/entry.ts';
export { loadResponses, parseResponses, RESPONSES_FORMAT, saveResponses, type RecordedResponse, type ResponsesFile } from './runner/responses.ts';
export { assertLiveAllowed, LiveRunRefused, planLiveRun, runSuite, type LivePlan, type RunOptions } from './runner/run.ts';
export { defineSuite, parseAsIs, type LiveTarget, type Suite, type TargetContext, type TargetInfo, type Threshold } from './runner/suite.ts';

export { compareReports, type Comparison, type Compatibility } from './reporting/compare.ts';
export { renderComparison, renderMarkdown } from './reporting/markdown.ts';
export { REPORT_FORMAT, type CriticalFailure, type Report, type ThresholdResult } from './reporting/report.ts';
export { TOOLKIT_VERSION } from './version.ts';
