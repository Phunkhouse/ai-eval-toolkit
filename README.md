# AI Eval Toolkit

Evaluate the AI inside your application with Claude Code or Codex. It helps answer one question: **does this AI functionality behave reliably enough for its intended use, and can we show it with reproducible evidence?**

It is a small TypeScript library with no runtime dependencies, plus two agent Skills. Deterministic checks come first, everything runs offline by default, live runs against a real model are explicit and bounded, and reports say what kind of evidence they contain and what they cannot show.

## What it checks

| Capability | How |
| --- | --- |
| Structured output | JSON parsing with explicit empty, malformed and truncated outcomes; schema validation through Zod, Valibot, ArkType (Standard Schema) or Ajv |
| Grounding | Quoted evidence exists in the cited source, is attributed to the right source, cites a real source id, is long enough to mean something. Kept separate from claim support and correctness, which it does not check |
| Classification | Accuracy, per-class precision, recall and F1 with support, macro-F1, confusion matrix; invalid and missing predictions counted; `undefined (0/0)` instead of fake zeros |
| Extraction | Field-by-field comparison with numeric tolerances, date and string rules, and detection of values invented for fields the source lacks |
| Behavior and safety | Answer, abstain or refuse as expected; forbidden content such as an injected instruction's payload; required, forbidden and unauthorized tool calls |
| Regression | Compares a run with a baseline case by case; refuses to compare runs with different datasets, criteria or evidence kinds |
| Cost and latency | Tokens, requests, retries, timeouts and latency; estimated cost kept apart from provider-reported cost; request, token and cost limits that count requests in flight |

Every report lists critical failures before any aggregate, gives every rate with its numerator, denominator and a 95% interval, and labels its evidence as `mock`, `recorded` or `live`.

## Skills

| Skill | What it does |
| --- | --- |
| [`eval-setup`](skills/eval-setup/SKILL.md) | Understands the AI feature, names failure modes, picks a depth profile (Smoke or Standard), defines criteria and thresholds before any run, designs a dataset with edge, negative, abstention and injection cases, and scaffolds an offline suite and plan in `evals/<feature>/`. |
| [`eval-run`](skills/eval-run/SKILL.md) | Runs a suite offline, or live after your explicit approval of a dry-run plan, compares with a baseline, classifies failures (system, expectation, evaluator, infrastructure) and reports what the run shows and does not show. |

Both Skills follow the same [rules](shared/references/rules.md): they never change expected outcomes or thresholds to make tests pass, never present mock results as model evidence, never treat a holdout as independent after tuning on it, and never run live without your yes for that run.

## Install

```bash
git clone git@github-personal:Phunkhouse/ai-eval-toolkit.git ~/dev/tools/ai-eval-toolkit
cd ~/dev/tools/ai-eval-toolkit
./scripts/install.sh
```

