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

Interactive `spec-kimi` sessions always enable Spec Coding, and the agent decides whether to enter Plan mode for each task. `spec-kimi --plan` starts an interactive session already in Plan mode. The normal development path is:

1. State the goal, constraints, scope, and acceptance criteria (enter Plan mode when needed).
2. Prepare a reviewable `spec.md` and use it as the source of truth for the run after approval.
3. Execute the task checklist from `spec.md`, checking off tasks to update progress.
4. Verify the result and fill in `delivery.md` from its template.

`spec-kimi -p` remains a non-interactive output interface. It cannot show or approve a plan, so it is not the workflow for an auditable development change.

## Spec Coding capabilities

- **Project-local records**: spec runs write to `specs/<name>/` in the project root and contain only `spec.md` (requirements, design, task checklist, decisions) and `delivery.md` (delivery record). The spec and delivery travel with the project instead of being hidden in a system directory.
- **The document is the state**: opening `spec.md` shows the current progress; checking a box in the task checklist updates status. There is no separate index or dashboard.
- **Question when risky**: the agent asks only when a requirement is ambiguous and high-risk, such as contradictions, unclear scope, implicit technology choices, unverified assumptions, or undefined boundaries. Clear or low-risk work is executed directly.
- **High code quality by default**: functions are documented, magic numbers are named, mature solutions are preferred, and files keep clear responsibilities and boundaries.
- **Four modes**: direct execution (no spec), prototype spec, standard spec, and strict spec.

## Quick start

Open a project and start the interactive workflow:

```sh
cd your-project
spec-kimi
```

Describe the desired outcome and constraints. Review the files under `specs/<name>/` before approving implementation. See the in-repository [Spec Coding guide](docs/en/guides/spec-coding.md) for the full workflow and artifact layout.

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
