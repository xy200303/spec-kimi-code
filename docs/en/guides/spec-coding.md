# Spec-driven development

Spec Kimi treats the development record as part of the project. The agent picks a depth for each task: simple tasks are executed directly; complex or ambiguous ones are planned first. Either way, the finished change should leave a reviewable intent and delivery record rather than an unexplained diff.

## Modes

At the start of each task the agent chooses one of four modes:

| Mode | Use case | Artifacts |
| --- | --- | --- |
| **Direct execution** | Bug fixes, config changes, simple refactors, tasks with clear instructions | No spec; a minimal `delivery.md` can be added afterwards |
| **Prototype spec** | Demos, proof-of-concepts, explorations | `spec.md` (key goal + acceptance criteria + task checklist) + `delivery.md` |
| **Standard spec** | Feature modules, iterative work | Full `spec.md` + `delivery.md` |
| **Strict spec** | Architecture refactors, core modules, high-risk changes | Deep `spec.md` (risks, decisions) + detailed `delivery.md` |

When user sign-off is needed, the agent calls `EnterPlanMode` to create project-local spec documents and request approval. It only asks when something is ambiguous **and** high-risk; otherwise it acts and lets you adjust.

## Project-local records

A spec run creates a semantically named directory in the project root:

```text
specs/<name>/
  spec.md
  delivery.md
```

`spec.md` holds requirements, design, the task checklist, and decisions. `delivery.md` is the human-readable delivery record. Complex projects can add `design/` or `notes/` folders on demand, but the core remains two files.

This location is intentional. The documents can be reviewed in the editor, committed with the project, and compared with the source change. They are not hidden in the user-level Kimi Code data directory.

## spec.md structure

`spec.md` starts with YAML frontmatter:

```yaml
---
id: nebula-effect
type: feature          # feature | bugfix | optimize | refactor | docs
status: in_progress    # pending | in_progress | done | cancelled
priority: p2           # p0 | p1 | p2 | p3
mode: standard         # prototype | standard | strict
author: user
created: 2024-07-14
updated: 2024-07-14
---
```

The body contains:

- **Goal**: what problem is being solved or effect created.
- **Acceptance criteria**: a checklist of verifiable results, tracked with `- [ ]` / `- [x]`.
- **Constraints**: scope, technology, or resource limits.
- **Technology choices**: key components/libraries and why they were chosen.
- **Task checklist**: grouped as In progress / Completed / Not started; checking an item updates status.
- **Risks and mitigation**: possible issues, probability, impact, and countermeasures.
- **Key decisions**: choices already made and why.
- **Open questions**: unresolved high-risk questions.
- **Change log**: history of requirement changes.

## delivery.md structure

`delivery.md` starts with YAML frontmatter:

```yaml
---
spec-id: nebula-effect
version: 1.0.0
status: completed          # draft | completed
completed-at: 2024-07-14T16:20:00Z
---
```

The body contains:

- **Implementation**: architecture overview and key code logic.
- **Boundary conditions**: scenarios, handling, and verification results.
- **Testing and verification**: test-strategy statement plus manual/performance/regression results.
- **Code review**: a checklist reviewed item by item.
- **Known issues**: unresolved or deferred items.
- **Rollback plan**: how to undo the change.
- **Changed files**: list of added, modified, and removed files.

Bug-fix deliveries use a bug-fix variant: problem description, reproduction steps, root-cause analysis, fix, verification results, and regression tests.

## Questioning policy

The agent asks only when a requirement is **ambiguous and high-risk**, such as:

- Contradictory requirements.
- Unclear scope with large blast radius.
- Implicit technology choices with significant risk.
- Unverified assumptions.
- Undefined boundaries.

For clear tasks, defaults, or low-risk changes, it executes directly and you can adjust afterwards. Questioning exists to avoid rework, not to demonstrate rigor.

## The document is the state

Spec Kimi has no separate index, listener, or dashboard:

- Opening `spec.md` shows the current progress.
- Checking a box in the task checklist changes the status.
- When a human edits `spec.md`, the agent senses the change and continues.
- After implementation, the agent fills in `delivery.md` from its template.

## Using the CLI

Start a project session with:

```sh
spec-kimi
```

The agent decides whether to enter Plan mode based on your request. Clear, small tasks are executed directly; complex tasks generate a `spec.md` and `delivery.md` skeleton first and then request approval.

When Plan mode is needed the agent calls `EnterPlanMode`; you can also start in Plan mode with `--plan`. Do not use `-p` for implementation work that needs review: it is a non-interactive output interface and cannot present the approval step.

## Next steps

- [Getting started](./getting-started.md) — install the local package and begin a project session
- [Interaction and input](./interaction.md) — approval and Plan mode interaction details
- [Sessions and context](./sessions.md) — resume and export sessions
