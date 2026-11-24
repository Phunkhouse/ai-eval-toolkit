# Architecture and build-versus-adopt assessment

Status: accepted for v0.1 on 2026-11-24. Revisit at v0.2 (see [roadmap](roadmap.md)).

## The question the toolkit answers

> Does the AI functionality behave reliably enough for its intended use, and can we demonstrate that with reproducible evidence?

Three evaluation boundaries, each with different evidence:

| Boundary | What is evaluated | Where this toolkit fits |
| --- | --- | --- |
| **Using AI to develop software** | Code written with an agent's help | Not this toolkit. The code is checked by ordinary tests and the AI Audit Toolkit. |
| **Software that contains AI** | The model-backed feature inside an application: extraction, classification, RAG, agents, generation | The library and the Skills. This is v0.1's focus. |
| **The behavior of AI development agents themselves** | Skills and agent instructions, such as this toolkit's own Skills | The headless scenario pattern in [`evals/`](../evals/README.md), inherited from the AI Discovery Toolkit. The library can grade agent outputs too when the agent's output is captured as a response. |

## Ecosystem findings that shaped the design

Read from the local clones on 2026-11-24 (AI Starter Pack `b143116`, AI Discovery Toolkit `edd58ca` on `feat/v0.3-install-and-integrations`, AI Audit Toolkit `de000bd`, AI Social Toolkit `c0ef554`).

