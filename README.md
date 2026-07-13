# Spec Kimi

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE) · [中文](README.zh-CN.md)

Spec Kimi is a secondary development based on [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code). It keeps the upstream terminal agent foundation and changes the development model from an unstructured conversation into a traceable, spec-driven workflow.

The executable for this distribution is `spec-kimi`. It is intentionally different from the upstream `kimi` command so the two installations do not conflict.

## Distribution

This repository does not provide upstream download links, Homebrew commands, or upstream registry installation commands. Install only the `.tgz` artifact produced by this project:

```sh
npm install -g /absolute/path/to/spec-kimi-<version>.tgz
spec-kimi --version
```

The Node.js runtime must be available on `PATH` before running the command. The package is intended for local or controlled distribution; do not substitute an upstream package or installer for this artifact.

## What changes in this distribution

Interactive `spec-kimi` sessions always enable Spec Coding and start in Plan mode. `spec-kimi --plan` is an explicit equivalent, not a separate development mode. This makes the normal development path:

1. State the goal, constraints, scope, and acceptance criteria.
2. Inspect the project and prepare a specification and design for review.
3. Approve a stable snapshot before implementation.
4. Execute traceable tasks with risk-aware approvals and recorded changes.
5. Verify the result and finalize a delivery record with evidence.

`spec-kimi -p` remains a non-interactive output interface. It cannot show or approve a plan, so it is not the workflow for an auditable development change.

## Spec Coding capabilities

- **Project-local records**: every run writes to `specs/<run-id>/` in the project root. The directory contains `spec.md`, `design.md`, `delivery.md`, and machine-readable `delivery.json`, so the design and evidence travel with the project instead of being hidden in a system directory.
- **Goal and approval locking**: the approved specification and design are snapshotted before execution. Later drift is detected rather than silently changing the agreed target.
- **Strategy routing**: the development strategy router selects an approach such as controlled feature work, bug diagnosis, refactoring, review, release, research, planning, or an MVP. The selected strategy records its reason, required task categories, and recommended quality gate.
- **Traceable execution**: tasks have a purpose, state, risk level, changed paths, commands, and delegated work traces. Tool changes can be attributed to the active task.
- **Risk-aware controls**: low-, medium-, and high-risk tasks use different approval requirements. Approval decisions remain part of the run record.
- **Evidence-based delivery**: `fast`, `standard`, `strict`, and `release` quality gates require progressively stronger evidence. A complete delivery records the goal, constraints, plan, tasks, changes, evidence, decisions, risks, open questions, and rollback notes.
- **Finalization**: finalized delivery records are locked so later work cannot silently rewrite the completed audit trail.

## Quick start

Open a project and start the interactive workflow:

```sh
cd your-project
spec-kimi
```

Describe the desired outcome and constraints. Review the files under `specs/<run-id>/` before approving implementation. See the in-repository [Spec Coding guide](docs/en/guides/spec-coding.md) for the full workflow and artifact layout.

## Development

Requirements: Node.js >= 24.15.0 and pnpm 10.33.0.

```sh
pnpm install
pnpm --dir apps/kimi-code run dev
pnpm --filter @moonshot-ai/kimi-code run typecheck
```

## Upstream and license

Spec Kimi is derived from [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code). Upstream product documentation and installation channels describe the upstream product, not this distribution.

Released under the [MIT License](LICENSE).
