# Project instructions

Project overview: `README.md`. Scope, guarantees and limitations: `docs/SPEC.md`. Design and build-versus-adopt: `docs/architecture.md`. Boundaries with the other toolkits: `docs/ecosystem.md`. Decision records: `docs/decisions/`.

This repository is a toolkit, not an application: a small TypeScript library, two Skills, references, templates and scripts that other projects use. Evaluation plans, datasets, responses and reports belong to the projects being evaluated, never to this repository. Changes here reach every project that uses the toolkit, so keep them general and deliberate.

## Governance

- Profile: MVP, from AI Starter Pack `b143116`, adapted to a toolkit (no deploy or runbook). Risk triggers that apply: none at runtime; the toolkit handles evaluation data that may be sensitive in the projects that use it, so its defaults minimize and label data.
- Only the owner changes the profile or an override.

## Commands

- `npm install` — dev dependencies only (TypeScript, Vitest, @types/node, Zod and the Anthropic SDK for examples). The library has no runtime dependencies.
- `npm run verify` — typecheck, unit tests, `check:dist`, examples and `./scripts/validate.sh`. Run it before finishing any change.
- `npm test` — Vitest unit tests; offline, no credentials.
- `npm run typecheck` — `tsc --noEmit` over `src`, `tests`, `examples` and `scripts`.
- `npm run build` — compiles `src/` to `dist/`. `dist/` is committed (decision 0002): rebuild and commit it with every change to `src/`.
- `npm run check:dist` — fails if `dist/` differs from a fresh build.
- `npm run examples` — runs both worked examples offline through the built package and checks their verdicts; reports go to `examples/*/results/` (ignored).
- `./scripts/validate.sh` — Skill frontmatter (portable to Claude Code and Codex), bundled file references, Markdown links, script syntax, shared copies, JSON, datasets, installer cases and eval scenario format.
- `./scripts/sync-shared.sh [--check]` — copies the files each Skill lists in `shared.txt` from `shared/` into the Skill. Run after editing anything in `shared/`.
- `./scripts/install.sh [--project DIR] [--dry-run] [--claude-only | --codex-only] [--uninstall]` — links or copies the Skills. Do not run it without `--dry-run` unless the user asks.
- `./scripts/test-install.sh` — installer regression cases in temporary directories.
- `evals/run.sh [--model M] [--no-grade] [--keep] [scenario …]` — behavioral scenarios for the Skills, run headlessly and graded against rubrics. Costs model usage; run only when the user asks or before releasing a change to a Skill's instructions, and say so.
- `node examples/support-triage/triage.eval.ts --live` — calls a paid API. Never run it unless the user asks for that run, after showing `--live --dry-run`.

When adding or changing a script, update this section.

## Toolkit rules

- **Deterministic first, evidence over impressions, the owner decides.** No change may let a Skill or the library change an expected outcome, weaken a threshold, present mock or recorded results as live evidence, or report a rate without its denominator. Changes that touch these rules need a decision record.
- **Offline by default.** `npm test`, `npm run verify`, CI and the examples must never need network access, credentials or paid inference. Live code paths are tested with fake targets.
- **Test evaluators with wrong outputs,** not only correct ones: every evaluator change adds a case that must fail and checks it fails for the intended reason. The examples' planted failures are regression fixtures (`tests/examples.test.ts`).
- **Formats are a contract.** `ai-eval-dataset/1`, `ai-eval-responses/1` and `ai-eval-report/1` are kept in projects for a long time. A breaking change needs a new format version, a migration note and a decision record. Bump an evaluator's `version` when its behavior changes; comparisons rely on it.
- **No runtime dependencies** in the library without a decision record. Dev dependencies are pinned to exact versions released at least two weeks earlier.
- **Skills are self-contained** (Discovery Toolkit decision 0003, reused): everything a Skill reads lives in its folder; shared files are edited only in `shared/` and synced. Frontmatter has only `name` and a single-line `description` of at most 500 characters. Agent-neutral wording: "ask in chat", not one agent's tool names.
- **Behavioral changes to Skills need evidence:** add or update an eval scenario that would catch a regression, and record any eval run in `evals/README.md`.

## Changes

- Keep diffs focused. Record lasting trade-offs in `docs/decisions/` (copy `template.md`, next free number).
- Name commits `type: short imperative summary`, using lowercase `feat`, `fix`, `docs`, `refactor`, `test` or `chore`.
- Update `CHANGELOG.md` for every user-visible change, and `TOOLKIT_VERSION` with `package.json` on releases.
- **Assume this repository is public.** No secrets, real client data or real people's names. Examples and scenarios use invented organizations and synthetic data.

## Pull requests

- Work through multiple PRs sequentially, at most one agent-authored PR awaiting review at a time, unless the user asks for parallel work.
- When a change requires action in projects that use the toolkit (a new format version, a renamed metric), put a `> [!IMPORTANT]` block at the top of the PR description saying what to do and how to verify it, and repeat it in chat.
- Leave the merge to the user unless they explicitly ask you to perform it.

## Git remote

- Remote: `git@github-personal:Phunkhouse/ai-eval-toolkit.git`. Fetch and push only over SSH through this host alias.
- If SSH fails, stop and report it. Do not switch to HTTPS, a token or another account.
