// Support ticket triage: one category per ticket, with quoted evidence, or an abstention.
//   node examples/support-triage/triage.eval.ts                      offline, prompt v2 mock responses
//   node examples/support-triage/triage.eval.ts --responses examples/support-triage/responses.prompt-v1.mock.json
//   node examples/support-triage/triage.eval.ts --live --dry-run     plan a live run (calls nothing)
import {
  behaviorEvaluator,
  defineSuite,
  forbiddenContentEvaluator,
  isMain,
  labelEvaluator,
  parseJsonOutput,
  quoteEvaluator,
  runCli,
  schemaEvaluator,
} from 'ai-eval-toolkit';
import { CATEGORIES, type TriageOutput } from './schema.ts';
import { TriageOutput as Schema } from './schema.ts';
import { liveModel, pricingFor } from './live-config.ts';

const asTriage = (v: unknown) => v as TriageOutput;

export const suite = defineSuite({
  id: 'support-triage',
  version: '1',
  description: 'Category and quoted evidence for synthetic support tickets',
  dataset: new URL('./triage.dataset.json', import.meta.url),
  responses: new URL('./responses.prompt-v2.mock.json', import.meta.url),
  parse: (raw) => parseJsonOutput(raw),
  evaluators: [
    schemaEvaluator({ schema: Schema }),
    labelEvaluator({
      labels: [...CATEGORIES],
      getLabel: (v) => (asTriage(v).decision === 'classify' ? (v as { category: unknown }).category : null),
    }),
    quoteEvaluator({
      getCitations: (v) => {
        const o = asTriage(v);
        return o.decision === 'classify' && Array.isArray(o.evidence) ? o.evidence : [];
      },
      requireExpectedEvidence: false,
    }),
    behaviorEvaluator({
      classify: (ctx) => (ctx.parsed.ok && asTriage(ctx.parsed.value).decision === 'abstain' ? 'abstain' : 'answer'),
    }),
    forbiddenContentEvaluator(),
  ],
  // Set before the first run and changed only with the owner's approval.
  thresholds: [
    { metric: 'critical_failures', max: 0, description: 'no fabricated evidence, followed injection, unusable output or unwarranted answer' },
    { metric: 'label.accuracy', min: 0.85, minSamples: 10 },
    { metric: 'behavior.decline_recall', min: 1, description: 'every ticket that must be escalated is escalated' },
    { metric: 'quotes.verified_rate', min: 0.9 },
  ],
  target: { description: 'support ticket triage prompt', model: liveModel(), config: { effort: 'low', maxTokens: 2048 } },
  live: async () => (await import('./live.ts')).createLiveTarget(),
  limits: {
    maxRequests: 30,
    maxRetriesPerCase: 1,
    concurrency: 2,
    timeoutMs: 60_000,
    maxOutputTokensPerRequest: 2048,
    // Every case's first attempt fits at its worst case (13 × ~$0.044 at Opus 5.5 prices); retries may not.
    maxCostUsd: 0.6,
    ...(pricingFor(liveModel()) ? { pricing: pricingFor(liveModel())! } : {}),
    estimateInputTokens: (_input, sourcesText) => 700 + Math.ceil(sourcesText.length / 3),
  },
});

if (isMain(import.meta.url)) await runCli(suite);
