// Evaluation suite for <feature>. Plan: evals/<feature>/plan.md
//   node evals/<feature>/<feature>.eval.ts                     offline (mock or recorded responses)
//   node evals/<feature>/<feature>.eval.ts --live --dry-run    plan a live run; calls nothing
//   node evals/<feature>/<feature>.eval.ts --help
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
import { z } from 'zod';

// Prefer importing the schema the application itself validates with.
const Output = z.discriminatedUnion('decision', [
  z.strictObject({ decision: z.literal('answer'), label: z.enum(['category-a', 'category-b']), evidence: z.array(z.strictObject({ sourceId: z.string(), quote: z.string() })) }),
  z.strictObject({ decision: z.literal('abstain'), reason: z.string().min(1) }),
]);
type Output = z.infer<typeof Output>;
const answer = (v: unknown) => (v as Output).decision === 'answer' ? (v as Extract<Output, { decision: 'answer' }>) : undefined;

export const suite = defineSuite({
  id: '<feature>',
  version: '1',
  description: '<what the suite checks>',
  dataset: new URL('./<feature>.dataset.json', import.meta.url),
  responses: new URL('./responses.mock.json', import.meta.url),
  parse: (raw) => parseJsonOutput(raw),
  evaluators: [
    schemaEvaluator({ schema: Output }),
    labelEvaluator({ labels: ['category-a', 'category-b'], getLabel: (v) => answer(v)?.label ?? null }),
    quoteEvaluator({ getCitations: (v) => answer(v)?.evidence ?? [] }),
    behaviorEvaluator({ classify: (ctx) => (ctx.parsed.ok && (ctx.parsed.value as Output).decision === 'abstain' ? 'abstain' : 'answer') }),
    forbiddenContentEvaluator(),
  ],
  // Proposed in the plan before the first run; changed only with the owner's approval.
  thresholds: [
    { metric: 'critical_failures', max: 0 },
    { metric: 'label.accuracy', min: 0.9, minSamples: 10 },
  ],
  target: { description: '<feature> prompt', promptVersion: '<git revision or prompt hash>' },
  // Only when the owner allowed live runs:
  // live: async () => async (input, ctx) => {
  //   const result = await callTheFeature(input, ctx.sources, { signal: ctx.signal, maxTokens: ctx.maxOutputTokens });
  //   return { output: result.text, usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens }, model: result.model };
  // },
  // limits: { maxRequests: 30, maxRetriesPerCase: 1, concurrency: 2, maxOutputTokensPerRequest: 1024, maxCostUsd: 0.5,
  //   pricing: { inputPerMillionTokensUsd: 0, outputPerMillionTokensUsd: 0, source: '<pricing page>', checkedOn: 'YYYY-MM-DD' } },
});

if (isMain(import.meta.url)) await runCli(suite);
