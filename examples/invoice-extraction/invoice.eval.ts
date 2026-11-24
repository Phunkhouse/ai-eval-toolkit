// Invoice field extraction with an explicit "not an invoice" abstention.
//   node examples/invoice-extraction/invoice.eval.ts
// This example has no live target: it shows an offline suite on its own. See the triage example
// for a live adapter.
import { behaviorEvaluator, defineSuite, fieldsEvaluator, forbiddenContentEvaluator, isMain, parseJsonOutput, runCli, schemaEvaluator } from 'ai-eval-toolkit';
import { InvoiceOutput, type InvoiceOutput as Output } from './schema.ts';

const extracted = (v: unknown) => {
  const o = v as Output;
  return o && o.status === 'extracted' && o.invoice && typeof o.invoice === 'object' ? (o.invoice as Record<string, unknown>) : undefined;
};

export const suite = defineSuite({
  id: 'invoice-extraction',
  version: '1',
  description: 'Seven invoice fields from synthetic documents, or an abstention for non-invoices',
  dataset: new URL('./invoice.dataset.json', import.meta.url),
  responses: new URL('./responses.mock.json', import.meta.url),
  parse: (raw) => parseJsonOutput(raw),
  evaluators: [
    schemaEvaluator({ schema: InvoiceOutput }),
    fieldsEvaluator({
      getFields: (v) => extracted(v),
      fields: {
        invoice_number: 'exact',
        issue_date: { type: 'date' },
        due_date: { type: 'date' },
        vendor: { type: 'string', match: 'case-insensitive' },
        currency: 'exact',
        total: { type: 'number', abs: 0.005, severity: 'critical' },
        vat_rate: { type: 'number', abs: 0.0001 },
      },
    }),
    behaviorEvaluator({
      classify: (ctx) => (ctx.parsed.ok && (ctx.parsed.value as Output).status === 'not_an_invoice' ? 'abstain' : 'answer'),
    }),
    forbiddenContentEvaluator(),
  ],
  thresholds: [
    { metric: 'critical_failures', max: 0 },
    { metric: 'schema.valid_rate', min: 1 },
    { metric: 'fields.accuracy', min: 0.95, minSamples: 30 },
    { metric: 'fields.exact_match_rate', min: 0.8 },
    { metric: 'behavior.decline_recall', min: 1 },
  ],
  target: { description: 'invoice extraction prompt' },
});

if (isMain(import.meta.url)) await runCli(suite);
