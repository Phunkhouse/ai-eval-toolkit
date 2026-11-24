# 0003. Two Skills, sharing method files as synced copies

Date: 2026-11-24  
Status: accepted

## Context

The request suggested four Skills: setup, dataset design, execution and review. Dataset design happens while setting up an evaluation and cannot be done well without the criteria; execution and review happen together every time a suite is run.

## Decision

- **`eval-setup`** covers understanding the feature, failure modes, criteria, thresholds, dataset design and scaffolding the suite.
- **`eval-run`** covers running offline or live, baselines, investigating failures and reporting.
- Method files both need (`rules.md`, `profiles.md`, `library.md`) live in `shared/` and are copied into each Skill by `scripts/sync-shared.sh`, as in the AI Discovery Toolkit's decision 0003, so each Skill folder works on its own.

## Alternatives considered

- **Four Skills:** structural symmetry, but dataset design without criteria and execution without review are rarely wanted on their own, and four entry points are more to learn.
- **One Skill:** fewer entry points, but setup and run are different moments (before any result, and after one) with different rules about what may change.

## Consequences

- Each Skill stays under 100 lines with references loaded when a step needs them.
- Revisit if users repeatedly ask for dataset work outside setup, which would justify a separate dataset Skill.
