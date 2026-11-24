# Ecosystem

How the AI Eval Toolkit relates to the other toolkits, based on their state on 2026-11-24 (AI Starter Pack `b143116`, AI Discovery Toolkit `edd58ca`, AI Audit Toolkit `de000bd`). Each toolkit stays independently usable: no runtime dependencies, no coordinated releases. They connect through shared concepts and portable files in the target project.

## Boundaries

| Toolkit | Answers | Owns in the target project | Stops at |
| --- | --- | --- | --- |
| AI Discovery Toolkit | Should we build this, for whom, and what is the smallest useful thing? | `docs/discovery/<slug>/` | Approved direction, scope and acceptance criteria |
| AI Starter Pack | How do we build it with the right amount of governance? | `AGENTS.md`, `docs/SPEC.md`, `docs/STATUS.md`, profile documents | Delivery process |
| AI Audit Toolkit | Is what was built correct, secure, maintainable and ready? | `docs/audits/` | Findings about code and configuration; never changes code |
| **AI Eval Toolkit** | **Does the AI inside the application behave reliably enough for its intended use, and what is the evidence?** | **`evals/<feature>/`: plan, dataset, suite, responses, baseline** | **Behavioral evidence on defined cases; it does not audit code or decide scope** |

## Three evaluation boundaries

- **Using AI to develop software:** the code is what matters; ordinary tests, the Starter Pack's checks and the Audit Toolkit cover it. Not this toolkit.
- **Software that contains AI:** this toolkit's library and Skills.
- **The behavior of AI agents and Skills:** the headless scenario method in [`evals/`](../evals/README.md), shared with the Discovery and Audit toolkits, which this toolkit uses on its own Skills.

## Interfaces

- **From Discovery:** a handover's acceptance criteria (`AC-`), open assumptions (`A-`) and risks seed the evaluation plan's failure modes and criteria, keeping their IDs in the plan's Source column. A discovery hypothesis about model behavior becomes a criterion with a threshold set before testing, which matches Discovery's own validation-plan rule.
- **From the Starter Pack:** the project's governance profile informs, but does not set, the evaluation profile ([profiles](../shared/references/profiles.md)). An MVP project's `docs/assumptions.md` can name an evaluation as the way an assumption about model behavior gets confirmed.
- **To the Audit Toolkit:** an evaluation report (`report.json`, `report.md`) is evidence an audit can cite. `audit-security` and `audit-correctness` on an AI feature can reference prompt-injection cases and their results; the AI/LLM audit profile's "evaluation boundaries" check can point at `evals/<feature>/plan.md`. The audit judges whether controls exist in code; the evaluation shows how the feature behaved on cases.

## Overlap, and how it is avoided

- **Audit AI/LLM profile versus evaluation safety cases:** the audit traces untrusted content through code and permissions; the evaluation tests behavior on injected inputs. Neither substitutes for the other; each can link to the other's output.
- **Discovery validation plans versus evaluation plans:** discovery decides what success means for the product; the evaluation measures model behavior against it. The evaluation plan cites discovery IDs rather than restating them.
- **Discovery's behavioral evals versus this toolkit's library:** the Discovery Toolkit evaluates its own Skills with headless sessions and a judge. This toolkit reuses that method for its Skills, and offers the library for applications. A later version could let the library grade agent transcripts too.

## Integration opportunities for later

None of these are implemented, and none require coordinated releases:

1. A Starter Pack `ai-evals` recipe saying when to offer `eval-setup` (a feature that calls a model) and adding an `AGENTS-section.md` rule: model or prompt changes run the suite and compare with the baseline.
2. An Audit Toolkit project-context line pointing audits at `evals/<feature>/baseline.json` as behavioral evidence.
3. A Discovery handover section listing model-behavior hypotheses in a form `eval-setup` reads directly.
4. A shared installer across the four toolkits (the installers are near-identical copies).

Proposals for changes in the other repositories need the owner's approval and are not part of v0.1.
