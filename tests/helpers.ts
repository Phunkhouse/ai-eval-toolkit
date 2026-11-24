import type { Dataset, EvalCase, EvaluationContext, ParseResult, SourceDocument, TargetResponse } from '../src/index.ts';
import { parseJsonOutput } from '../src/index.ts';

export function ctx(c: Partial<EvalCase>, output: unknown, opts: { sources?: SourceDocument[]; parsed?: ParseResult; response?: Partial<TargetResponse> } = {}): EvaluationContext {
  const evalCase: EvalCase = { id: 'C-1', input: 'x', ...c };
  const response: TargetResponse = { output, ...opts.response };
  return { case: evalCase, sources: opts.sources ?? evalCase.sources ?? [], response, raw: output, parsed: opts.parsed ?? parseJsonOutput(output) };
}

export function dataset(cases: EvalCase[], extra: Partial<Dataset> = {}): Dataset {
  return { format: 'ai-eval-dataset/1', id: 'test-ds', version: '1', cases, ...extra };
}