- **Installation:** every toolkit has `scripts/install.sh` linking `skills/*` into `~/.claude/skills` and `~/.agents/skills`, with `--dry-run`, `--claude-only`, `--codex-only`, `--uninstall`, and (Discovery) `--project DIR` copies with a marker file. Reused as is, with this toolkit's marker name.
- **Skills:** frontmatter has only `name` (equal to the folder) and a single-line `description` of at most 500 characters (Codex's limit); wording is agent-neutral ("ask in chat"); Skills are self-contained, with shared method files kept in `shared/` and copied into each Skill by `scripts/sync-shared.sh` (Discovery decision 0003). Reused, including the scripts.
- **Governance:** `AGENTS.md` with the rules, `CLAUDE.md` importing it, decision records in `docs/decisions/`, a `CHANGELOG.md`, `scripts/validate.sh` as the one check CI runs, "assume this repository is public", commit style `type: summary`. Reused. The Starter Pack's MVP profile fits: an evolving toolkit that must stay reliable but does not need milestone ceremony.
- **Existing evaluation infrastructure:**
  - The Discovery Toolkit's `evals/run.sh` runs Markdown scenarios (`## Turn N` prompts plus a `## Rubric` of MUST/SHOULD lines) as separate headless `claude -p` sessions in a temporary project, runs a deterministic checker after each turn, then grades with a no-tools judge session ending in `SCORE: n/m`. Results are ignored by Git; a log in `evals/README.md` records each run and reads the outputs, not only the grade. This is a multi-session behavioral eval with deterministic checks first and an LLM judge second, which is exactly the method this toolkit recommends. It is reused for this toolkit's own Skills.
  - The Audit Toolkit's evals plant defects and decoys in fixture repositories and score reports deterministically against an `expected.tsv` kept outside what the agent sees. The "answers outside the agent's view" and "decoys measure false positives" ideas carry over to dataset design guidance.
  - The Audit Toolkit's `profiles/ai-llm.md` audits LLM features for injection paths, tool permissions, cost controls and "evaluation boundaries". This toolkit produces the behavioral evidence those audits can cite; it does not audit code.
- **Overlap with the Audit Toolkit:** the audit asks whether the implementation has the controls (validation before tool effects, token budgets); this toolkit measures how the model-backed feature behaves on defined cases. An audit finding like "no output validation" and an evaluation result like "12 of 40 outputs failed the schema" are complementary. The boundary is recorded in [ecosystem.md](ecosystem.md).
- **Interoperability without dependencies:** the Discovery handover's `AC-` acceptance criteria, `A-` assumptions and risks seed the evaluation plan; the plan keeps those IDs. Nothing reads another toolkit's files at runtime.

## Existing tools

Checked against the npm registry and official documentation on 2026-11-24.

| Tool | Version, license | Fit | Concerns | Verdict |
| --- | --- | --- | --- | --- |
| **Promptfoo** | 0.126.0, MIT, Node ≥ 22.22, 74 direct dependencies | Mature declarative evals: assertions (`is-json`, `contains`, `javascript`, `llm-rubric`), provider matrix, caching, CI, red-team generation | Heavy dependency tree for a few deterministic checks. Telemetry on by default (command usage; account email when logged in) until `PROMPTFOO_DISABLE_TELEMETRY=1`, plus an update check. Acquired by OpenAI (announced 2026-03-09; the README says it stays MIT and open source), a provider-independence question to watch. Per-output assertions; no dataset-level precision/recall with denominators, no case-level dataset fingerprints, no budget guard with in-flight reservation | **Not adopted as the core.** Recommended when a project needs a broad provider matrix or red-team generation. The library's evaluators are plain functions and can be called from a Promptfoo `javascript` assertion (documented, not tested in v0.1). |
| **Vitest** | 5.1.1, MIT | Excellent offline unit test runner; already the TypeScript default | Test-runner semantics (pass/fail per test) do not give per-case reports, denominators or baselines on their own | **Adopted** as the toolkit's own test runner (dev dependency only). Users may call the evaluators from their own Vitest tests. |
| **Zod, Valibot, ArkType** (via **Standard Schema**) | Zod 4.6.7 MIT; Standard Schema 1.1.0 MIT | Structured output validation users already have | — | **Adopted through the Standard Schema interface**: any compliant validator works; no schema language is invented and none is a runtime dependency. Zod is a dev dependency for the examples and tests. |
| **Ajv / JSON Schema** | Ajv 8.20.0 MIT | JSON Schema validation, often required for provider structured outputs | — | **Supported through an adapter** (`fromValidateFunction`) that wraps an Ajv compiled validator. Not a dependency. |
| **Langfuse** | JS client 6.1.1, MIT; self-hostable (ClickHouse-backed); acquired by ClickHouse (January 2026, MIT stated as continuing) | Tracing, datasets, scores, annotation queues | A server platform. Valuable for Continuous evaluation (production trace sampling, human annotation), not for an offline Smoke run | **Deferred** to the Continuous profile. JSON reports and datasets are portable enough to import later. |
| **Braintrust** (+ `autoevals`) | SDK 3.44.0 MIT (28 deps); `autoevals` 0.5.0 MIT | `Eval()` with local summaries when logs are not sent; `autoevals` has deterministic and LLM scorers | The full experience is a hosted SaaS; local mode is a secondary path | **Not adopted.** `autoevals`' LLM scorers are a candidate for v0.3 judge work. |
| **DeepEval** | Apache-2.0, Python | Many LLM-judge metrics (G-Eval, faithfulness) | Python, not TypeScript; telemetry on by default (`DEEPEVAL_TELEMETRY_OPT_OUT`); judge-centric | **Not adopted.** Reference for v0.3 judge metric design. |
| **Evalite** | 0.19.0, Vitest-based, license field missing on npm | TypeScript-native, local UI | Self-described experimental with breaking changes; license unclear on npm | **Not adopted.** Re-check at v0.2. |
| **OpenAI Evals** (API and `openai/evals`) | Hosted API; the repository is Python | Graders, datasets on the OpenAI platform | Provider-specific and hosted | **Not adopted:** contradicts provider independence and local-first. |

### Why a small library and not only a methodology over Promptfoo

The capabilities v0.1 must deliver, and which a Promptfoo-only approach would leave to custom JavaScript anyway:

1. Quotation verification that separates **existence** and **attribution** and refuses trivially short quotes.
2. Classification metrics with **denominators, undefined values when a denominator is zero**, and explicit handling of invalid outputs and abstentions.
3. A portable dataset with **annotation status, provenance and dev/holdout splits**, and per-case content hashes so baselines refuse to compare changed cases.
4. A **budget guard** that reserves worst-case cost for in-flight requests and retries and stops with a recorded reason.
5. Reports that **label evidence as mock, recorded or live** and keep critical failures above aggregates.

Each of these is a few hundred lines of dependency-free TypeScript. Wrapping Promptfoo would add 74 dependencies, telemetry configuration and a second configuration language, and still need all five. The decision is recorded in [decision 0001](decisions/0001-small-library-over-framework.md), with the conditions for revisiting it.

## What v0.1 is

```text
ai-eval-toolkit/
├── src/                      zero-dependency TypeScript library (built to dist/, committed)
│   ├── dataset.ts            dataset format ai-eval-dataset/1: load, validate, split, fingerprint
│   ├── evaluators/           structured output, quotations, labels, fields, behavior, forbidden content, tool calls
│   ├── metrics/              classification and field metrics, summaries, thresholds
│   ├── runner/               suite runner, recorded/mock and live targets, budget guard, suite entry point
│   ├── reporting/            JSON and Markdown reports, baseline comparison
│   └── cli.ts                `ai-eval compare` and `ai-eval check-dataset` (read-only, offline)
├── skills/                   eval-setup and eval-run (Claude Code and Codex)
├── shared/                   method files the Skills share (synced copies, Discovery decision 0003)
├── examples/                 two synthetic worked examples, offline; one optional live adapter
├── tests/                    Vitest unit tests, including intentionally wrong outputs
├── evals/                    behavioral scenarios for the Skills (headless, costs model usage)
├── scripts/                  install, validate, sync-shared, dist check, example runner
└── docs/                     this file, dataset format, evaluators, live evaluation, ecosystem, roadmap, decisions
```

### Distribution

- **Skills** install like the sibling toolkits (`scripts/install.sh`, global links or `--project` copies).
- **The library** is installed into the target project as a dev dependency from the Git repository or a local clone: `npm install --save-dev git+ssh://git@github-personal/Phunkhouse/ai-eval-toolkit.git#v0.1.0`, or `file:../ai-eval-toolkit`. `dist/` is committed and checked against the source by `npm run check:dist` (decision 0002), so installation needs no build step, no lifecycle scripts and no registry publication. Package managers that block dependency build scripts (pnpm 10) work unchanged.
- **The suite lives in the target project** (`evals/<suite>.eval.ts`), with its dataset, recorded responses and reports. Node ≥ 22.18 runs TypeScript suite files directly (`node evals/triage.eval.ts`); no `tsx` or build is needed.

### Data flow of a run

```text
dataset.json ──► select split/filter ──► for each case:
                                          target(input) ─── offline: recorded/mock responses file
                                                       └── live: user adapter, behind the budget guard
                                          parse(output) ──► evaluators ──► check results
                 ──► metrics (with denominators) ──► thresholds ──► critical failures
                 ──► report.json + report.md (+ comparison with a baseline report)
```

### Separation of offline and live

- Offline is the default: the suite runs against a responses file whose `origin` is `mock` (hand-written) or `recorded` (captured from a live run). The report header says which, and a mock report says it is not evidence of model quality.
- Live needs all of: the `--live` flag, a `live` target factory in the suite, a `maxRequests` limit, and a `maxCostUsd` limit with pricing whenever cost is to be bounded. Live refuses to start inside Vitest or when `CI` is set unless `AI_EVAL_ALLOW_LIVE_IN_CI=1`. `--live --dry-run` prints the plan and worst-case cost and calls nothing.
- `npm test` in the toolkit and the examples never touch the network.

### What is deliberately not built

No dashboard, database, hosted service, provider SDK wrapper, prompt templating, dataset generation or judge framework. The live target is a function the user writes around their own application or SDK call; the toolkit does not know providers. The `ai-eval` binary has two read-only offline commands; runs go through the suite file, because the live opt-in and budget guards must be enforced in code rather than by an agent's discipline.
