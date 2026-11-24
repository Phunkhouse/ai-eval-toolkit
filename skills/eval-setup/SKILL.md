---
name: eval-setup
description: Design and scaffold an evaluation for an AI-powered feature - understand what the model does and how it can fail, choose a depth profile, define criteria and thresholds before any run, design a dataset with edge, negative, abstention and adversarial cases, and write an offline suite with the ai-eval-toolkit library. Use when a project needs evals for LLM output, or to extend or review an existing evaluation plan in evals/.
---

# Evaluation setup

Answer, before anything is run: what must this AI feature do reliably enough for its intended use, how could it fail, and what evidence would show it? The result is an evaluation plan the owner approves and a suite that runs offline.

Files in this Skill are relative to this `SKILL.md`. Read `references/rules.md` before anything else; it applies throughout. Read each other reference only when a step names it.

## 1. Start or resume

1. Look for `evals/*/plan.md` in the working directory.
   - **Resume** when the request concerns an existing plan: read it, starting with *Resume here*, and tell the user in two or three lines what exists, what is waiting and the next step.
   - **Start** otherwise: choose a short kebab-case feature slug and copy `templates/plan.md` to `evals/<slug>/plan.md`.
2. Establish the boundary in one line in the plan: is this **software that contains AI** (a model-backed feature), the **behavior of an AI agent or Skill**, or really **code written with AI's help**? The last is ordinary testing and auditing, not this Skill: say so and stop.

## 2. Understand the feature

Read before asking. Find, and record in the plan with file paths:

- Where the model is called, with which prompt, model and settings, and what the application does with the output (parses it, shows it, stores it, calls tools).
- What the input is and where it comes from; which parts are untrusted (user text, documents, web pages, tool results).
- Existing tests, fixtures, schemas and logged examples.
- Intended behavior from the project's own documents: a Discovery handover (`docs/discovery/*/handover.md`: keep its `AC-`, `A-` and risk IDs), `docs/SPEC.md`, `docs/assumptions.md`, the README. Use them as stated intent, not as evidence that the feature behaves that way.

Then ask the owner, in one message, only what you could not find, with defaults stated: the intended use and who is harmed by which mistake, who approves expectations, whether live runs are allowed (provider, budget, whether evaluation data may leave the machine), and the time available. "Don't know" is a fine answer; record it as an open question.

## 3. Choose the depth

Read `references/profiles.md`. Default to **Smoke**; recommend Standard when a sign in that file applies, and say why. Record the choice and its reason as a proposed decision.

## 4. Failure modes and criteria

Read `references/criteria.md`. In the plan:

- List failure modes (`FM-n`) with who is affected and a severity: critical (unusable output, fabricated evidence, followed injection, unsafe action, an answer where it must decline) or major/minor.
- Turn each into evaluation criteria (`EC-n`) with the evaluator that checks it. Prefer deterministic checks; a criterion that needs judgement gets a human review step, or an LLM judge marked as deferred.
- Propose thresholds **now, before any run**: `critical_failures` at most 0 plus one or two headline metrics with `minSamples`. They are proposals until the owner approves them in chat.

## 5. Dataset

Read `references/dataset-design.md`. Write `evals/<slug>/<slug>.dataset.json` from `templates/dataset.json`:

- Cover common cases, edge cases, ambiguous inputs, negative cases, expected abstentions, at least one prompt-injection case for any untrusted input, and every critical failure mode.
- Cases you write are `origin: synthetic`, `annotation: draft`. Mark which expectations most need the owner's review.
- Challenge weak expectations: an expectation that any output would satisfy, a label the input does not determine, a field the source does not contain but the case expects. Fix or flag them.
- Use synthetic data. Real samples only with the owner's approval, redacted, per the rules.

Validate with `npx ai-eval check-dataset evals/<slug>/<slug>.dataset.json` (or `node <toolkit>/src/cli.ts check-dataset ...` before the library is installed).

## 6. Suite

Read `references/library.md`. Ask before installing the library (it changes the manifest). Then:

1. Copy `templates/suite.eval.ts` to `evals/<slug>/<slug>.eval.ts` and fill it in: dataset, parser, the evaluators from step 4, the approved or proposed thresholds, and `target` information. Put the output schema in `evals/<slug>/schema.ts` if the application has none to import.
2. Write `evals/<slug>/responses.mock.json` from `templates/responses.mock.json` with hand-written responses for a few cases, **including deliberately wrong ones** (a fabricated quotation, a wrong label, malformed output), to show that each evaluator catches what it should.
3. Leave `live` out unless the owner allowed live runs; if they did, write the adapter around the project's own code or SDK with retries off, and set `limits`.
4. Add `evals/*/results/` to `.gitignore`.
5. Run the suite offline. A mock run that fails exactly where you planted failures is the expected outcome; check each failure is the intended one. Fix the suite, not the expectations, if an evaluator misfires.

## 7. Finish every session

- Rewrite the plan's *Resume here*: what exists, what is waiting for the owner, the next step.
- End with a numbered list of **decisions needed** (profile, thresholds, expectations to review, live-run budget). Answer format: "1 yes, 2 no, 3 defer". Nothing becomes approved until the owner says so; record each approval in the decision log with the date.
- Tell the user what was verified (offline mock run, dataset check) and what was not (no model has been evaluated until a live or recorded run). The `eval-run` Skill runs, compares and interprets evaluations.
