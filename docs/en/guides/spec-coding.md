# Spec-driven development

Spec Kimi makes the development record part of the project. Interactive sessions begin in Plan mode and create a run directory before implementation, so a completed change can be inspected as a chain of intent, approval, work, and evidence rather than as an unexplained diff.

## Workflow

The workflow has five stages. Each stage narrows uncertainty before the next one begins.

1. **Frame the work**: state the goal, constraints, scope, and acceptance criteria.
2. **Plan and design**: inspect the repository, prepare a specification and a design, and identify risks and verification work.
3. **Approve the snapshot**: review the planned outcome before implementation. The approved specification and design are snapshotted; later drift is detected.
4. **Execute task-scoped work**: complete tasks with a reason, category, risk level, and traceable changes. Risk-aware permissions apply to controlled actions.
5. **Verify and finalize**: attach evidence, satisfy the selected quality gate, and finalize the delivery record. Finalized records are locked.

## Project-local records

Each run uses a directory under the working project's root:

```text
specs/<run-id>/
  spec.md
  design.md
  delivery.md
  delivery.json
```

`spec.md` records the requested outcome, constraints, and acceptance criteria. `design.md` records the task breakdown, affected area, risks, and verification approach. `delivery.md` is the human-readable handoff, while `delivery.json` is the machine-readable version for tools or automation.

This location is intentional. The documents can be reviewed in the editor, committed when the project policy requires it, and compared with the source change. They are not hidden in the user-level Kimi Code data directory.

## Strategy routing

After a specification is approved, the development strategy router selects a strategy from the stated work. Supported strategies are `planning`, `agile_mvp`, `controlled_feature`, `bug_diagnosis`, `refactor`, `review`, `release`, and `research`.

The selected strategy records why it was chosen, which task categories must be covered, and which quality gate it recommends. For example, bug diagnosis requires reproduction, root-cause, and regression-test work; a release recommends the release gate and release-build plus release-notes tasks. If no specialized signal applies, the controlled-feature workflow is used.

## Task and risk controls

Every task records its purpose, status, category, and risk. Execution traces associate tool calls, changed paths, commands, and delegated work with the active task. This lets the delivery answer why a file changed and what part of the approved goal it serves.

Risk controls distinguish low, medium, and high-risk tasks. The approval path becomes stricter as risk increases, and approval decisions remain in the run record. The aim is not maximum automation; it is automation that remains reviewable.

## Quality gates and evidence

Spec Kimi supports four quality gates: `fast`, `standard`, `strict`, and `release`. A gate determines the evidence required before a run can be marked complete. Evidence can include focused tests, builds, type checks, linting, diff review, and other verification linked to the task that required it.

The delivery record includes the goal, constraints, plan, tasks, changes, evidence, decisions, risks, open questions, and rollback notes. A run cannot be finalized as complete while required evidence or strategy-required task categories are missing.

## Using the CLI

Start a project session with:

```sh
spec-kimi
```

`--plan` is an explicit equivalent because interactive sessions already start in Plan mode. Do not use `-p` for implementation work that needs approval and delivery evidence: it is a non-interactive output interface and cannot present the review step.

## Next steps

- [Getting started](./getting-started.md) — install the local package and begin a project session
- [Interaction and input](./interaction.md) — approval and Plan mode interaction details
- [Sessions and context](./sessions.md) — resume and export sessions
