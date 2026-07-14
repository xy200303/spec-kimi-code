# Spec Kimi CLI

> A spec-driven secondary development based on [xy200303/kimi-code](https://github.com/xy200303/kimi-code/tree/feature/spec-coding-tool).

This package retains the upstream Kimi Code CLI foundation while making the interactive development path specification-first. Its executable is `spec-kimi`, not `kimi`.

## Local distribution only

Do not use upstream installers, Homebrew formulas, or upstream npm registry commands for this distribution. Install the `.tgz` artifact produced by this project instead:

```sh
npm install -g /absolute/path/to/spec-kimi-<version>.tgz
spec-kimi --version
```

Node.js 24.15.0 or later must be available on `PATH`. The package name remains compatible with the upstream workspace for build purposes; the artifact and `spec-kimi` binary identify this distribution.

## Spec-first workflow

Running `spec-kimi` interactively enables Spec Coding, and the agent chooses whether to enter Plan mode for each task. When a task needs planning, the workflow captures a goal and constraints, produces a `spec.md`, approves it as the run's source of truth, executes the task checklist while checking off progress, and fills in `delivery.md` after verification.

Each spec run stores `spec.md` and `delivery.md` under `specs/<name>/` in the project root.

`spec-kimi -p` is a non-interactive output interface. It cannot present an approval flow and is not a substitute for the interactive, auditable development workflow.

## Capabilities

- Four modes: direct execution, prototype spec, standard spec, and strict spec.
- Project-local `spec.md` + `delivery.md` records; the document is the state.
- Questioning only when a requirement is ambiguous and high-risk.
- High code-quality defaults: documented functions, named constants, clear boundaries, and mature reuse.

See the repository [Spec Coding guide](../../docs/en/guides/spec-coding.md) for the workflow and artifacts.

## Upstream and license

Upstream installation channels and documentation refer to the upstream product, not this distribution. This package is released under the MIT license.
