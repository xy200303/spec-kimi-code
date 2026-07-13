# Getting started

## What is Spec Kimi

Spec Kimi is a secondary development based on Kimi Code. It is a terminal AI agent for software work, with a spec-driven lifecycle for implementation, bug fixes, refactors, review, and release work: establish the intended result, inspect and review a plan, approve the scope, execute traceable tasks, then deliver verified evidence.

The executable is `spec-kimi`, deliberately separate from the upstream `kimi` command. The CLI is written in TypeScript and runs on Node.js.

## Installation

This distribution is installed from the `.tgz` artifact produced by this project. Do not use upstream install scripts, Homebrew formulas, or upstream package-registry commands: they install the upstream product rather than Spec Kimi.

::: tip Before you install
Spec Kimi is a fully interactive TUI application. For the best visual experience, use a terminal with true-color and ligature support, such as [Kitty](https://sw.kovidgoyal.net/kitty/) or [Ghostty](https://ghostty.org/).
:::

### Local package installation

Node.js 22.19.0 or later and the local artifact are required:

```sh
node --version
npm install -g /absolute/path/to/spec-kimi-<version>.tgz
spec-kimi --version
```

On Windows, install [Git for Windows](https://gitforwindows.org/) before first launch. Spec Kimi uses the bundled Git Bash as its shell environment; if Git Bash is installed in a custom location, set `KIMI_SHELL_PATH` to the absolute path of `bash.exe`.

::: warning Note
The package artifact is the distribution boundary for this secondary development. A package or installer from an upstream channel does not include the Spec Coding behavior described here.
:::

## Upgrade and uninstall

Install the next locally delivered `.tgz` artifact to upgrade. To remove this local package:

```sh
npm uninstall -g @moonshot-ai/kimi-code
```

## First launch

Open the project you want to work on and run `spec-kimi`:

```sh
cd your-project
spec-kimi
```

Interactive sessions always enable Spec Coding and start in Plan mode. Describe the outcome, scope, constraints, and acceptance criteria; the agent creates project-local documents under `specs/<run-id>/` for review before implementation.

Use `-c` to continue the previous session for the working directory:

```sh
spec-kimi -c
```

Use `-p` only for non-interactive output such as exploration or a summary:

```sh
spec-kimi -p "Summarize this repository's directories"
```

`-p` cannot present a plan for review or collect approvals. Use the interactive workflow for a code change that needs an auditable delivery.

On first launch, enter `/login` to configure a provider. `/login` supports Kimi Code OAuth and Kimi Platform API keys. To use another provider, configure `~/.kimi-code/config.toml`; see [Providers and models](../configuration/providers.md).

## Your first spec-driven task

Start with a concrete outcome and boundaries, for example:

```
Add a function in src/utils that converts a string to kebab-case. Keep the public API unchanged, add focused tests, and show the verification evidence before finalizing.
```

Review the generated `spec.md` and `design.md` in `specs/<run-id>/`. After approval, the run executes task-scoped work and produces `delivery.md` plus machine-readable `delivery.json`. See [Spec-driven development](./spec-coding.md) for the complete lifecycle and record layout.

## Common commands and keyboard shortcuts

Use `/help` for the built-in command and shortcut panel. The most useful controls are:

| Control | Description |
| --- | --- |
| `/new` | Start a new session |
| `/sessions` | Browse and resume session history |
| `/model` | Switch the current model |
| `/compact` | Compress the current context |
| `Esc` | Interrupt output or close a popup |
| `Ctrl-C` | Interrupt output; press twice while idle to exit |
| `Shift-Tab` | Toggle Plan mode |

## Where data is stored

User-level configuration, sessions, logs, and update cache are stored under `~/.kimi-code/` by default and can be moved with `KIMI_CODE_HOME`. Spec Coding records are separate by design: they stay in the project root at `specs/<run-id>/`, so they can be reviewed with the source tree.

## Next steps

- [Spec-driven development](./spec-coding.md) — the specification, approval, execution, evidence, and delivery lifecycle
- [Interaction and input](./interaction.md) — approvals, Plan mode, and YOLO mode
- [Sessions and context](./sessions.md) — resume, compact, and export sessions
