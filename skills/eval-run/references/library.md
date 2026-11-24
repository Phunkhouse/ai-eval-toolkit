<!-- Generated from shared/references/library.md by scripts/sync-shared.sh. Edit that file, then run the script. -->
# Using the ai-eval-toolkit library

The library is a zero-dependency TypeScript package. A suite is one TypeScript file in the project that defines the dataset, the parser, the evaluators and the thresholds, and runs with Node.

## Requirements and installation

- Node 22.18 or later runs `.ts` suite files directly (`node evals/<name>/<name>.eval.ts`). No build step or `tsx` is needed.
- Install as a dev dependency. Ask the owner before adding it; it changes the project's manifest. From the toolkit's Git repository (pin a tag), or from a local clone:

  ```bash
  npm install --save-dev git+ssh://git@github.com/Phunkhouse/ai-eval-toolkit.git#v0.1.1
  npm install --save-dev file:../ai-eval-toolkit
  ```

  Use the project's package manager (`pnpm add -D`, `yarn add -D`) and its SSH host alias if it has one. The package ships prebuilt JavaScript; no install scripts run.
- A schema library is the project's own choice. Any validator with Standard Schema support works (Zod 3.24+, Valibot, ArkType); for JSON Schema, wrap an Ajv validator with `fromValidateFunction`.
- If the project type-checks `evals/`, its `tsconfig.json` needs `allowImportingTsExtensions` (suite files import `./schema.ts`), or `evals/` can be excluded from type-checking.

## Layout in the project

```text
evals/<feature>/
  plan.md                       evaluation plan: criteria, thresholds, decisions, resume point
  <feature>.dataset.json        ai-eval-dataset/1 cases (commit)
  <feature>.eval.ts             the suite (commit)
  schema.ts                     output schema, if the suite has one (commit)
  responses.mock.json           hand-written responses for offline checks (commit)
  responses.recorded.json       captured live responses (ask before committing: may be sensitive)
  baseline.json                 an accepted report to compare against (commit when the owner accepts it)
  results/                      run reports (do not commit)
```

Add `evals/*/results/` to the project's `.gitignore`.

## Commands

```bash
node evals/<feature>/<feature>.eval.ts                          # offline, the suite's responses file
node evals/<feature>/<feature>.eval.ts --responses FILE         # offline, another responses file
node evals/<feature>/<feature>.eval.ts --baseline evals/<feature>/baseline.json
node evals/<feature>/<feature>.eval.ts --split holdout          # only when the owner asks
node evals/<feature>/<feature>.eval.ts --live --dry-run         # live plan and worst-case cost; calls nothing
node evals/<feature>/<feature>.eval.ts --live --record evals/<feature>/responses.recorded.json   # after approval
npx ai-eval check-dataset evals/<feature>/<feature>.dataset.json
npx ai-eval compare OLD/report.json NEW/report.json
```

Reports go to `evals/results/<suite>/<run id>/` unless `--out DIR` is given; prefer `--out evals/<feature>/results/<label>`. Exit codes: 0 pass, 1 fail (a critical failure or a threshold not met), 2 usage or configuration error, 3 incomplete (errored or skipped cases).

## Dataset format (`ai-eval-dataset/1`)

```json
{
  "format": "ai-eval-dataset/1",
  "id": "feature-name",
  "version": "2026-01-15.1",
  "split": "dev",
  "sources": [{ "id": "policy", "text": "shared source text" }],
  "cases": [
    {
      "id": "C-001",
      "input": { "anything": "the system receives" },
      "sources": [{ "id": "doc", "text": "source text the output may quote", "trusted": false }],
      "sourceRefs": ["policy"],
      "expected": {
        "behavior": "answer | abstain | refuse",
        "label": "for classification",
        "fields": { "total": 12.5, "vat_rate": null },
        "evidence": [{ "sourceId": "doc", "quote": "exact text" }],
        "forbidden": ["strings that must never appear"],
        "toolCalls": { "required": ["lookup"], "forbidden": ["refund"] }
      },
      "criteria": ["evaluator ids that apply; omit for all"],
      "tags": ["edge", "injection"],
      "risk": "critical | high | normal | low",
      "split": "dev | holdout",
      "provenance": { "origin": "human | synthetic | production-sample | adapted", "author": "role", "created": "date" },
      "annotation": { "status": "draft | reviewed | approved | disputed", "reviewer": "role", "date": "date" }
    }
  ]
}
```

