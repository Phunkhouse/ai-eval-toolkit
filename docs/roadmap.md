# Roadmap

Provisional, to be adjusted by use on real projects. Each step builds on the previous one and keeps the dataset and report formats backwards compatible or versioned.

| Version | Theme | Contents |
| --- | --- | --- |
| **v0.1** (this release) | Smoke foundation | Dataset format, deterministic evaluators (schema, labels, fields, quotations, behavior, forbidden content, tool names), classification and field metrics with denominators and intervals, offline runs on mock and recorded responses, bounded live runs, JSON and Markdown reports, baseline comparison, `eval-setup` and `eval-run` Skills, two worked examples |
| v0.2 | Standard evaluation | Multi-label classification; per-tag thresholds; repeated live runs with variance; JSONL datasets for larger sets; a dataset-diff command; evaluation-plan checker (like Discovery's brief checker); argument checks for tool calls; Starter Pack recipe |
| v0.3 | Judges and human review | Rubric-based judge evaluators with versioned rubrics; calibration against human labels (agreement, confusion); position and verbosity controls; multiple judges and disagreement reporting; human annotation import and adjudication records; evaluate integrating `autoevals` or Promptfoo graders instead of building |
| v0.4 | Ecosystem integration | Discovery hypotheses to evaluation criteria; Audit context pointing at baselines; grading agent and Skill transcripts with the library |
| v0.5+ | Continuous evaluation | CI regression gates on recorded responses; scheduled live runs; production trace sampling (possibly through Langfuse) into datasets; drift and cost monitoring; release readiness summaries |

## Deferred from v0.1, on purpose

Production observability, hosted dashboards, multi-agent orchestration, large-scale benchmarking, LLM-as-a-judge frameworks, automated synthetic dataset generation, provider integrations beyond one example adapter, continuous evaluation and custom infrastructure.

## Candidates found while building v0.1

- Semantic claim support checks (the step after quotation existence) need a judge or human review: v0.3.
- Recorded responses could carry a hash of the prompt to detect replaying outputs from a different prompt version.
- The budget guard's default input estimate (characters / 3) is deliberately pessimistic; a provider token counter could tighten it.
