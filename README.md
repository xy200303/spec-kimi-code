<div align="center">

<img src="assets/logo.svg" width="120" alt="Spec Kimi logo">

# Spec Kimi

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE) · [中文](README.zh-CN.md)

**A spec-driven fork of [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code).**

Spec Kimi keeps the upstream terminal agent foundation and changes the development model from an unstructured conversation into a traceable, spec-driven workflow.

The executable for this distribution is `spec-kimi`. It is intentionally different from the upstream `kimi` command so the two installations do not conflict.

</div>

---

## Install

Install from npm (Node.js >= 24.15.0 must be on `PATH`):

```sh
npm install -g @dev_xiaoyun/spec-kimi
spec-kimi --version
```

Do not use upstream `kimi` installers, Homebrew formulas, or the upstream npm package for this distribution.

## Differences from upstream kimi-code

Spec Kimi diverges from upstream in four main areas: branding, the spec-driven workflow, IDE integration, and agent capabilities.

### 1. Branding and executable name

- Upstream: `kimi`
- Spec Kimi: `spec-kimi`

The renamed binary lets you install both projects side-by-side without PATH conflicts. All package metadata, CLI help, and documentation reference `spec-kimi`.

### 2. Spec-driven workflow (enabled by default)

Upstream uses an open-ended chat model where each turn is independent. Spec Kimi turns development into a tracked, auditable spec run:

| | Upstream kimi-code | Spec Kimi |
|---|---|---|
| Default mode | Free-form conversation | Spec Coding enabled by default |
| Planning | Optional `/plan` command | Interactive sessions automatically consider Plan mode; `spec-kimi --plan` starts directly in Plan mode |
| Artifacts | System/session scoped | Project-local `specs/<name>/` directory |
| Required files | None | `spec.md` (requirements, design, task checklist, decisions) + `delivery.md` (delivery record) |
| Progress tracking | Implicit | `spec.md` task checklist is the source of truth; checking a box updates progress |
| Acceptance | Ad-hoc | Approval-gated plan review with acceptance criteria before execution |
| Delivery | None | Structured `delivery.md` with evidence, verification, and audit trail |

The normal Spec Kimi path is:

1. State the goal, constraints, scope, and acceptance criteria.
2. Prepare a reviewable `spec.md` and approve it.
3. Execute the task checklist from `spec.md`, checking off tasks to update progress.
4. Verify the result and fill in `delivery.md` from its template.

`spec-kimi -p` remains a non-interactive output interface. It cannot show or approve a plan, so it is not the workflow for an auditable development change.

### 3. Adaptive intent clarification

Spec Kimi extends the upstream questioning policy to run **both at the start of a task and whenever an unclear requirement arises mid-task**. If a user request is ambiguous, contradictory, missing scope, or introduces unverified assumptions, the agent asks decisive questions and presents a paraphrase for confirmation before continuing.

### 4. VS Code extension additions

The bundled VS Code extension adds project-local spec-run integration:

- A project-level entry point for spec runs.
- A resource view that lists active spec runs.
- An expandable spec-run document tree.
- Display of machine-readable delivery records.
- Auto-refresh of the spec-run view as tasks progress.

### 5. GenerateImage tool

Spec Kimi adds a built-in `GenerateImage` tool that calls an OpenAI-compatible `/images/generations` endpoint. It is configured through `config.toml`:

```toml
[services.image_generation]
base_url = "https://api.openai.com/v1"
api_key = "sk-xxxxxxxxxxxxxxxx"
```

The tool downloads generated images to the requested path, infers the correct file extension from the response, and enforces a 10 MiB size limit.

### 6. Development and contribution model

- This fork maintains its own `main` branch.
- `upstream/main` tracks [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code) and is merged in regularly.
- New work is done on feature branches and merged through the spec-driven workflow when appropriate.

## Spec Coding capabilities

- **Four modes**: direct execution (no spec), prototype spec, standard spec, and strict spec.
- **Project-local records**: spec runs write to `specs/<name>/` in the project root. The spec and delivery travel with the project instead of being hidden in a system directory.
- **The document is the state**: opening `spec.md` shows the current progress; checking a box in the task checklist updates status. There is no separate index or dashboard.
- **Question when risky**: the agent asks only when a requirement is ambiguous and high-risk, such as contradictions, unclear scope, implicit technology choices, unverified assumptions, or undefined boundaries. Clear or low-risk work is executed directly.
- **High code quality by default**: functions are documented, magic numbers are named, mature solutions are preferred, and files keep clear responsibilities and boundaries.

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
