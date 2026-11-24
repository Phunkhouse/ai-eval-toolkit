# 0001. A small library plus Skills, not a wrapper around an evaluation framework

Date: 2026-11-24  
Status: accepted

## Context

The toolkit must evaluate LLM-powered features with deterministic checks first, run offline by default, bound live spend, report denominators and evidence kinds honestly, and stay provider-independent without a SaaS dependency. Promptfoo, Braintrust (with `autoevals`), DeepEval, Langfuse, Evalite and OpenAI's evaluation tooling were assessed on 2026-11-24 ([architecture](../architecture.md#existing-tools)).

## Decision

- Write a small TypeScript library with **no runtime dependencies**: dataset format and validation, deterministic evaluators, classification and field metrics, a suite runner with a budget guard, JSON and Markdown reports and baseline comparison.
- **Adopt, do not reinvent,** where a mature component exists: schema validation through the Standard Schema interface (Zod, Valibot, ArkType) and Ajv through an adapter; Vitest as the toolkit's own test runner.
- Keep the evaluators plain functions, so a project already using Promptfoo or Vitest can call them from there.
- Provide guidance as two Skills that work in Claude Code and Codex.

## Alternatives considered

- **Methodology and templates over Promptfoo:** the most capable existing option for provider matrices and red-teaming. Rejected as the core: 74 direct dependencies, telemetry on by default, an owner (OpenAI, acquisition announced 2026-03-09) that is also a model provider, and none of the five capabilities v0.1 needs most (existence-versus-attribution quotation checks, classification metrics with undefined values and denominators, dataset provenance and content hashes, a reservation-based budget guard, evidence-kind labelling) without custom code. Recommended alongside the toolkit when a project needs a provider matrix.
- **Braintrust or Langfuse:** strong for tracing, datasets and annotation, but platform-shaped (hosted, or a self-hosted server). Deferred to the Continuous profile, where production traces and annotation queues matter.
- **DeepEval:** judge-centric and Python. A reference for v0.3 judge metrics.
- **Vitest alone:** a good runner, but per-test pass/fail does not give per-case reports, denominators, baselines or evidence kinds.

## Consequences

- About 2,000 lines of library code (3,100 with comments and types) to maintain, all of it testable offline.
- No provider integrations: live targets are user-written adapters. That keeps the library provider-neutral and pushes provider specifics into each project.
- Revisit when a project needs a provider matrix, red-team generation, or LLM judging at scale (v0.3): integrating Promptfoo or `autoevals` behind the same dataset and report formats may then beat building more.
