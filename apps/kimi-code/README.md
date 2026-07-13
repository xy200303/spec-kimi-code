# Spec Kimi CLI

> A spec-driven secondary development based on [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code).

This package retains the upstream Kimi Code CLI foundation while making the interactive development path specification-first. Its executable is `spec-kimi`, not `kimi`.

## Local distribution only

Do not use upstream installers, Homebrew formulas, or upstream npm registry commands for this distribution. Install the `.tgz` artifact produced by this project instead:

```sh
npm install -g /absolute/path/to/spec-kimi-<version>.tgz
spec-kimi --version
```

Node.js 22.19.0 or later must be available on `PATH`. The package name remains compatible with the upstream workspace for build purposes; the artifact and `spec-kimi` binary identify this distribution.

## Spec-first workflow

Running `spec-kimi` interactively enables Spec Coding and enters Plan mode by default. The workflow captures a goal and constraints, produces a specification and design, locks the approved snapshot, executes task-scoped changes, validates evidence, and finalizes a delivery record.

Each run stores `spec.md`, `design.md`, `delivery.md`, and `delivery.json` under `specs/<run-id>/` in the project root. The delivery record links tasks, changes, approvals, risks, quality-gate evidence, decisions, open questions, and rollback notes.

`spec-kimi -p` is a non-interactive output interface. It cannot present an approval flow and is not a substitute for the interactive, auditable development workflow.

## Capabilities

- Strategy routing for planning, MVP work, controlled features, bug diagnosis, refactoring, review, release, and research.
- Risk-aware task permissions and an approval audit trail.
- Quality gates: `fast`, `standard`, `strict`, and `release`.
- Markdown and JSON delivery records, finalized to prevent silent changes after completion.

See the repository [Spec Coding guide](../../docs/en/guides/spec-coding.md) for the workflow and artifacts.

## Upstream and license

Upstream installation channels and documentation refer to the upstream product, not this distribution. This package is released under the MIT license.
