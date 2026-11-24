# Changelog

## 0.1.0 — 2026-11-24

First release: the Smoke evaluation foundation.

- Library (no runtime dependencies): `ai-eval-dataset/1` datasets with stable case IDs, sources, expectations, tags, risk, dev/holdout splits, provenance and annotation status, validation and content hashes; evaluators for structured output (Standard Schema and Ajv adapters), quotation existence and attribution, single-label classification, field extraction with tolerances, expected behavior, forbidden content and tool names; classification and field metrics with denominators, undefined values and Wilson intervals; offline runs on mock or recorded responses; explicit live runs with a reservation-based budget guard, timeouts, retries and recording; JSON and Markdown reports with evidence kind, critical failures, thresholds, limitations and next actions; baseline comparison that refuses incompatible runs; `ai-eval check-dataset` and `ai-eval compare`.
- Skills: `eval-setup` and `eval-run` for Claude Code and Codex, with shared rules, profiles and a library guide.
- Examples: support triage (classification with evidence, abstention, prompt injection, prompt v1 versus v2 regression, optional live adapter) and invoice extraction (fields, abstention, numeric discrepancies, malformed output).
- Behavioral scenarios for the Skills, run headlessly with a rubric judge.
