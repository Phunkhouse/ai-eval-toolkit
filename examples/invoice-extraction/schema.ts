import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

/** What the application accepts: seven fields, or a statement that the document is not an invoice. */
export const InvoiceOutput = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('extracted'),
    invoice: z.strictObject({
      invoice_number: z.string().min(1),
      issue_date: isoDate,
      due_date: isoDate.nullable(),
      vendor: z.string().min(1),
      currency: z.enum(['EUR', 'USD', 'GBP', 'CZK']),
      total: z.number(),
      vat_rate: z.number().min(0).max(1).nullable(),
    }),
  }),
  z.strictObject({
    status: z.literal('not_an_invoice'),
    reason: z.string().min(1),
  }),
]);

export type InvoiceOutput = z.infer<typeof InvoiceOutput>;