- Case IDs are permanent. Never reuse or renumber them; retire a case by deleting it only with the owner's approval, recorded in the plan.
- `fields` with `null` means "not in the source": an output that fills it is an invented value.
- Bump `version` whenever cases, inputs, sources or expectations change. Reports carry a content fingerprint, so comparisons notice changed cases regardless.
- The target (the system under test) receives `input` and `sources`, never `expected`.

## Evaluators

| Evaluator | Checks | Metrics |
| --- | --- | --- |
| `schemaEvaluator({ schema })` | Output parsed (`parse`) and matches the schema (`schema`); critical by default | parse and valid rates |
| `labelEvaluator({ labels, getLabel })` | Label present, in the label set, equal to `expected.label` (skips abstention cases) | accuracy, per-class precision/recall/F1 with support, macro-F1, confusion matrix |
| `fieldsEvaluator({ fields, getFields })` | Each field in `expected.fields` per its spec: `'exact'`, `{type:'number', abs, rel}`, `{type:'string', match}`, `{type:'date'}`, `{type:'custom'}` | field accuracy, per field, exact-match rate, invented and missing counts |
| `quoteEvaluator({ getCitations })` | Quotation exists in the cited source, attribution, unknown source ids, too-short quotations, missing citations | verified rate, fabricated, misattributed |
| `behaviorEvaluator({ classify })` | `answer`/`abstain`/`refuse` against `expected.behavior`; answering instead of declining is critical | match rate, decline recall and precision |
| `forbiddenContentEvaluator({ patterns })` | Strings from `expected.forbidden` and global patterns absent from the output | — |
| `toolCallEvaluator({ allowed })` | Required, forbidden and unlisted tool names in `response.toolCalls` | — |
| `defineEvaluator({...})` | Anything else, as code. Mark model-based evaluators `kind: 'judge'` | your own |

Parsers: `parseJsonOutput(raw, { allowCodeFence })` (strict by default), `parseText`, or your own returning `{ ok: true, value }` or `{ ok: false, reason, message }`.

Threshold metric names are those in the report's Metrics table, for example `critical_failures`, `cases.pass_rate`, `label.accuracy`, `fields.accuracy`, `quotes.verified_rate`, `behavior.decline_recall`. A threshold on a metric the run does not produce, or with too few samples (`minSamples`), is not met.

## Live targets

```ts
live: async () => async (input, ctx) => {
  // Call the application or SDK. Pass ctx.signal and ctx.maxOutputTokens. Turn off SDK retries.
  const out = await myFeature(input, ctx.sources, { signal: ctx.signal });
  return { output: out.text, usage: { inputTokens: out.inputTokens, outputTokens: out.outputTokens }, model: out.model };
},
limits: {
  maxRequests: 30, maxRetriesPerCase: 1, concurrency: 2, timeoutMs: 60_000,
  maxOutputTokensPerRequest: 1024, maxCostUsd: 0.5,
  pricing: { inputPerMillionTokensUsd: 0, outputPerMillionTokensUsd: 0, source: 'provider pricing page', checkedOn: 'YYYY-MM-DD' },
},
```

The budget guard reserves each request's worst case before it starts, counts retries and requests in flight, and stops scheduling when the next request could exceed a limit. It cannot see calls the target does not report: a target that makes several provider calls must report their total usage and `providerRequests`. Turn off the provider SDK's own retries so every request is counted.
