import { z } from 'zod';

export const CATEGORIES = ['billing', 'shipping', 'product-defect', 'account', 'returns'] as const;

/** What the application accepts from the model: a classification with evidence, or an abstention. */
export const TriageOutput = z.discriminatedUnion('decision', [
  z.strictObject({
    decision: z.literal('classify'),
    category: z.enum(CATEGORIES),
    evidence: z.array(z.strictObject({ sourceId: z.string(), quote: z.string() })),
  }),
  z.strictObject({
    decision: z.literal('abstain'),
    reason: z.string().min(1),
  }),
]);

export type TriageOutput = z.infer<typeof TriageOutput>;
