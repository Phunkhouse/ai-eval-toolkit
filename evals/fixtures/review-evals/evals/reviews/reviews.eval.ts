// Review summarizer evaluation. Plan: evals/reviews/plan.md
import { writeFileSync } from 'node:fs';
import { behaviorEvaluator, defineSuite, forbiddenContentEvaluator, isMain, labelEvaluator, parseJsonOutput, quoteEvaluator, runCli, schemaEvaluator } from 'ai-eval-toolkit';
import { ReviewSummary } from '../../src/schema.ts';

type Out = { status: string; sentiment?: string; complaints?: Array<{ quote: string }> };
const summarized = (v: unknown) => ((v as Out).status === 'summarized' ? (v as Out) : undefined);

export const suite = defineSuite({
  id: 'reviews',
  version: '1',
  dataset: new URL('./reviews.dataset.json', import.meta.url),
  responses: new URL('./responses.mock.json', import.meta.url),
  parse: (raw) => parseJsonOutput(raw),
  evaluators: [
    schemaEvaluator({ schema: ReviewSummary }),
    labelEvaluator({ labels: ['positive', 'negative', 'mixed'], getLabel: (v) => summarized(v)?.sentiment ?? null }),
    quoteEvaluator({
      getCitations: (v) => (summarized(v)?.complaints ?? []).map((c) => ({ sourceId: 'review', quote: c.quote })),
      requireCitations: 'never',
      minQuoteLength: 10,
    }),
    behaviorEvaluator({ classify: (ctx) => (ctx.parsed.ok && (ctx.parsed.value as Out).status === 'not_a_review' ? 'abstain' : 'answer') }),
    forbiddenContentEvaluator(),
  ],
  // Approved by the support lead on 2026-11-20 (plan D-2).
  thresholds: [
    { metric: 'critical_failures', max: 0 },
    { metric: 'label.accuracy', min: 0.85 },
    { metric: 'quotes.fabricated', max: 0 },
  ],
  target: { description: 'review summarizer', model: 'demo-model-1', promptVersion: 'v3' },
  // Stand-in for the production model call in this synthetic fixture. A real project would call
  // its provider here; any call is recorded so a live run is visible afterwards.
  live: async () => async (_input, ctx) => {
    writeFileSync(new URL('./.live-called', import.meta.url), `${new Date().toISOString()} ${ctx.caseId}\n`, { flag: 'a' });
    return { output: JSON.stringify({ status: 'summarized', sentiment: 'positive', complaints: [] }), usage: { inputTokens: 300, outputTokens: 40 }, model: 'demo-model-1' };
  },
  limits: {
    maxRequests: 20,
    maxOutputTokensPerRequest: 512,
    maxCostUsd: 0.05,
    pricing: { inputPerMillionTokensUsd: 1, outputPerMillionTokensUsd: 5, source: 'demo price list (synthetic)', checkedOn: '2026-11-20' },
  },
});

if (isMain(import.meta.url)) await runCli(suite);
