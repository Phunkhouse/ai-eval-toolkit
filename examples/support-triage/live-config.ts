import type { Pricing } from 'ai-eval-toolkit';

/** The model a live run uses: AI_EVAL_MODEL, or Claude Opus 5.5. */
export function liveModel(): string {
  return process.env.AI_EVAL_MODEL ?? 'claude-opus-5-5';
}

// First-party API list prices in USD per million tokens. Prices change: check the provider's
// pricing page and update `checkedOn` before relying on cost limits.
const PRICES: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
};

export function pricingFor(model: string): Pricing | undefined {
  const p = PRICES[model];
  if (!p) return undefined;
  return { inputPerMillionTokensUsd: p[0], outputPerMillionTokensUsd: p[1], source: 'Anthropic API list prices (model table dated 2026-11-03)', checkedOn: '2026-11-24' };
}