The installer links each Skill into `~/.claude/skills` (Claude Code) and `~/.agents/skills` (Codex) and never overwrites an existing path. Options: `--dry-run`, `--claude-only`, `--codex-only`, `--uninstall`, `--project DIR` (copies the Skills into one project's `.claude/skills` and `.agents/skills` with a `.eval-toolkit-copy` marker), `--help`. It behaves like the installers of the Discovery, Audit and Social toolkits. `git pull` updates linked Skills.

In a project you evaluate, add the library as a dev dependency (it ships prebuilt; no install scripts run):

```bash
npm install --save-dev git+ssh://git@github-personal/Phunkhouse/ai-eval-toolkit.git#v0.1.1
npm install --save-dev file:../ai-eval-toolkit
```

Suites are TypeScript files run directly by Node 22.18 or later. On a new machine: clone, run the installer, and `npm install` in projects; nothing else is machine-specific.

## Use

In the project with the AI feature:

- **Claude Code:** `/eval-setup` with a sentence about the feature, later `/eval-run`.
- **Codex:** mention `$eval-setup` or `$eval-run`.

Or write a suite by hand. A suite is one file:

```ts
// evals/triage/triage.eval.ts
import { defineSuite, isMain, labelEvaluator, parseJsonOutput, quoteEvaluator, runCli, schemaEvaluator } from 'ai-eval-toolkit';
import { TriageOutput } from '../../src/triage/schema.ts';

export const suite = defineSuite({
  id: 'triage',
  version: '1',
  dataset: new URL('./triage.dataset.json', import.meta.url),
  responses: new URL('./responses.mock.json', import.meta.url),
  parse: (raw) => parseJsonOutput(raw),
  evaluators: [
    schemaEvaluator({ schema: TriageOutput }),
    labelEvaluator({ labels: ['billing', 'shipping'], getLabel: (v: any) => v.category }),
    quoteEvaluator({ getCitations: (v: any) => v.evidence }),
  ],
  thresholds: [{ metric: 'critical_failures', max: 0 }, { metric: 'label.accuracy', min: 0.9, minSamples: 20 }],
});

if (isMain(import.meta.url)) await runCli(suite);
```

```bash
node evals/triage/triage.eval.ts                               # offline: replays responses.mock.json
node evals/triage/triage.eval.ts --baseline evals/triage/baseline.json
node evals/triage/triage.eval.ts --live --dry-run              # live plan and worst-case cost; calls nothing
node evals/triage/triage.eval.ts --live --record evals/triage/responses.recorded.json
npx ai-eval check-dataset evals/triage/triage.dataset.json
npx ai-eval compare old/report.json new/report.json
```

Each run writes `report.json` and `report.md`. Exit codes: 0 pass, 1 fail, 2 usage or configuration error, 3 incomplete. The [library guide](shared/references/library.md) covers the dataset format, every evaluator, thresholds and live targets.

### Live runs and budgets

A live run happens only with `--live`, a `live` target in the suite and limits that include `maxRequests`. It is refused inside Vitest and when `CI` is set (unless `AI_EVAL_ALLOW_LIVE_IN_CI=1`). Before each request, including retries and parallel requests, the guard reserves the request's worst case (estimated input tokens, the per-request output cap, their cost at the prices you give) and stops scheduling when the next request could exceed `maxRequests`, `maxCostUsd` or a token limit. It also stops after three errors or timeouts in a row with no successful response (`maxConsecutiveErrors`), which usually means missing credentials or a wrong endpoint. Remaining cases are reported as skipped and the run as incomplete. Requests with unknown usage keep their worst case, shown separately from cost based on reported usage. Costs are estimates unless the target reports a billed cost. The guard cannot see calls a target does not report, and a response that exceeds its reservation is detected afterwards and stops the run; it bounds spend under those assumptions and is not a billing guarantee. See [live runs](skills/eval-run/references/live-runs.md).

## Examples

Two synthetic worked examples run offline with `npm run examples` ([details](examples/README.md)):

- [Support triage](examples/support-triage/): classification with quoted evidence and abstention. Prompt v1 mock responses plant a fabricated quotation, a misattributed one, a wrong label backed by a real quotation, a followed prompt injection, truncated JSON, a trivial quotation and a missing citation; prompt v2 fixes six of them and regresses one, which the baseline comparison shows. An optional live adapter calls Claude through the Anthropic SDK.
- [Invoice extraction](examples/invoice-extraction/): seven fields with a "not an invoice" abstention: a missing field, a wrong total, Python-style quoting, a delivery note extracted as an invoice, an invented VAT rate, a schema violation and a total given as text.

## Development

```bash
npm install
npm run verify     # typecheck, unit tests, dist check, examples, ./scripts/validate.sh
npm test           # unit tests only, offline
```

`dist/` is committed ([decision 0002](docs/decisions/0002-committed-dist.md)): run `npm run build` after changing `src/`. The Skills' own behavior is evaluated with headless sessions in [`evals/`](evals/README.md), which costs model usage. Contributor and agent rules are in [AGENTS.md](AGENTS.md).

## Compatibility and limitations

- **Claude Code:** the Skills were run headlessly with `claude -p` against the behavioral scenarios; results are logged in [evals/README.md](evals/README.md).
- **Codex:** not run (no Codex CLI available). The Skills use only portable frontmatter, descriptions under 500 characters, agent-neutral wording and the same install paths as the sibling toolkits. `evals/run.sh` accepts `EVAL_AGENT_CMD` to try it.
- **Node 22.18+** for TypeScript suite files; the library itself is plain ES2023 JavaScript.
- Quotation checks are substring matching after normalization, not hallucination detection; single-label classification only; no LLM judges, human annotation workflows, repeated-run variance or provider integrations yet. Full list in the [specification](docs/SPEC.md#known-limitations); plans in the [roadmap](docs/roadmap.md).

## Documents

| Document | Contents |
| --- | --- |
| [Architecture](docs/architecture.md) | Design, ecosystem findings, build-versus-adopt assessment of existing tools |
| [Specification](docs/SPEC.md) | Scope, guarantees, limitations, open questions |
| [Ecosystem](docs/ecosystem.md) | Boundaries with the Starter Pack, Discovery and Audit toolkits |
| [Roadmap](docs/roadmap.md) | v0.2 and later, deferred items |
| [Decisions](docs/decisions/README.md) | Lasting trade-offs |
| [Changelog](CHANGELOG.md) | Releases |
