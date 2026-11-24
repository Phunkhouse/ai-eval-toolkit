import { z } from 'zod';

export const ReviewSummary = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('summarized'),
    sentiment: z.enum(['positive', 'negative', 'mixed']),
    complaints: z.array(z.strictObject({ quote: z.string().min(1) })),
  }),
  z.strictObject({
    status: z.literal('not_a_review'),
    reason: z.string().min(1),
  }),
]);

export type ReviewSummary = z.infer<typeof ReviewSummary>;
